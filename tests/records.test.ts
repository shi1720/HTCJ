import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../server/app.js";
import { verifyPacket } from "../scripts/verify-packet.js";
import { hashContent } from "../server/evidence.js";
import type { AppState, EvidenceSource } from "../shared/types.js";

const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
afterEach(async () => {
  for (const app of apps.splice(0)) await app.close();
});
const original =
  "Operator-supplied excerpt: Inspection personnel may enter the east yard during the agreed inspection window. Verify the signed original with the site manager.";
async function setup() {
  const app = await buildApp({ databasePath: ":memory:", rateLimit: false });
  apps.push(app);
  const registration = await app.inject({
    method: "POST",
    url: "/api/auth/register",
    payload: {
      name: "Record owner",
      email: "records@example.com",
      password: "A secure records passphrase",
      workspace: "Record pilot",
    },
  });
  const cookies = { groundproof_session: registration.cookies[0].value };
  const post = (url: string, payload: unknown) =>
    app.inject({ method: "POST", url, payload: payload as object, cookies });
  const state = async () =>
    (await app.inject({ url: "/api/state", cookies })).json<AppState>();
  const site = (
    await post("/api/sites", {
      name: "Customer site",
      address: "Operator supplied site",
      lat: 42,
      lon: -71,
    })
  ).json();
  const input = {
    title: "Owner access permission excerpt",
    content: original,
    reference: "Signed letter ACCESS-2026-09 — original retained by operator",
    category: "site-access",
    siteId: site.id,
    freshnessHours: 24,
    validUntil: new Date(Date.now() + 7 * 86400000).toISOString(),
  };
  const response = await post("/api/sources/record", input);
  expect(response.statusCode).toBe(201);
  const source = response.json<EvidenceSource>();
  const mission = (
    await post("/api/missions", {
      name: "Inspection appointment",
      client: "Customer",
      siteId: site.id,
      scheduledAt: new Date(Date.now() + 86400000).toISOString(),
      value: 900,
      sourceIds: [source.id],
    })
  ).json();
  const review = async (current = source) =>
    post(`/api/sources/${source.id}/review`, {
      expectedHash: current.latest!.hash,
      decision: "accepted",
      note: "Operator checked the retained original and this exact excerpt.",
    });
  const approve = async (current = source) =>
    post(`/api/missions/${mission.id}/approve`, {
      expectedRevision: (await state()).missions[0].revision ?? 0,
      expectedHashes: { [source.id]: current.latest!.hash },
      note: "Reviewed the retained original and current operational record.",
    });
  return {
    app,
    cookies,
    post,
    state,
    site,
    input,
    source,
    mission,
    review,
    approve,
  };
}
describe("operator-supplied text evidence records", () => {
  it("creates clearly labeled hash-bound text/reference/validity and requires separate human decisions", async () => {
    const test = await setup(),
      source = test.source;
    expect(source.kind).toBe("record");
    expect(source.fixture).toBe(false);
    expect(source.latest!.provider).toBe("manual");
    expect(source.latest!.content).toContain("NOT INDEPENDENTLY VERIFIED");
    expect(source.latest!.content).toContain(
      `Reference: ${test.input.reference}`,
    );
    expect(source.latest!.content).toContain(
      `Valid until: ${test.input.validUntil}`,
    );
    expect(source.latest!.hash).toBe(hashContent(source.latest!.content));
    expect(source.reviewedHash).toBeNull();
    expect((await test.state()).missions[0].assessment.status).toBe("review");
    expect((await test.approve()).statusCode).toBe(409);
    expect((await test.review()).statusCode).toBe(200);
    expect((await test.state()).missions[0].assessment.status).toBe("draft");
    expect((await test.approve()).statusCode).toBe(200);
    expect((await test.state()).missions[0].assessment.status).toBe("ready");
  });
  it("preserves old reference/validity in immutable snapshots and revokes signatures on metadata-only edits", async () => {
    const test = await setup();
    await test.review();
    await test.approve();
    const updated = (
      await test.post(`/api/sources/${test.source.id}/record`, {
        content: original,
        reference: "Replacement owner letter ACCESS-2026-10",
        validUntil: test.input.validUntil,
        expectedHash: test.source.latest!.hash,
      })
    ).json<EvidenceSource>();
    expect(updated.latest!.hash).not.toBe(test.source.latest!.hash);
    expect(updated.previous).toEqual(test.source.latest);
    expect(updated.previous!.content).toContain(test.input.reference);
    expect(updated.reviewedHash).toBeNull();
    const changed = await test.state();
    expect(changed.missions[0].approval).toBeNull();
    expect(changed.missions[0].assessment.status).toBe("review");
    await test.review(updated);
    expect((await test.state()).missions[0].assessment.status).toBe("review");
    expect((await test.approve(updated)).statusCode).toBe(200);
  });
  it("rejects stale and racing record updates using the current hash", async () => {
    const test = await setup(),
      body = {
        content: original,
        reference: test.input.reference,
        validUntil: test.input.validUntil,
        expectedHash: test.source.latest!.hash,
      };
    const results = await Promise.all([
      test.post(`/api/sources/${test.source.id}/record`, {
        ...body,
        content: original + " First amendment.",
      }),
      test.post(`/api/sources/${test.source.id}/record`, {
        ...body,
        content: original + " Second amendment.",
      }),
    ]);
    expect(results.map((result) => result.statusCode).sort()).toEqual([
      200, 409,
    ]);
    expect((await test.review()).statusCode).toBe(409);
    expect((await test.approve()).statusCode).toBe(409);
  });
  it("requires fresh review even after an identical record is explicitly resubmitted", async () => {
    const test = await setup();
    await test.review();
    await test.approve();
    const updated = (
      await test.post(`/api/sources/${test.source.id}/record`, {
        content: original,
        reference: test.input.reference,
        validUntil: test.input.validUntil,
        expectedHash: test.source.latest!.hash,
      })
    ).json<EvidenceSource>();
    expect(updated.latest!.hash).toBe(test.source.latest!.hash);
    expect(updated.reviewedHash).toBeNull();
    expect((await test.state()).missions[0].approval).toBeNull();
  });
  it("holds expired records and records that expire before a scheduled job", async () => {
    const test = await setup();
    const expiresBeforeJob = new Date(Date.now() + 12 * 3600000).toISOString();
    const updated = (
      await test.post(`/api/sources/${test.source.id}/record`, {
        content: original,
        reference: test.input.reference,
        validUntil: expiresBeforeJob,
        expectedHash: test.source.latest!.hash,
      })
    ).json<EvidenceSource>();
    expect((await test.review(updated)).statusCode).toBe(200);
    expect((await test.state()).missions[0].assessment.status).toBe("hold");
    expect((await test.approve(updated)).statusCode).toBe(409);
    const expired = (
      await test.post(`/api/sources/${test.source.id}/record`, {
        content: original,
        reference: test.input.reference,
        validUntil: new Date(Date.now() - 1000).toISOString(),
        expectedHash: updated.latest!.hash,
      })
    ).json<EvidenceSource>();
    expect((await test.review(expired)).statusCode).toBe(409);
    expect(
      (await test.state()).missions[0].assessment.issues.some(
        (issue) => issue.code === "stale",
      ),
    ).toBe(true);
  });
  it("allows absent validity only with the configured freshness rule and records that choice in the hash", async () => {
    const test = await setup(),
      updated = (
        await test.post(`/api/sources/${test.source.id}/record`, {
          content: original,
          reference: test.input.reference,
          validUntil: null,
          expectedHash: test.source.latest!.hash,
        })
      ).json<EvidenceSource>();
    expect(updated.validUntil).toBeNull();
    expect(updated.latest!.content).toContain(
      "Not specified; configured freshness applies",
    );
    expect((await test.review(updated)).statusCode).toBe(200);
    expect((await test.approve(updated)).statusCode).toBe(200);
  });
  it("prevents web capture or monitoring from overwriting an operator record", async () => {
    const test = await setup();
    expect(
      (
        await test.post(`/api/sources/${test.source.id}/capture`, {
          provider: "direct",
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await test.app.inject({
          method: "PATCH",
          url: `/api/sources/${test.source.id}/monitor`,
          cookies: test.cookies,
          payload: { enabled: true, intervalHours: 1, provider: "direct" },
        })
      ).statusCode,
    ).toBe(400);
    const web = (
      await test.post("/api/sources", {
        title: "Public FAA source",
        url: "https://www.faa.gov/uas",
        category: "operating-policy",
        siteId: null,
        freshnessHours: 24,
      })
    ).json();
    expect(
      (
        await test.post(`/api/sources/${web.id}/record`, {
          content: original,
          reference: test.input.reference,
          validUntil: null,
          expectedHash: test.source.latest!.hash,
        })
      ).statusCode,
    ).toBe(400);
  });
  it("enforces tenant scope and content/reference limits", async () => {
    const test = await setup(),
      other = await test.app.inject({ method: "POST", url: "/api/demo/start" }),
      cookies = { groundproof_session: other.cookies[0].value };
    expect(
      (
        await test.app.inject({
          method: "POST",
          url: `/api/sources/${test.source.id}/record`,
          cookies,
          payload: {
            content: original,
            reference: test.input.reference,
            validUntil: null,
            expectedHash: test.source.latest!.hash,
          },
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await test.app.inject({
          method: "POST",
          url: "/api/sources/record",
          cookies,
          payload: test.input,
        })
      ).statusCode,
    ).toBe(404);
    for (const invalid of [
      { content: "too short" },
      { reference: "x" },
      { reference: "ref\n\ninjected envelope" },
      { content: "x".repeat(20001) },
      { validUntil: "not a timestamp" },
    ])
      expect(
        (await test.post("/api/sources/record", { ...test.input, ...invalid }))
          .statusCode,
      ).toBe(400);
  });
  it("exports independently verifiable provenance without claiming that the original document is authentic", async () => {
    const test = await setup();
    await test.review();
    await test.approve();
    const packet = (
      await test.app.inject({
        url: `/api/missions/${test.mission.id}/export`,
        cookies: test.cookies,
      })
    ).json();
    const verified = verifyPacket(packet);
    expect(verified.valid).toBe(true);
    expect(packet.sources[0].latest.provider).toBe("manual");
    expect(verified.scope).toContain("not a digital signature");
  });
});
