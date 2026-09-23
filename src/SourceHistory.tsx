import { useState } from "react";
import { ChevronDown, History, Loader2 } from "lucide-react";
import type { Snapshot } from "../shared/types";
import { api, date } from "./api";

export function SourceHistory({
  sourceId,
  currentHash,
}: {
  sourceId: string;
  currentHash?: string;
}) {
  const [opened, setOpened] = useState(false);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function load(more = false) {
    setBusy(true);
    setError("");
    try {
      const result = await api<{
        snapshots: Snapshot[];
        nextCursor: string | null;
      }>(
        `/sources/${sourceId}/history?limit=10${more && cursor ? `&before=${encodeURIComponent(cursor)}` : ""}`,
      );
      setSnapshots((previous) =>
        more
          ? [
              ...previous,
              ...result.snapshots.filter(
                (item) => !previous.some((saved) => saved.id === item.id),
              ),
            ]
          : result.snapshots,
      );
      setCursor(result.nextCursor);
      setLoaded(true);
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="source-history">
      <button
        className="history-toggle"
        aria-expanded={opened}
        onClick={() => {
          setOpened((value) => !value);
          if (!opened && !loaded) void load();
        }}
      >
        <History size={17} />
        <span>Capture history</span>
        <small>Inspect earlier versions</small>
        <ChevronDown size={17} />
      </button>
      {opened && (
        <div className="history-content">
          {error && (
            <div className="inline-error" role="alert">
              {error}
              <button className="text-button" onClick={() => load()}>
                Try again
              </button>
            </div>
          )}
          {snapshots.map((snapshot, index) => (
            <details className="history-entry" key={snapshot.id}>
              <summary>
                <span>{date(snapshot.capturedAt)}</span>
                <span className="tiny-pill">
                  {snapshot.provider === "fixture"
                    ? "DEMO"
                    : snapshot.provider.toUpperCase()}
                </span>
                <code>{snapshot.hash.slice(0, 12)}</code>
                {index === 0 && snapshot.hash === currentHash && (
                  <span className="tiny-pill green">CURRENT CONTENT</span>
                )}
              </summary>
              <pre>{snapshot.content}</pre>
              <p className="hash-row">
                <span>SHA-256</span>
                <code>{snapshot.hash}</code>
              </p>
            </details>
          ))}
          {busy && (
            <p className="small-text" role="status">
              <Loader2 className="spin" size={16} />
              Loading capture history...
            </p>
          )}
          {loaded && !busy && !snapshots.length && !error && (
            <p>No archived captures are available yet.</p>
          )}
          {cursor && (
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => load(true)}
            >
              Load older captures
            </button>
          )}
          <p className="field-help">
            Earlier captures are preserved for investigation. Reviewing a
            historical version does not approve the current evidence.
          </p>
        </div>
      )}
    </section>
  );
}
