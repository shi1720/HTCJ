import type { EvidenceSource } from "../shared/types.js";
import { appendAudit, getData, updateData, type Db } from "./db.js";
import {
  captureAndPersist,
  invalidateSourceApprovals,
  isCaptureInFlight,
  scheduleNextCapture,
} from "./capture.js";
import type { captureSource } from "./providers.js";

function candidates(db: Db, at: string) {
  // json_extract filters in SQLite rather than loading every archived snapshot or user into memory.
  return db
    .prepare(
      `SELECT id,tenant_id,data FROM sources WHERE json_extract(data,'$.fixture')=0 AND COALESCE(json_extract(data,'$.kind'),'')!='record' AND json_extract(data,'$.monitor.enabled')=1 AND json_extract(data,'$.monitor.nextCaptureAt')<=? ORDER BY json_extract(data,'$.monitor.nextCaptureAt') LIMIT 12`,
    )
    .all(at) as { id: string; tenant_id: string; data: string }[];
}
export function nextMonitorAt(db: Db): string | null {
  const row = db
    .prepare(
      `SELECT json_extract(data,'$.monitor.nextCaptureAt') AS next FROM sources WHERE json_extract(data,'$.fixture')=0 AND COALESCE(json_extract(data,'$.kind'),'')!='record' AND json_extract(data,'$.monitor.enabled')=1 ORDER BY json_extract(data,'$.monitor.nextCaptureAt') LIMIT 1`,
    )
    .get() as { next: string | null } | undefined;
  return row?.next ?? null;
}
export async function runDueCaptures(
  db: Db,
  options: { capture?: typeof captureSource; now?: Date; limit?: number } = {},
) {
  const now = options.now ?? new Date(),
    limit = Math.min(3, Math.max(1, options.limit ?? 3));
  const report = { attempted: 0, succeeded: 0, failed: 0 };
  for (const row of candidates(db, now.toISOString())) {
    if (report.attempted >= limit) break;
    const source = getData<EvidenceSource>(
      db,
      "sources",
      row.tenant_id,
      row.id,
    );
    if (
      !source?.monitor?.enabled ||
      !source.monitor.nextCaptureAt ||
      Date.parse(source.monitor.nextCaptureAt) > now.getTime() ||
      isCaptureInFlight(db, row.id)
    )
      continue;
    // Claim synchronously before awaiting network I/O. Other ticks observe the next due time.
    source.monitor = {
      ...source.monitor,
      lastAttemptAt: now.toISOString(),
      nextCaptureAt: new Date(
        now.getTime() + Math.max(1, source.monitor.intervalHours) * 3600000,
      ).toISOString(),
    };
    updateData(db, "sources", row.tenant_id, source);
    report.attempted++;
    try {
      const result = await captureAndPersist(
        db,
        row.tenant_id,
        row.id,
        source.monitor.provider,
        "Scheduled monitor",
        { capture: options.capture, now },
      );
      if (result.ok) report.succeeded++;
      else report.failed++;
    } catch (error) {
      report.failed++;
      // Capacity and integrity failures must not silently leave a previous signature ready.
      db.transaction(() => {
        const current = getData<EvidenceSource>(
          db,
          "sources",
          row.tenant_id,
          row.id,
        );
        if (!current) return;
        current.lastError = (
          error instanceof Error ? error.message : "Scheduled capture failed."
        ).slice(0, 300);
        current.updatedAt = now.toISOString();
        scheduleNextCapture(current, false, now);
        updateData(db, "sources", row.tenant_id, current);
        invalidateSourceApprovals(
          db,
          row.tenant_id,
          current.id,
          "Scheduled monitor",
          "Scheduled evidence capture failed.",
        );
        appendAudit(
          db,
          row.tenant_id,
          "Scheduled monitor",
          "monitor.failed",
          current.title,
          current.lastError,
          current.id,
        );
      })();
    }
  }
  return report;
}
