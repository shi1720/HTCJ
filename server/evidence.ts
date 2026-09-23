import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
import type {
  EvidenceSource,
  Issue,
  LabReport,
  Mission,
} from "../shared/types";

export function hashContent(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

/** Stable JSON encoding: sorted object keys, preserved array order, finite JSON values only. */
export function canonicalJson(value: unknown): string {
  const ancestors = new Set<object>();
  function encode(item: unknown): string {
    if (item === null || typeof item === "string" || typeof item === "boolean")
      return JSON.stringify(item);
    if (typeof item === "number" && Number.isFinite(item))
      return JSON.stringify(item);
    if (typeof item !== "object" || item === null)
      throw new Error("Manifest contains a non-JSON value.");
    if (ancestors.has(item))
      throw new Error("Manifest contains a circular reference.");
    if (
      !Array.isArray(item) &&
      Object.getPrototypeOf(item) !== Object.prototype &&
      Object.getPrototypeOf(item) !== null
    ) {
      throw new Error("Manifest requires plain JSON objects.");
    }
    ancestors.add(item);
    const encoded = Array.isArray(item)
      ? `[${Array.from(item, encode).join(",")}]`
      : `{${Object.keys(item)
          .sort()
          .map(
            (key) =>
              `${JSON.stringify(key)}:${encode((item as Record<string, unknown>)[key])}`,
          )
          .join(",")}}`;
    ancestors.delete(item);
    return encoded;
  }
  return encode(value);
}

export function hashManifest(value: unknown): string {
  return hashContent(canonicalJson(value));
}

/** Conservative evidence state; readiness is documentary review, never flight authorization. */
export function assessMission(
  mission: Pick<Mission, "sourceIds" | "approval"> &
    Partial<Pick<Mission, "scheduledAt">>,
  sources: EvidenceSource[],
  now = new Date(),
): Mission["assessment"] {
  const issues: Issue[] = [];
  const add = (sourceId: string, code: Issue["code"], message: string) =>
    issues.push({ sourceId, code, message });
  const nowMs = now.getTime();
  if (!Number.isFinite(nowMs))
    throw new Error("Assessment time must be valid.");
  if (!mission.sourceIds.length)
    add(
      "coverage",
      "missing",
      "No required evidence sources have been selected.",
    );
  const required = new Set(mission.sourceIds);
  for (const id of required) {
    const source = sources.find((item) => item.id === id);
    if (!source) {
      add(id, "missing", "A required evidence source is missing.");
      continue;
    }
    if (source.lastError)
      add(
        id,
        "unavailable",
        "Latest capture failed. Refresh and verify the source before proceeding.",
      );
    const snapshot = source.latest;
    if (!snapshot || !snapshot.content.trim() || !snapshot.hash) {
      add(id, "missing", `${source.title}: no usable captured evidence.`);
      continue;
    }
    if (hashContent(snapshot.content) !== snapshot.hash) {
      add(
        id,
        "unavailable",
        `${source.title}: snapshot integrity check failed.`,
      );
    }
    if (source.kind === "record") {
      const prefix = `OPERATOR-SUPPLIED RECORD — NOT INDEPENDENTLY VERIFIED\nReference: ${source.reference}\nValid until: ${source.validUntil ?? "Not specified; configured freshness applies"}\n\n`;
      if (
        snapshot.provider !== "manual" ||
        !source.reference?.trim() ||
        !snapshot.content.startsWith(prefix)
      ) {
        add(
          id,
          "unavailable",
          `${source.title}: record metadata does not match its captured evidence.`,
        );
      }
    }
    const captured = Date.parse(snapshot.capturedAt);
    const age = nowMs - captured;
    if (
      !Number.isFinite(captured) ||
      age < 0 ||
      !Number.isFinite(source.freshnessHours) ||
      source.freshnessHours <= 0 ||
      age >= source.freshnessHours * 3_600_000
    ) {
      add(
        id,
        "stale",
        `${source.title}: evidence is expired or its capture time cannot be trusted.`,
      );
    }
    if (source.validUntil !== undefined && source.validUntil !== null) {
      const expires = Date.parse(source.validUntil);
      if (!Number.isFinite(expires) || expires <= nowMs) {
        add(
          id,
          "stale",
          `${source.title}: the operator-supplied record validity has expired or is invalid.`,
        );
      } else if (mission.scheduledAt !== undefined) {
        const scheduled = Date.parse(mission.scheduledAt);
        if (!Number.isFinite(scheduled) || expires <= scheduled) {
          add(
            id,
            "stale",
            `${source.title}: the record does not remain valid through the planned mission time.`,
          );
        }
      }
    }
    const reviewedCurrent = source.reviewedHash === snapshot.hash;
    if (reviewedCurrent && source.reviewDecision === "blocked")
      add(
        id,
        "blocked",
        `${source.title}: reviewer recorded a blocking condition.`,
      );
    if (!reviewedCurrent || !source.reviewDecision) {
      if (source.reviewedHash && source.reviewedHash !== snapshot.hash) {
        add(
          id,
          "changed",
          `${source.title}: content changed after its last review.`,
        );
      } else {
        add(
          id,
          "unreviewed",
          `${source.title}: current evidence needs human review.`,
        );
      }
    }
    if (mission.approval && mission.approval.hashes[id] !== snapshot.hash) {
      if (
        !issues.some(
          (issue) => issue.sourceId === id && issue.code === "changed",
        )
      )
        add(
          id,
          "changed",
          `${source.title}: mission approval does not cover the current evidence.`,
        );
    }
  }
  if (mission.approval) {
    for (const id of Object.keys(mission.approval.hashes)) {
      if (!required.has(id))
        add(id, "changed", "Evidence coverage changed after mission approval.");
    }
    const approvedAt = Date.parse(mission.approval.at);
    if (!Number.isFinite(approvedAt) || approvedAt > nowMs)
      add("approval", "changed", "Mission approval time is invalid.");
  }
  const held = issues.some((issue) =>
    ["missing", "stale", "blocked", "unavailable"].includes(issue.code),
  );
  return {
    status: held
      ? "hold"
      : issues.length
        ? "review"
        : mission.approval
          ? "ready"
          : "draft",
    issues,
  };
}

/** Runs real rule calls with explicit expected outputs; all data here is a labeled simulation. */
export function runLab(): LabReport {
  const started = performance.now();
  const now = new Date();
  const content =
    "Synthetic site notice: access is available only after operator review.";
  const hash = hashContent(content);
  const source: EvidenceSource = {
    id: "lab-source",
    title: "Synthetic source",
    url: "https://www.faa.gov/uas",
    category: "site-access",
    siteId: null,
    freshnessHours: 24,
    latest: {
      id: "v1",
      hash,
      content,
      capturedAt: new Date(now.getTime() - 60_000).toISOString(),
      provider: "fixture",
    },
    previous: null,
    reviewedHash: hash,
    reviewDecision: "accepted",
    reviewNote: "Synthetic test review",
    reviewedBy: "Lab",
    reviewedAt: new Date(now.getTime() - 30_000).toISOString(),
    lastError: null,
    updatedAt: now.toISOString(),
    fixture: true,
  };
  const mission: Pick<Mission, "sourceIds" | "approval"> = {
    sourceIds: [source.id],
    approval: {
      id: "lab-approval",
      actor: "Lab",
      at: now.toISOString(),
      note: "Synthetic test approval",
      hashes: { [source.id]: hash },
    },
  };
  const changedContent = "Synthetic site notice: site access is suspended.";
  const changed = {
    ...source,
    latest: {
      ...source.latest!,
      id: "v2",
      content: changedContent,
      hash: hashContent(changedContent),
    },
  };
  const cases: { name: string; expected: string; run: () => string }[] = [
    {
      name: "Reviewed evidence + exact approval",
      expected: "ready",
      run: () => assessMission(mission, [source], now).status,
    },
    {
      name: "Missing required source",
      expected: "hold:missing",
      run: () => {
        const r = assessMission(mission, [], now);
        return `${r.status}:${r.issues[0].code}`;
      },
    },
    {
      name: "Expired capture blocks approval",
      expected: "hold",
      run: () =>
        assessMission(
          mission,
          [
            {
              ...source,
              latest: {
                ...source.latest!,
                capturedAt: new Date(now.getTime() - 86_400_000).toISOString(),
              },
            },
          ],
          now,
        ).status,
    },
    {
      name: "Source change invalidates bound approval",
      expected: "review",
      run: () => assessMission(mission, [changed], now).status,
    },
    {
      name: "Reviewing changed content requires new mission approval",
      expected: "review",
      run: () =>
        assessMission(
          mission,
          [{ ...changed, reviewedHash: changed.latest.hash }],
          now,
        ).status,
    },
    {
      name: "Reviewer block takes precedence",
      expected: "hold",
      run: () =>
        assessMission(mission, [{ ...source, reviewDecision: "blocked" }], now)
          .status,
    },
    {
      name: "Provider failure holds cached evidence",
      expected: "hold",
      run: () =>
        assessMission(
          mission,
          [{ ...source, lastError: "Synthetic upstream outage" }],
          now,
        ).status,
    },
    {
      name: "Captured but unreviewed evidence",
      expected: "review",
      run: () =>
        assessMission(
          { ...mission, approval: null },
          [{ ...source, reviewedHash: null, reviewDecision: null }],
          now,
        ).status,
    },
    {
      name: "Valid review without approval remains draft",
      expected: "draft",
      run: () =>
        assessMission({ ...mission, approval: null }, [source], now).status,
    },
    {
      name: "Restored content cannot revive revoked approval",
      expected: "draft",
      run: () =>
        assessMission({ ...mission, approval: null }, [source], now).status,
    },
    {
      name: "Future timestamp fails closed",
      expected: "hold",
      run: () =>
        assessMission(
          mission,
          [
            {
              ...source,
              latest: {
                ...source.latest!,
                capturedAt: new Date(now.getTime() + 1).toISOString(),
              },
            },
          ],
          now,
        ).status,
    },
    {
      name: "Evidence tampering is detected",
      expected: "hold",
      run: () =>
        assessMission(
          mission,
          [{ ...source, latest: { ...source.latest!, content: "tampered" } }],
          now,
        ).status,
    },
    {
      name: "Empty required evidence cannot be ready",
      expected: "hold",
      run: () =>
        assessMission({ sourceIds: [], approval: null }, [], now).status,
    },
    {
      name: "Manifest digest is independent of object key order",
      expected: "true",
      run: () =>
        String(hashManifest({ b: 2, a: 1 }) === hashManifest({ a: 1, b: 2 })),
    },
    {
      name: "Manifest tampering changes digest",
      expected: "true",
      run: () =>
        String(hashManifest({ value: 1 }) !== hashManifest({ value: 2 })),
    },
  ];
  const results = cases.map((test) => {
    const start = performance.now();
    let actual: string;
    try {
      actual = test.run();
    } catch (error) {
      actual = error instanceof Error ? error.message : "Unexpected test error";
    }
    return {
      name: test.name,
      passed: actual === test.expected,
      expected: test.expected,
      actual,
      durationMs: Math.round((performance.now() - start) * 1000) / 1000,
    };
  });
  return {
    at: now.toISOString(),
    results,
    passed: results.filter((result) => result.passed).length,
    total: results.length,
    durationMs: Math.round((performance.now() - started) * 1000) / 1000,
  };
}
