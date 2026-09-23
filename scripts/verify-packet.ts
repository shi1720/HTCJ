/** Offline verifier. Integrity checks do not establish publisher authenticity or flight permission. */
import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { assessMission } from "../server/evidence.js";

const sha256 = (text: string) =>
  createHash("sha256").update(text, "utf8").digest("hex");
// Kept independent of the export encoder so the verifier exercises the documented format.
export function canonicalize(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return JSON.stringify(value);
  if (typeof value === "number" && Number.isFinite(value))
    return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (
    typeof value === "object" &&
    value &&
    Object.getPrototypeOf(value) === Object.prototype
  ) {
    return `{${Object.keys(value)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${canonicalize((value as Record<string, unknown>)[key])}`,
      )
      .join(",")}}`;
  }
  throw new Error("Packet contains a non-JSON value.");
}
const id = z.uuid(),
  hash = z.string().regex(/^[a-f0-9]{64}$/),
  stamp = z.iso.datetime({ offset: true }),
  short = z.string().max(2000);
const snapshot = z
  .object({
    id,
    hash,
    content: z.string().min(1).max(200000),
    capturedAt: stamp,
    provider: z.enum(["fixture", "direct", "anakin", "manual"]),
  })
  .strict();
const source = z
  .object({
    id,
    title: short,
    url: short,
    category: z.enum([
      "site-access",
      "airspace",
      "insurance",
      "operating-policy",
    ]),
    siteId: id.nullable(),
    freshnessHours: z.number().positive().max(8760),
    latest: snapshot.nullable(),
    previous: snapshot.nullable(),
    reviewedHash: hash.nullable(),
    reviewDecision: z.enum(["accepted", "blocked"]).nullable(),
    reviewNote: short.nullable(),
    reviewedBy: short.nullable(),
    reviewedAt: stamp.nullable(),
    lastError: short.nullable(),
    updatedAt: stamp,
    fixture: z.boolean(),
    kind: z.literal("record").optional(),
    reference: z.string().max(300).optional(),
    validUntil: stamp.nullable().optional(),
    monitor: z
      .object({
        enabled: z.boolean(),
        intervalHours: z.number().int().min(1).max(168),
        provider: z.enum(["direct", "anakin"]),
        nextCaptureAt: stamp.nullable(),
        lastAttemptAt: stamp.nullable(),
      })
      .strict()
      .optional(),
  })
  .strict();
const approval = z
  .object({
    id,
    actor: short,
    at: stamp,
    note: short,
    hashes: z.record(id, hash),
  })
  .strict();
const issue = z
  .object({
    sourceId: z.string().max(100),
    code: z.enum([
      "missing",
      "stale",
      "changed",
      "blocked",
      "unreviewed",
      "unavailable",
    ]),
    message: short,
  })
  .strict();
const mission = z
  .object({
    id,
    revision: z.number().int().nonnegative().optional(),
    name: short,
    client: short,
    siteId: id,
    scheduledAt: stamp,
    value: z.number().finite().nonnegative(),
    sourceIds: z.array(id).min(1).max(50),
    approval: approval.nullable(),
    createdAt: stamp,
    assessment: z
      .object({
        status: z.enum(["ready", "hold", "review", "draft"]),
        issues: z.array(issue).max(500),
      })
      .strict(),
  })
  .strict();
const schema = z
  .object({
    schemaVersion: z.literal("groundproof.evidence.v1"),
    exportedAt: stamp,
    scope: short,
    workspace: z.object({ name: short, demo: z.boolean() }).strict(),
    mission,
    site: z
      .object({
        id,
        name: short,
        address: short,
        lat: z.number().min(-90).max(90),
        lon: z.number().min(-180).max(180),
      })
      .strict(),
    sources: z.array(source).max(50),
    audit: z
      .array(
        z
          .object({
            id,
            at: stamp,
            action: short,
            actor: short,
            detail: z.string().max(20000),
            objectName: short,
          })
          .strict(),
      )
      .max(100000),
    manifest: z
      .object({
        algorithm: z.literal("SHA-256"),
        canonicalization: z.literal(
          "Recursive lexicographic object-key ordering; array order preserved; UTF-8 JSON; exclude manifest from hash.",
        ),
        hash,
      })
      .strict(),
  })
  .strict();
export interface Verification {
  valid: boolean;
  errors: string[];
  manifestHash: string | null;
  missionId: string | null;
  sourceCount: number;
  scope: string;
}
export function verifyPacket(
  input: unknown,
  expectedHash?: string,
): Verification {
  const result: Verification = {
    valid: false,
    errors: [],
    manifestHash: null,
    missionId: null,
    sourceCount: 0,
    scope:
      "Integrity only: this is not a digital signature, third-party authenticity verification, or flight authorization.",
  };
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    result.errors.push(
      ...parsed.error.issues
        .slice(0, 10)
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`),
    );
    return result;
  }
  const { manifest, ...payload } = parsed.data;
  result.manifestHash = manifest.hash;
  result.missionId = payload.mission.id;
  result.sourceCount = payload.sources.length;
  try {
    if (sha256(canonicalize(payload)) !== manifest.hash)
      result.errors.push("Manifest digest does not match packet content.");
  } catch {
    result.errors.push("Packet cannot be canonicalized.");
  }
  if (
    expectedHash &&
    (!/^[a-f0-9]{64}$/.test(expectedHash) || expectedHash !== manifest.hash)
  )
    result.errors.push(
      "Manifest does not match the independently supplied expected digest.",
    );
  const sourceIds = payload.sources.map((item) => item.id),
    required = payload.mission.sourceIds;
  if (
    new Set(sourceIds).size !== sourceIds.length ||
    new Set(required).size !== required.length
  )
    result.errors.push("Duplicate evidence source references.");
  if (
    sourceIds.length !== required.length ||
    required.some((sid) => !sourceIds.includes(sid))
  )
    result.errors.push(
      "Packet must contain exactly the mission’s required sources.",
    );
  if (payload.site.id !== payload.mission.siteId)
    result.errors.push("Mission site does not match the included site.");
  const exportTime = Date.parse(payload.exportedAt);
  for (const evidence of payload.sources) {
    if (evidence.siteId && evidence.siteId !== payload.site.id)
      result.errors.push(
        `${evidence.id}: evidence belongs to a different site.`,
      );
    for (const version of [evidence.latest, evidence.previous])
      if (version) {
        if (sha256(version.content) !== version.hash)
          result.errors.push(
            `${evidence.id}: snapshot ${version.id} content hash is invalid.`,
          );
        if (Date.parse(version.capturedAt) > exportTime)
          result.errors.push(
            `${evidence.id}: snapshot timestamp is after export.`,
          );
        if ((evidence.kind === "record") !== (version.provider === "manual"))
          result.errors.push(
            `${evidence.id}: operator record provenance labels disagree.`,
          );
        if (evidence.fixture !== (version.provider === "fixture"))
          result.errors.push(
            `${evidence.id}: fixture/provenance labels disagree.`,
          );
      }
    if (evidence.kind === "record" && evidence.latest) {
      const prefix = `OPERATOR-SUPPLIED RECORD — NOT INDEPENDENTLY VERIFIED\nReference: ${evidence.reference}\nValid until: ${evidence.validUntil ?? "Not specified; configured freshness applies"}\n\n`;
      if (!evidence.reference || !evidence.latest.content.startsWith(prefix))
        result.errors.push(
          `${evidence.id}: record metadata does not match the hash-bound snapshot envelope.`,
        );
      if (evidence.monitor?.enabled)
        result.errors.push(
          `${evidence.id}: operator records cannot enable web monitoring.`,
        );
    }
    if (evidence.reviewedAt && Date.parse(evidence.reviewedAt) > exportTime)
      result.errors.push(`${evidence.id}: review timestamp is after export.`);
  }
  if (payload.mission.approval) {
    const approval = payload.mission.approval;
    if (
      Object.keys(approval.hashes).length !== required.length ||
      required.some((sid) => !Object.hasOwn(approval.hashes, sid))
    )
      result.errors.push(
        "Approval does not cover exactly the required evidence.",
      );
    if (Date.parse(approval.at) > exportTime)
      result.errors.push("Approval timestamp is after export.");
  }
  const assessment = assessMission(
    payload.mission,
    payload.sources,
    new Date(payload.exportedAt),
  );
  if (
    payload.mission.assessment.status === "ready" &&
    assessment.status !== "ready"
  )
    result.errors.push(
      "Packet declares ready but its evidence does not support that status.",
    );
  if (
    payload.mission.assessment.status === "ready" &&
    payload.mission.assessment.issues.length
  )
    result.errors.push("A ready packet cannot contain unresolved issues.");
  result.valid = result.errors.length === 0;
  return result;
}
function main() {
  const args = process.argv.slice(2),
    file = args[0];
  if (
    !file ||
    (args.length !== 1 && !(args.length === 3 && args[1] === "--expected-hash"))
  ) {
    console.error(
      "Usage: npx tsx scripts/verify-packet.ts packet.json [--expected-hash SHA256]",
    );
    process.exitCode = 2;
    return;
  }
  try {
    const path = resolve(file);
    if (statSync(path).size > 64 * 1024 * 1024)
      throw new Error("Packet exceeds the 64 MiB verification limit.");
    const report = verifyPacket(
      JSON.parse(readFileSync(path, "utf8")),
      args[2],
    );
    console.log(JSON.stringify(report, null, 2));
    if (!report.valid) process.exitCode = 1;
  } catch (error) {
    console.error(
      `Packet verification failed: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
    process.exitCode = 1;
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  main();
