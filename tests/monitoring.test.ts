import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../server/app.js";
import { openDatabase, type Db } from "../server/db.js";
import { nextMonitorAt, runDueCaptures } from "../server/monitoring.js";
import type { AppState, EvidenceSource } from "../shared/types.js";

const resources: { app: Awaited<ReturnType<typeof buildApp>>; db: Db }[] = [];
afterEach(async () => {
  for (const item of resources.splice(0)) {
    await item.app.close();
    item.db.close();
  }
});
async function setup() {
  const db = openDatabase(":memory:"),
    app = await buildApp({
      db,
      rateLimit: false,
      maintenanceIntervalMs: 0,
      capture: async () => ({ content: "Original public site notice" }),
    });
  resources.push({ app, db });
  const account = await app.inject({
    method: "POST",
    url: "/api/auth/register",
    payload: {
      name: "Monitor operator",
      email: "monitor@example.com",
      password: "A long monitor passphrase",
      workspace: "Field team",
    },
  });
  const cookies = { groundproof_session: account.cookies[0].value };
  const post = (url: string, payload: unknown) =>
    app.inject({ method: "POST", url, payload: payload as object, cookies });
  const patch = (url: string, payload: unknown) =>
    app.inject({ method: "PATCH", url, payload: payload as object, cookies });
  const state = async () =>
    (await app.inject({ url: "/api/state", cookies })).json<AppState>();
  const site = (
    await post("/api/sites", {
      name: "Field site",
      address: "Illustrative location",
      lat: 42,
      lon: -71,
    })
  ).json();
  const createSource = async (title = "Public policy") =>
    (
      await post("/api/sources", {
        title,
        url: "https://www.faa.gov/uas",
        category: "operating-policy",
        siteId: null,
        freshnessHours: 24,
      })
    ).json<EvidenceSource>();
  const source = await createSource();
  const captured = (
    await post(`/api/sources/${source.id}/capture`, { provider: "direct" })
  ).json<EvidenceSource>();
  await post(`/api/sources/${source.id}/review`, {
    expectedHash: captured.latest!.hash,
    decision: "accepted",
    note: "Original notice independently reviewed.",
  });
  const mission = (
    await post("/api/missions", {
      name: "Field inspection",
      client: "Test client",
      siteId: site.id,
      scheduledAt: new Date().toISOString(),
      value: 1000,
      sourceIds: [source.id],
    })
  ).json();
  await post(`/api/missions/${mission.id}/approve`, {
    expectedRevision: 0,
    expectedHashes: { [source.id]: captured.latest!.hash },
    note: "All required records have been reviewed.",
  });
  const enable = async (sourceId = source.id) => {
    const result = await patch(`/api/sources/${sourceId}/monitor`, {
      enabled: true,
      intervalHours: 1,
      provider: "direct",
    });
    expect(result.statusCode).toBe(200);
    return result.json<EvidenceSource>();
  };
  return {
    db,
    app,
    cookies,
    post,
    patch,
    state,
    source,
    mission,
    enable,
    createSource,
  };
}
describe("opt-in scheduled evidence monitoring", () => {
  it("defaults off and requires explicit bounded configuration on a real source", async () => {
    const test = await setup();
    expect(nextMonitorAt(test.db)).toBeNull();
    expect((await runDueCaptures(test.db)).attempted).toBe(0);
    expect(
      (
        await test.patch(`/api/sources/${test.source.id}/monitor`, {
          enabled: true,
          intervalHours: 0,
          provider: "direct",
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await test.patch(`/api/sources/${test.source.id}/monitor`, {
          enabled: true,
          intervalHours: 24,
          provider: "direct",
        })
      ).statusCode,
    ).toBe(400);
    const enabled = await test.enable();
    expect(enabled.monitor?.enabled).toBe(true);
    expect(nextMonitorAt(test.db)).toBe(enabled.monitor?.nextCaptureAt);
    await test.patch(`/api/sources/${test.source.id}/monitor`, {
      enabled: false,
      intervalHours: 1,
      provider: "direct",
    });
    expect(nextMonitorAt(test.db)).toBeNull();
  });
  it("automatically revokes affected signatures when monitored content changes", async () => {
    const test = await setup(),
      enabled = await test.enable(),
      now = new Date(enabled.monitor!.nextCaptureAt!);
    const result = await runDueCaptures(test.db, {
      now,
      capture: async () => ({
        content: "Site access suspended in an updated public notice",
      }),
    });
    expect(result).toEqual({ attempted: 1, succeeded: 1, failed: 0 });
    const state = await test.state();
    expect(state.missions[0].approval).toBeNull();
    expect(state.missions[0].assessment.status).toBe("review");
    expect(state.sources[0].reviewedHash).toBeNull();
    expect(
      Date.parse(state.sources[0].monitor!.nextCaptureAt!) - now.getTime(),
    ).toBe(3600000);
    expect(
      state.audit.some(
        (event) =>
          event.actor === "Scheduled monitor" &&
          event.action === "mission.invalidated",
      ),
    ).toBe(true);
  });
  it("fails closed on monitor outage, preserves the last snapshot and backs off", async () => {
    const test = await setup(),
      before = await test.state(),
      enabled = await test.enable(),
      now = new Date(enabled.monitor!.nextCaptureAt!);
    const result = await runDueCaptures(test.db, {
      now,
      capture: async () => {
        throw new Error("Synthetic upstream unavailable");
      },
    });
    expect(result).toEqual({ attempted: 1, succeeded: 0, failed: 1 });
    const failed = await test.state();
    expect(failed.sources[0].latest).toEqual(before.sources[0].latest);
    expect(failed.missions[0].approval).toBeNull();
    expect(failed.missions[0].assessment.status).toBe("hold");
    expect(
      Date.parse(failed.sources[0].monitor!.nextCaptureAt!) - now.getTime(),
    ).toBe(2 * 3600000);
    expect(
      (
        await runDueCaptures(test.db, {
          now,
          capture: async () => ({ content: "Original public site notice" }),
        })
      ).attempted,
    ).toBe(0);
    // Set the source due now to exercise a real-time recovery without fabricating future capturedAt values.
    const source = failed.sources[0];
    source.monitor!.nextCaptureAt = new Date().toISOString();
    test.db
      .prepare("UPDATE sources SET data=? WHERE id=?")
      .run(JSON.stringify(source), source.id);
    await runDueCaptures(test.db, {
      capture: async () => ({ content: "Original public site notice" }),
    });
    const recovered = await test.state();
    expect(recovered.sources[0].lastError).toBeNull();
    expect(recovered.missions[0].approval).toBeNull();
    expect(recovered.missions[0].assessment.status).toBe("review");
  });
  it("claims due work before I/O so overlapping ticks never duplicate a capture", async () => {
    const test = await setup();
    await test.enable();
    let resolveCapture!: (value: { content: string }) => void,
      calls = 0;
    const capture = () => {
      calls++;
      return new Promise<{ content: string }>((resolve) => {
        resolveCapture = resolve;
      });
    };
    const first = runDueCaptures(test.db, { capture });
    while (!resolveCapture)
      await new Promise((resolve) => setTimeout(resolve, 1));
    expect((await runDueCaptures(test.db, { capture })).attempted).toBe(0);
    expect(calls).toBe(1);
    resolveCapture({ content: "Original public site notice" });
    expect((await first).succeeded).toBe(1);
  });
  it("does not re-enable a monitor disabled while its capture is in flight", async () => {
    const test = await setup();
    await test.enable();
    let done!: (value: { content: string }) => void;
    const pending = runDueCaptures(test.db, {
      capture: () =>
        new Promise((resolve) => {
          done = resolve;
        }),
    });
    while (!done) await new Promise((resolve) => setTimeout(resolve, 1));
    await test.patch(`/api/sources/${test.source.id}/monitor`, {
      enabled: false,
      intervalHours: 1,
      provider: "direct",
    });
    done({ content: "Updated notice from the already-started request" });
    await pending;
    const current = await test.state();
    expect(current.sources[0].monitor!.enabled).toBe(false);
    expect(current.sources[0].monitor!.nextCaptureAt).toBeNull();
    expect(nextMonitorAt(test.db)).toBeNull();
  });
  it("caps each tick at three sources and leaves remaining work scheduled", async () => {
    const test = await setup();
    await test.enable();
    for (let index = 0; index < 3; index++) {
      const source = await test.createSource(`Policy ${index}`);
      await test.enable(source.id);
    }
    const options = {
      capture: async () => ({ content: "Public source text" }),
      limit: 999,
    };
    expect((await runDueCaptures(test.db, options)).attempted).toBe(3);
    expect(nextMonitorAt(test.db)).not.toBeNull();
    expect((await runDueCaptures(test.db, options)).attempted).toBe(1);
  });
  it("rejects fixture and foreign-tenant monitoring configuration", async () => {
    const test = await setup(),
      demo = await test.app.inject({ method: "POST", url: "/api/demo/start" }),
      cookies = { groundproof_session: demo.cookies[0].value };
    const demoState = (
        await test.app.inject({ url: "/api/state", cookies })
      ).json<AppState>(),
      payload = { enabled: true, intervalHours: 1, provider: "direct" };
    expect(
      (
        await test.app.inject({
          method: "PATCH",
          url: `/api/sources/${demoState.sources[0].id}/monitor`,
          cookies,
          payload,
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await test.app.inject({
          method: "PATCH",
          url: `/api/sources/${test.source.id}/monitor`,
          cookies,
          payload,
        })
      ).statusCode,
    ).toBe(404);
  });
});
