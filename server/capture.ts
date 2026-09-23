import type { EvidenceSource, Mission, Provider } from "../shared/types.js";
import { appendAudit, getData, listData, updateData, type Db } from "./db.js";
import { captureSource } from "./providers.js";
import { makeSnapshot, saveSnapshot } from "./seed.js";
import { reserveAnakinCapture } from "./provider-budget.js";
import { fail } from "./errors.js";

const activeByDatabase = new WeakMap<
  Db,
  { global: number; tenants: Map<string, number>; sources: Map<string, number> }
>();
function activity(db: Db) {
  let active = activeByDatabase.get(db);
  if (!active) {
    active = { global: 0, tenants: new Map(), sources: new Map() };
    activeByDatabase.set(db, active);
  }
  return active;
}
export function isCaptureInFlight(db: Db, sourceId: string): boolean {
  return (activity(db).sources.get(sourceId) ?? 0) > 0;
}
export function invalidateSourceApprovals(
  db: Db,
  tenant: string,
  sourceId: string,
  actor: string,
  reason: string,
) {
  for (const mission of listData<Mission>(db, "missions", tenant)) {
    if (!mission.sourceIds.includes(sourceId)) continue;
    if (mission.approval) {
      appendAudit(
        db,
        tenant,
        actor,
        "mission.invalidated",
        mission.name,
        `${reason} Previous approval ${mission.approval.id} is no longer valid.`,
        mission.id,
      );
      mission.approval = null;
    }
    mission.revision = (mission.revision ?? 0) + 1;
    updateData(db, "missions", tenant, mission);
    db.prepare(
      "UPDATE missions SET invalidated=1 WHERE tenant_id=? AND id=?",
    ).run(tenant, mission.id);
  }
}
export function scheduleNextCapture(
  source: EvidenceSource,
  successful: boolean,
  now = new Date(),
) {
  if (!source.monitor?.enabled) return;
  const hours = successful
    ? source.monitor.intervalHours
    : Math.max(
        source.monitor.intervalHours,
        Math.min(24, source.monitor.intervalHours * 2),
      );
  source.monitor = {
    ...source.monitor,
    lastAttemptAt: now.toISOString(),
    nextCaptureAt: new Date(now.getTime() + hours * 3600000).toISOString(),
  };
}
export type CaptureResult =
  | { ok: true; source: EvidenceSource }
  | { ok: false; source: EvidenceSource; error: string; statusCode: 429 | 502 };
