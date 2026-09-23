import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../server/app.js";
import { hashManifest } from "../server/evidence.js";
import { canonicalize, verifyPacket } from "../scripts/verify-packet.js";
import { createHash } from "node:crypto";

const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
afterEach(async () => {
  for (const app of apps.splice(0)) await app.close();
});
async function packet() {
  const app = await buildApp({ databasePath: ":memory:", rateLimit: false });
  apps.push(app);
  const demo = await app.inject({ method: "POST", url: "/api/demo/start" }),
    cookies = { groundproof_session: demo.cookies[0].value };
  const state = (await app.inject({ url: "/api/state", cookies })).json();
  return (
    await app.inject({
      url: `/api/missions/${state.missions[0].id}/export`,
      cookies,
    })
  ).json();
}
function rehash(value: Record<string, unknown>) {
  const { manifest, ...payload } = value;
  value.manifest = { ...(manifest as object), hash: hashManifest(payload) };
  return value;
}
describe("offline packet verifier", () => {
  it("validates real API exports with independent canonical encoding and expected digest", async () => {
    const value = await packet(),
      report = verifyPacket(value, value.manifest.hash);
    expect(report.valid).toBe(true);
    expect(report.sourceCount).toBe(3);
    expect(report.scope).toContain("not a digital signature");
    const { manifest, ...payload } = value;
    expect(
      createHash("sha256").update(canonicalize(payload)).digest("hex"),
    ).toBe(manifest.hash);
  });
  it("rejects changes to job data, content hashes, metadata and detached expected digest", async () => {
    const value = await packet();
    value.mission.value += 1;
    expect(verifyPacket(value).errors).toContain(
      "Manifest digest does not match packet content.",
    );
    rehash(value);
    value.sources[0].latest.content =
      "Changed content with a recomputed outer manifest";
    rehash(value);
    expect(
      verifyPacket(value).errors.some((error) =>
        error.includes("content hash is invalid"),
      ),
    ).toBe(true);
    expect(verifyPacket(await packet(), "0".repeat(64)).errors).toContain(
      "Manifest does not match the independently supplied expected digest.",
    );
    const meta = await packet();
    meta.manifest.algorithm = "MD5";
    expect(verifyPacket(meta).valid).toBe(false);
  });
  it("rejects duplicate or missing evidence even when an attacker recomputes the outer digest", async () => {
    const value = await packet();
    value.sources[0] = value.sources[1];
    rehash(value);
    expect(verifyPacket(value).errors).toContain(
      "Duplicate evidence source references.",
    );
    const missing = await packet();
    missing.sources.pop();
    rehash(missing);
    expect(verifyPacket(missing).valid).toBe(false);
  });
  it("checks evidence readiness, timestamps, site binding and fixture provenance independently", async () => {
    const value = await packet();
    value.sources[0].lastError = "Capture failed";
    rehash(value);
    expect(verifyPacket(value).errors).toContain(
      "Packet declares ready but its evidence does not support that status.",
    );
    const future = await packet();
    future.sources[0].latest.capturedAt = new Date(
      Date.now() + 3600000,
    ).toISOString();
    rehash(future);
    expect(verifyPacket(future).valid).toBe(false);
    const fixture = await packet();
    fixture.sources[0].fixture = false;
    rehash(fixture);
    expect(
      verifyPacket(fixture).errors.some((error) =>
        error.includes("provenance"),
      ),
    ).toBe(true);
    const site = await packet();
    site.site.id = site.mission.id;
    rehash(site);
    expect(verifyPacket(site).errors).toContain(
      "Mission site does not match the included site.",
    );
  });
  it("returns structured failures for malformed or unsupported packet shapes", () => {
    for (const input of [
      null,
      [],
      {},
      "not a packet",
      { schemaVersion: "unsupported" },
    ])
      expect(verifyPacket(input).valid).toBe(false);
    expect(() => canonicalize({ bad: NaN })).toThrow();
  });
});