export async function captureAndPersist(
  db: Db,
  tenant: string,
  sourceId: string,
  provider: "direct" | "anakin",
  actor: string,
  options: { capture?: typeof captureSource; now?: Date } = {},
): Promise<CaptureResult> {
  const sourceFor = () =>
    getData<EvidenceSource>(db, "sources", tenant, sourceId) ??
    fail(404, "Evidence source not found.");
  const initial = sourceFor();
  if (initial.kind === "record")
    fail(
      400,
      "Operator-supplied records must be updated by their owner; they cannot be fetched from the web.",
    );
  if (initial.fixture)
    fail(
      400,
      "Fixture evidence changes through the demonstration drill. Add a public source to use live capture.",
    );
  const active = activity(db),
    tenantActive = active.tenants.get(tenant) ?? 0;
  if (tenantActive >= 2 || active.global >= 8)
    fail(
      429,
      "Capture capacity is busy. Wait for the current captures to finish.",
    );
  assertArchiveCapacity(db, tenant);
  if (provider === "anakin" && !reserveAnakinCapture(db, tenant, options.now)) {
    return db.transaction(() => {
      const source = sourceFor(),
        now = options.now ?? new Date();
      const message =
        "Anakin daily capture allowance reached (shared deployment limit or 3 per demo workspace). Retry after the next UTC day or explicitly choose Direct capture.";
      source.lastError = message;
      source.updatedAt = now.toISOString();
      scheduleNextCapture(source, false, now);
      if (source.monitor?.enabled) {
        const reset = new Date(now);
        reset.setUTCHours(24, 0, 0, 0);
        if (
          !source.monitor.nextCaptureAt ||
          Date.parse(source.monitor.nextCaptureAt) < reset.getTime()
        )
          source.monitor.nextCaptureAt = reset.toISOString();
      }
      updateData(db, "sources", tenant, source);
      invalidateSourceApprovals(
        db,
        tenant,
        source.id,
        actor,
        "Anakin capture allowance exhausted.",
      );
      appendAudit(
        db,
        tenant,
        actor,
        "source.capture_limited",
        source.title,
        message,
        source.id,
      );
      return {
        ok: false as const,
        source,
        error: message,
        statusCode: 429 as const,
      };
    })();
  }
  active.tenants.set(tenant, tenantActive + 1);
  active.sources.set(sourceId, (active.sources.get(sourceId) ?? 0) + 1);
  active.global++;
  let result: { content: string };
  try {
    result = await (options.capture ?? captureSource)(initial.url, provider);
    if (!result.content.trim() || result.content.length > 200000)
      throw new Error(
        "Captured content is empty or exceeds the evidence size limit.",
      );
  } catch (error) {
    const message = (
      error instanceof Error ? error.message : "Source capture failed."
    ).slice(0, 300);
    return db.transaction(() => {
      const current = sourceFor();
      if (current.latest?.id !== initial.latest?.id)
        fail(
          409,
          "Evidence changed while capture was in progress. Refresh and retry.",
        );
      const now = options.now ?? new Date();
      current.lastError = message;
      current.updatedAt = now.toISOString();
      scheduleNextCapture(current, false, now);
      updateData(db, "sources", tenant, current);
      invalidateSourceApprovals(
        db,
        tenant,
        current.id,
        actor,
        "Evidence capture failed.",
      );
      appendAudit(
        db,
        tenant,
        actor,
        "source.capture_failed",
        current.title,
        `${provider}: ${message}`,
        current.id,
      );
      return {
        ok: false as const,
        source: current,
        error: message,
        statusCode: 502 as const,
      };
    })();
  } finally {
    active.global--;
    const remaining = (active.tenants.get(tenant) ?? 1) - 1;
    if (remaining) active.tenants.set(tenant, remaining);
    else active.tenants.delete(tenant);
    const sourceRemaining = (active.sources.get(sourceId) ?? 1) - 1;
    if (sourceRemaining) active.sources.set(sourceId, sourceRemaining);
    else active.sources.delete(sourceId);
  }
  return db.transaction(() => {
    const current = sourceFor();
    if (current.latest?.id !== initial.latest?.id)
      fail(
        409,
        "Evidence changed while capture was in progress. Refresh and retry.",
      );
    const currentSource = commitSnapshot(
      db,
      tenant,
      current,
      result.content,
      provider,
      actor,
      { now: options.now },
    );
    return { ok: true as const, source: currentSource };
  })();
}

/** Common transactional snapshot transition for live captures and explicit operator record updates. */
export function commitSnapshot(
  db: Db,
  tenant: string,
  current: EvidenceSource,
  content: string,
  provider: Provider,
  actor: string,
  options: { now?: Date; forceReview?: boolean } = {},
): EvidenceSource {
  const now = options.now ?? new Date(),
    snapshot = makeSnapshot(content, provider, now.toISOString()),
    changed = current.latest?.hash !== snapshot.hash;
  const previousAge = current.latest
    ? now.getTime() - Date.parse(current.latest.capturedAt)
    : 0;
  if (
    current.latest &&
    (!Number.isFinite(previousAge) ||
      previousAge < 0 ||
      previousAge >= current.freshnessHours * 3600000)
  )
    invalidateSourceApprovals(
      db,
      tenant,
      current.id,
      actor,
      "Evidence expired before this refresh.",
    );
  if (changed || options.forceReview) {
    invalidateSourceApprovals(
      db,
      tenant,
      current.id,
      actor,
      "Source content or operator record changed.",
    );
    current.reviewedHash = null;
    current.reviewDecision = null;
    current.reviewNote = null;
    current.reviewedBy = null;
    current.reviewedAt = null;
  }
  current.previous = current.latest;
  current.latest = snapshot;
  current.lastError = null;
  current.updatedAt = now.toISOString();
  scheduleNextCapture(current, true, now);
  updateData(db, "sources", tenant, current);
  saveSnapshot(db, tenant, current.id, snapshot);
  appendAudit(
    db,
    tenant,
    actor,
    "source.captured",
    current.title,
    `${provider} capture; SHA-256 ${snapshot.hash}; ${changed || options.forceReview ? "human review required" : "content unchanged"}.`,
    current.id,
  );
  return current;
}
export function assertArchiveCapacity(db: Db, tenant: string) {
  const storage = db
    .prepare(
      "SELECT COALESCE(SUM(length(data)),0) AS bytes, COUNT(*) AS count FROM snapshots WHERE tenant_id=?",
    )
    .get(tenant) as { bytes: number; count: number };
  if (storage.bytes >= 100 * 1024 * 1024 || storage.count >= 10000)
    fail(
      409,
      "Evidence archive capacity reached. Export your records and contact the workspace administrator.",
    );
}
