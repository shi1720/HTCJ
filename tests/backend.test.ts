import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildApp, type AppOptions } from "../server/app.js";
import { cleanupExpiredData } from "../server/maintenance.js";
import { openDatabase } from "../server/db.js";
import { hashManifest } from "../server/evidence.js";
import type { AppState, EvidenceSource } from "../shared/types.js";

type App = Awaited<ReturnType<typeof buildApp>>;
const apps: App[] = [];
const directories: string[] = [];
async function app(options: AppOptions = {}) {
  const server = await buildApp({
    databasePath: ":memory:",
    rateLimit: false,
    ...options,
  });
  apps.push(server);
  return server;
}
async function demo(server: App) {
  const response = await server.inject({
    method: "POST",
    url: "/api/demo/start",
  });
  expect(response.statusCode).toBe(201);
  return response.cookies.find((c) => c.name === "groundproof_session")!.value;
}
async function state(server: App, token: string): Promise<AppState> {
  const response = await server.inject({
    url: "/api/state",
    cookies: { groundproof_session: token },
  });
  expect(response.statusCode).toBe(200);
  return response.json();
}
async function post(server: App, token: string, url: string, payload: unknown) {
  return server.inject({
    method: "POST",
    url,
    cookies: { groundproof_session: token },
    payload: payload as Record<string, unknown>,
  });
}
function hashes(data: AppState, index = 0) {
  return Object.fromEntries(
    data.missions[index].sourceIds.map((sid) => [
      sid,
      data.sources.find((s) => s.id === sid)!.latest!.hash,
    ]),
  );
}
async function registered(server: App, email = "test@example.com") {
  const response = await server.inject({
    method: "POST",
    url: "/api/auth/register",
    payload: {
      name: "Test operator",
      email,
      password: "Long secure passphrase!",
      workspace: "Test field team",
    },
  });
  expect(response.statusCode).toBe(201);
  return {
    token: response.cookies.find((c) => c.name === "groundproof_session")!
      .value,
    user: response.json().user,
  };
}
afterEach(async () => {
  for (const server of apps.splice(0)) await server.close();
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

describe("GroundProof API integration and security", () => {
  it("has a public health endpoint and requires a session for workspace data", async () => {
    const server = await app();
    expect((await server.inject("/api/health")).json()).toEqual({
      status: "ok",
      version: "1.0.0",
    });
    expect((await server.inject("/api/state")).statusCode).toBe(401);
    expect((await server.inject("/api/auth/me")).json()).toEqual({
      user: null,
    });
    expect(
      (
        await server.inject({
          method: "POST",
          url: "/api/demo/start",
          headers: { origin: "https://attacker.example" },
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await server.inject({
          method: "POST",
          url: "/api/demo/start",
          headers: { "sec-fetch-site": "cross-site" },
        })
      ).statusCode,
    ).toBe(403);
  });
  it("creates isolated demo workspaces with 6 ready jobs and exactly $4,800 affected", async () => {
    const server = await app(),
      token = await demo(server),
      initial = await state(server, token);
    expect(initial.sites).toHaveLength(3);
    expect(initial.sources).toHaveLength(5);
    expect(initial.missions).toHaveLength(6);
    expect(initial.missions.every((m) => m.assessment.status === "ready")).toBe(
      true,
    );
    const changed = (
      await post(server, token, "/api/demo/drill", { scenario: "closure" })
    ).json<AppState>();
    const affected = changed.missions.filter(
      (m) => m.assessment.status === "review",
    );
    expect(affected).toHaveLength(3);
    expect(affected.reduce((sum, m) => sum + m.value, 0)).toBe(4800);
    expect(
      changed.missions.filter((m) => m.assessment.status === "ready"),
    ).toHaveLength(3);
    expect(affected.every((m) => m.approval === null)).toBe(true);
  });
  it("blocks cross-tenant read, review, update, capture, approve, reference and export", async () => {
    const server = await app(),
      first = await demo(server),
      second = await demo(server),
      foreign = await state(server, first),
      own = await state(server, second);
    expect(own.missions[0].id).not.toBe(foreign.missions[0].id);
    expect(
      (
        await post(
          server,
          second,
          `/api/sources/${foreign.sources[0].id}/review`,
          {
            expectedHash: foreign.sources[0].latest!.hash,
            decision: "accepted",
            note: "Reviewed source safely.",
          },
        )
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await post(
          server,
          second,
          `/api/sources/${foreign.sources[0].id}/capture`,
          { provider: "direct" },
        )
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await post(
          server,
          second,
          `/api/missions/${foreign.missions[0].id}/approve`,
          {
            expectedRevision: 0,
            expectedHashes: hashes(foreign),
            note: "Reviewed all evidence.",
          },
        )
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await server.inject({
          url: `/api/missions/${foreign.missions[0].id}/export`,
          cookies: { groundproof_session: second },
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await server.inject({
          method: "PATCH",
          url: `/api/missions/${foreign.missions[0].id}`,
          cookies: { groundproof_session: second },
          payload: { name: "Stolen mission" },
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await post(server, second, "/api/missions", {
          name: "Bad reference",
          client: "Test",
          siteId: own.sites[0].id,
          scheduledAt: new Date().toISOString(),
          value: 100,
          sourceIds: [foreign.sources[0].id],
        })
      ).statusCode,
    ).toBe(404);
    expect((await post(server, second, "/api/demo/reset", {})).statusCode).toBe(
      200,
    );
    expect((await state(server, first)).missions[0].id).toBe(
      foreign.missions[0].id,
    );
  });
  it("requires exact current hashes and separates source review from reapproval", async () => {
    const server = await app(),
      token = await demo(server),
      initial = await state(server, token),
      oldHashes = hashes(initial);
    const changed = (
      await post(server, token, "/api/demo/drill", { scenario: "closure" })
    ).json<AppState>();
    expect(
      (
        await post(
          server,
          token,
          `/api/missions/${initial.missions[0].id}/approve`,
          {
            expectedRevision: 0,
            expectedHashes: oldHashes,
            note: "Approve previous evidence.",
          },
        )
      ).statusCode,
    ).toBe(409);
    expect(
      (
        await post(
          server,
          token,
          `/api/sources/${initial.sources[0].id}/review`,
          {
            expectedHash: initial.sources[0].latest!.hash,
            decision: "accepted",
            note: "Stale browser review.",
          },
        )
      ).statusCode,
    ).toBe(409);
    const source = changed.sources[0];
    expect(
      (
        await post(server, token, `/api/sources/${source.id}/review`, {
          expectedHash: source.latest!.hash,
          decision: "accepted",
          note: "Reviewed the changed access notice.",
        })
      ).statusCode,
    ).toBe(200);
    const reviewed = await state(server, token);
    expect(reviewed.missions[0].assessment.status).toBe("review");
    expect(reviewed.missions[0].approval).toBeNull();
    const exact = hashes(reviewed);
    const missing = { ...exact };
    delete missing[source.id];
    expect(
      (
        await post(
          server,
          token,
          `/api/missions/${initial.missions[0].id}/approve`,
          {
            expectedRevision: 0,
            expectedHashes: missing,
            note: "Missing coverage attempt.",
          },
        )
      ).statusCode,
    ).toBe(409);
    expect(
      (
        await post(
          server,
          token,
          `/api/missions/${initial.missions[0].id}/approve`,
          {
            expectedRevision: 0,
            expectedHashes: {
              ...exact,
              [reviewed.sources[4].id]: reviewed.sources[4].latest!.hash,
            },
            note: "Extra coverage attempt.",
          },
        )
      ).statusCode,
    ).toBe(409);
    const approved = await post(
      server,
      token,
      `/api/missions/${initial.missions[0].id}/approve`,
      {
        expectedRevision: reviewed.missions[0].revision ?? 0,
        expectedHashes: exact,
        note: "Access exception independently confirmed; evidence sign-off only.",
      },
    );
    expect(approved.statusCode).toBe(200);
    expect(approved.json().assessment.status).toBe("ready");
  });
  it("restoring original bytes never revives old approval and blocked evidence remains held", async () => {
    const server = await app(),
      token = await demo(server),
      initial = await state(server, token);
    await post(server, token, "/api/demo/drill", { scenario: "closure" });
    const restored = (
      await post(server, token, "/api/demo/drill", { scenario: "restore" })
    ).json<AppState>();
    expect(restored.sources[0].latest!.hash).toBe(
      initial.sources[0].latest!.hash,
    );
    expect(restored.missions[0].approval).toBeNull();
    await post(server, token, `/api/sources/${restored.sources[0].id}/review`, {
      expectedHash: restored.sources[0].latest!.hash,
      decision: "blocked",
      note: "Site supervisor has not approved access.",
    });
    const blocked = await state(server, token);
    expect(blocked.missions[0].assessment.status).toBe("hold");
    expect(
      (
        await post(
          server,
          token,
          `/api/missions/${blocked.missions[0].id}/approve`,
          {
            expectedRevision: 0,
            expectedHashes: hashes(blocked),
            note: "Cannot sign blocked evidence.",
          },
        )
      ).statusCode,
    ).toBe(409);
    await post(server, token, `/api/sources/${restored.sources[0].id}/review`, {
      expectedHash: restored.sources[0].latest!.hash,
      decision: "accepted",
      note: "Restored notice independently reviewed.",
    });
    const reviewed = await state(server, token);
    expect(reviewed.missions[0].assessment.status).toBe("review");
    expect(reviewed.missions[0].approval).toBeNull();
  });
  it("fails closed for stale and unavailable fixtures without losing the last snapshot", async () => {
    const server = await app(),
      token = await demo(server),
      initial = await state(server, token);
    const outage = (
      await post(server, token, "/api/demo/drill", { scenario: "unavailable" })
    ).json<AppState>();
    expect(outage.sources[0].latest).toEqual(initial.sources[0].latest);
    expect(outage.missions[0].assessment.status).toBe("hold");
    expect(
      (
        await post(
          server,
          token,
          `/api/sources/${outage.sources[0].id}/review`,
          {
            expectedHash: outage.sources[0].latest!.hash,
            decision: "accepted",
            note: "Cannot review failed capture.",
          },
        )
      ).statusCode,
    ).toBe(409);
    const stale = (
      await post(server, token, "/api/demo/drill", { scenario: "stale" })
    ).json<AppState>();
    expect(
      stale.missions[0].assessment.issues.some(
        (issue) => issue.code === "stale",
      ),
    ).toBe(true);
    expect(
      (
        await post(
          server,
          token,
          `/api/sources/${stale.sources[0].id}/review`,
          {
            expectedHash: stale.sources[0].latest!.hash,
            decision: "accepted",
            note: "Cannot review stale capture.",
          },
        )
      ).statusCode,
    ).toBe(409);
  });
  it("exports reproducible canonical manifests and detects payload tampering", async () => {
    const server = await app(),
      token = await demo(server),
      initial = await state(server, token);
    const response = await server.inject({
      url: `/api/missions/${initial.missions[0].id}/export`,
      cookies: { groundproof_session: token },
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-disposition"]).toContain("attachment");
    const { manifest, ...payload } = response.json();
    expect(manifest.hash).toBe(hashManifest(payload));
    expect(payload.sources).toHaveLength(3);
    payload.mission.value = 0;
    expect(hashManifest(payload)).not.toBe(manifest.hash);
  });
  it("registers a blank workspace, hashes passwords, rotates sessions and rejects demo actions", async () => {
    const db = openDatabase(":memory:"),
      server = await app({ db }),
      { token, user } = await registered(server);
    const initial = await state(server, token);
    expect(initial.missions).toEqual([]);
    expect(initial.sources).toEqual([]);
    expect(initial.sites).toEqual([]);
    const stored = db
      .prepare("SELECT password_hash FROM users WHERE id=?")
      .get(user.id) as { password_hash: string };
    expect(stored.password_hash).toMatch(/^scrypt\$/);
    expect(stored.password_hash).not.toContain("Long secure");
    expect(
      (await post(server, token, "/api/demo/drill", { scenario: "closure" }))
        .statusCode,
    ).toBe(403);
    const wrong = await server.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "test@example.com", password: "wrong" },
    });
    expect(wrong.statusCode).toBe(401);
    const login = await server.inject({
      method: "POST",
      url: "/api/auth/login",
      cookies: { groundproof_session: token },
      payload: {
        email: "TEST@example.com",
        password: "Long secure passphrase!",
      },
    });
    expect(login.statusCode).toBe(200);
    expect(login.headers["set-cookie"]).toContain("HttpOnly");
    expect(login.headers["set-cookie"]).toContain("SameSite=Strict");
    const next = login.cookies[0].value;
    expect(next).not.toBe(token);
    expect(
      (
        await server.inject({
          url: "/api/state",
          cookies: { groundproof_session: token },
        })
      ).statusCode,
    ).toBe(401);
    await post(server, next, "/api/auth/logout", {});
    expect(
      (
        await server.inject({
          url: "/api/state",
          cookies: { groundproof_session: next },
        })
      ).statusCode,
    ).toBe(401);
    await server.close();
    apps.splice(apps.indexOf(server), 1);
    db.close();
  });
  it("persists sessions, data and approval revocation across process restarts", async () => {
    const directory = mkdtempSync(join(tmpdir(), "groundproof-test-"));
    directories.push(directory);
    const path = join(directory, "state.sqlite");
    const first = await app({ databasePath: path }),
      token = await demo(first),
      initial = await state(first, token);
    await post(first, token, "/api/demo/drill", { scenario: "closure" });
    await first.close();
    apps.splice(apps.indexOf(first), 1);
    const second = await app({ databasePath: path }),
      persisted = await state(second, token);
    expect(persisted.missions[0].id).toBe(initial.missions[0].id);
    expect(persisted.missions[0].approval).toBeNull();
    expect(persisted.missions[0].assessment.status).toBe("review");
  });
  it("runs real rule checks and rejects malformed, external and private source URLs", async () => {
    const server = await app(),
      token = await demo(server),
      lab = await post(server, token, "/api/lab/run", {});
    expect(lab.json().passed).toBe(lab.json().total);
    expect(lab.json().total).toBeGreaterThanOrEqual(15);
    for (const url of [
      "http://faa.gov/uas",
      "https://127.0.0.1",
      "https://faa.gov.attacker.com",
      "https://user:pass@faa.gov/uas",
    ])
      expect(
        (
          await post(server, token, "/api/sources", {
            title: "Bad URL",
            url,
            category: "airspace",
            siteId: null,
            freshnessHours: 24,
          })
        ).statusCode,
      ).toBe(400);
    expect(
      (
        await post(server, token, "/api/sites", {
          name: "Invalid",
          address: "Test",
          lat: 91,
          lon: 0,
        })
      ).statusCode,
    ).toBe(400);
    const initial = await state(server, token);
    expect(
      (
        await post(
          server,
          token,
          `/api/sources/${initial.sources[0].id}/review`,
          {
            expectedHash: initial.sources[0].latest!.hash,
            decision: "accepted",
            note: "ok",
          },
        )
      ).statusCode,
    ).toBe(400);
  });
  it("rejects concurrent obsolete capture completion and preserves newer evidence", async () => {
    const resolves: ((value: { content: string }) => void)[] = [];
    const server = await app({
        capture: () => new Promise((resolve) => resolves.push(resolve)),
      }),
      { token } = await registered(server);
    const source = (
      await post(server, token, "/api/sources", {
        title: "FAA planning",
        url: "https://www.faa.gov/uas",
        category: "airspace",
        siteId: null,
        freshnessHours: 24,
      })
    ).json<EvidenceSource>();
    const pendingFirst = post(
      server,
      token,
      `/api/sources/${source.id}/capture`,
      { provider: "direct" },
    );
    const pendingSecond = post(
      server,
      token,
      `/api/sources/${source.id}/capture`,
      { provider: "direct" },
    );
    while (resolves.length < 2)
      await new Promise((resolve) => setTimeout(resolve, 1));
    resolves[1]({ content: "Newer source capture" });
    expect((await pendingSecond).statusCode).toBe(200);
    resolves[0]({ content: "Obsolete slower source capture" });
    expect((await pendingFirst).statusCode).toBe(409);
    expect((await state(server, token)).sources[0].latest!.content).toBe(
      "Newer source capture",
    );
  });
  it("preserves evidence on provider failure and recovers only with human review", async () => {
    let failCapture = false;
    const server = await app({
        capture: async () => {
          if (failCapture) throw new Error("Synthetic provider outage");
          return { content: "Public source policy text" };
        },
      }),
      { token } = await registered(server);
    const site = (
      await post(server, token, "/api/sites", {
        name: "Test site",
        address: "Test address",
        lat: 42,
        lon: -71,
      })
    ).json();
    const source = (
      await post(server, token, "/api/sources", {
        title: "FAA planning",
        url: "https://www.faa.gov/uas",
        category: "airspace",
        siteId: null,
        freshnessHours: 24,
      })
    ).json<EvidenceSource>();
    const captured = (
      await post(server, token, `/api/sources/${source.id}/capture`, {
        provider: "direct",
      })
    ).json<EvidenceSource>();
    await post(server, token, `/api/sources/${source.id}/review`, {
      expectedHash: captured.latest!.hash,
      decision: "accepted",
      note: "Verified source contents.",
    });
    const mission = (
      await post(server, token, "/api/missions", {
        name: "Test job",
        client: "Test client",
        siteId: site.id,
        scheduledAt: new Date().toISOString(),
        value: 100,
        sourceIds: [source.id],
      })
    ).json();
    await post(server, token, `/api/missions/${mission.id}/approve`, {
      expectedRevision: 0,
      expectedHashes: { [source.id]: captured.latest!.hash },
      note: "Reviewed required evidence.",
    });
    failCapture = true;
    expect(
      (
        await post(server, token, `/api/sources/${source.id}/capture`, {
          provider: "direct",
        })
      ).statusCode,
    ).toBe(502);
    const failed = await state(server, token);
    expect(failed.sources[0].latest).toEqual(captured.latest);
    expect(failed.missions[0].assessment.status).toBe("hold");
    failCapture = false;
    expect(
      (
        await post(server, token, `/api/sources/${source.id}/capture`, {
          provider: "direct",
        })
      ).statusCode,
    ).toBe(200);
    const recovered = await state(server, token);
    expect(recovered.missions[0].approval).toBeNull();
    expect(recovered.missions[0].assessment.status).toBe("review");
  });
  it("cannot leave a ready mission after a concurrent source change and sign-off", async () => {
    const server = await app(),
      token = await demo(server),
      initial = await state(server, token);
    const [approval, change] = await Promise.all([
      post(server, token, `/api/missions/${initial.missions[0].id}/approve`, {
        expectedRevision: 0,
        expectedHashes: hashes(initial),
        note: "Review before concurrent source mutation.",
      }),
      post(server, token, "/api/demo/drill", { scenario: "closure" }),
    ]);
    expect([200, 409]).toContain(approval.statusCode);
    expect(change.statusCode).toBe(200);
    const current = await state(server, token);
    expect(current.missions[0].assessment.status).toBe("review");
    expect(current.missions[0].approval).toBeNull();
  });
  it("requires a new signature after naturally expired evidence is refreshed unchanged", async () => {
    const db = openDatabase(":memory:"),
      server = await app({
        db,
        capture: async () => ({ content: "Stable policy text" }),
      }),
      { token, user } = await registered(server);
    const site = (
      await post(server, token, "/api/sites", {
        name: "Test site",
        address: "Test address",
        lat: 42,
        lon: -71,
      })
    ).json();
    const source = (
      await post(server, token, "/api/sources", {
        title: "FAA planning",
        url: "https://www.faa.gov/uas",
        category: "airspace",
        siteId: null,
        freshnessHours: 1,
      })
    ).json<EvidenceSource>();
    const captured = (
      await post(server, token, `/api/sources/${source.id}/capture`, {
        provider: "direct",
      })
    ).json<EvidenceSource>();
    await post(server, token, `/api/sources/${source.id}/review`, {
      expectedHash: captured.latest!.hash,
      decision: "accepted",
      note: "Verified public policy text.",
    });
    const mission = (
      await post(server, token, "/api/missions", {
        name: "Test job",
        client: "Test client",
        siteId: site.id,
        scheduledAt: new Date().toISOString(),
        value: 100,
        sourceIds: [source.id],
      })
    ).json();
    await post(server, token, `/api/missions/${mission.id}/approve`, {
      expectedRevision: 0,
      expectedHashes: { [source.id]: captured.latest!.hash },
      note: "All source evidence reviewed.",
    });
    const current = (await state(server, token)).sources[0];
    current.latest!.capturedAt = new Date(Date.now() - 3600001).toISOString();
    db.prepare("UPDATE sources SET data=? WHERE tenant_id=? AND id=?").run(
      JSON.stringify(current),
      user.id,
      current.id,
    );
    expect((await state(server, token)).missions[0].assessment.status).toBe(
      "hold",
    );
    await post(server, token, `/api/sources/${source.id}/capture`, {
      provider: "direct",
    });
    const refreshed = await state(server, token);
    expect(refreshed.sources[0].latest!.hash).toBe(captured.latest!.hash);
    expect(refreshed.missions[0].approval).toBeNull();
    expect(refreshed.missions[0].assessment.status).toBe("review");
    await server.close();
    apps.splice(apps.indexOf(server), 1);
    db.close();
  });
  it("refuses export when persisted snapshot bytes fail their content hash", async () => {
    const db = openDatabase(":memory:"),
      server = await app({ db }),
      token = await demo(server),
      initial = await state(server, token);
    const source = initial.sources[0];
    source.latest!.content = "Unauthorized mutation of stored evidence";
    db.prepare("UPDATE sources SET data=? WHERE tenant_id=? AND id=?").run(
      JSON.stringify(source),
      initial.user.id,
      source.id,
    );
    const current = await state(server, token);
    expect(current.missions[0].assessment.status).toBe("hold");
    expect(
      (
        await server.inject({
          url: `/api/missions/${initial.missions[0].id}/export`,
          cookies: { groundproof_session: token },
        })
      ).statusCode,
    ).toBe(409);
    await server.close();
    apps.splice(apps.indexOf(server), 1);
    db.close();
  });

  it("cleans expired sessions and inactive demos while preserving active demos and real accounts", async () => {
    const db = openDatabase(":memory:"),
      server = await app({ db }),
      expired = await demo(server),
      active = await demo(server),
      real = await registered(server);
    const expiredState = await state(server, expired),
      activeState = await state(server, active),
      past = new Date(Date.now() - 48 * 3600000).toISOString();
    db.prepare("UPDATE users SET created_at=?").run(past);
    db.prepare("UPDATE sessions SET expires_at=? WHERE user_id IN (?,?)").run(
      past,
      expiredState.user.id,
      real.user.id,
    );
    const cleaned = cleanupExpiredData(db);
    expect(cleaned.sessions).toBe(2);
    expect(cleaned.demos).toBe(1);
    expect(
      db.prepare("SELECT id FROM users WHERE id=?").get(expiredState.user.id),
    ).toBeUndefined();
    expect(
      db
        .prepare("SELECT id FROM sources WHERE tenant_id=?")
        .get(expiredState.user.id),
    ).toBeUndefined();
    expect(
      db.prepare("SELECT id FROM users WHERE id=?").get(real.user.id),
    ).toBeDefined();
    expect((await state(server, active)).user.id).toBe(activeState.user.id);
    expect(
      (
        await server.inject({
          url: "/api/state",
          cookies: { groundproof_session: expired },
        })
      ).statusCode,
    ).toBe(401);
    await server.close();
    apps.splice(apps.indexOf(server), 1);
    db.close();
  });
  it("persists per-account brute-force budgets across server restarts and releases expired windows", async () => {
    const directory = mkdtempSync(join(tmpdir(), "groundproof-auth-"));
    directories.push(directory);
    const path = join(directory, "state.sqlite");
    const first = await app({ databasePath: path });
    await registered(first);
    for (let index = 0; index < 10; index++)
      expect(
        (
          await first.inject({
            method: "POST",
            url: "/api/auth/login",
            payload: { email: "test@example.com", password: "wrong password" },
          })
        ).statusCode,
      ).toBe(401);
    await first.close();
    apps.splice(apps.indexOf(first), 1);
    const db = openDatabase(path),
      second = await app({ db });
    const input = {
      method: "POST" as const,
      url: "/api/auth/login",
      payload: {
        email: "test@example.com",
        password: "Long secure passphrase!",
      },
    };
    expect((await second.inject(input)).statusCode).toBe(429);
    db.prepare("UPDATE login_attempts SET window_start=?").run(
      Date.now() - 16 * 60000,
    );
    expect((await second.inject(input)).statusCode).toBe(200);
    expect(
      (
        db.prepare("SELECT COUNT(*) AS n FROM login_attempts").get() as {
          n: number;
        }
      ).n,
    ).toBe(0);
    await second.close();
    apps.splice(apps.indexOf(second), 1);
    db.close();
  });
  it("applies capture concurrency limits and frees capacity after failures", async () => {
    const pending: ((value: { content: string }) => void)[] = [];
    const server = await app({
        capture: () => new Promise((resolve) => pending.push(resolve)),
      }),
      { token } = await registered(server);
    const source = (
      await post(server, token, "/api/sources", {
        title: "FAA planning",
        url: "https://www.faa.gov/uas",
        category: "airspace",
        siteId: null,
        freshnessHours: 24,
      })
    ).json<EvidenceSource>();
    const first = post(server, token, `/api/sources/${source.id}/capture`, {
        provider: "direct",
      }),
      second = post(server, token, `/api/sources/${source.id}/capture`, {
        provider: "direct",
      });
    while (pending.length < 2)
      await new Promise((resolve) => setTimeout(resolve, 1));
    expect(
      (
        await post(server, token, `/api/sources/${source.id}/capture`, {
          provider: "direct",
        })
      ).statusCode,
    ).toBe(429);
    pending[0]({ content: "First source content" });
    pending[1]({ content: "Second source content" });
    await Promise.all([first, second]);
    const third = post(server, token, `/api/sources/${source.id}/capture`, {
      provider: "direct",
    });
    while (pending.length < 3)
      await new Promise((resolve) => setTimeout(resolve, 1));
    pending[2]({ content: "Recovered source content" });
    expect((await third).statusCode).toBe(200);
  });
  it("uses a configured origin exclusively and does not trust a spoofed matching Host", async () => {
    const server = await app({
      publicOrigin: "https://groundproof.example",
      secureCookies: true,
    });
    expect(
      (
        await server.inject({
          method: "POST",
          url: "/api/demo/start",
          headers: {
            host: "attacker.example",
            origin: "https://attacker.example",
          },
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await server.inject({
          method: "POST",
          url: "/api/demo/start",
          headers: { origin: "http://localhost:5173" },
        })
      ).statusCode,
    ).toBe(403);
    const good = await server.inject({
      method: "POST",
      url: "/api/demo/start",
      headers: { origin: "https://groundproof.example" },
    });
    expect(good.statusCode).toBe(201);
    expect(good.headers["set-cookie"]).toContain("Secure");
    expect(good.headers["strict-transport-security"]).toContain("31536000");
    expect(good.headers["cache-control"]).toBe("no-store");
  });
  it("exports audit events by stable object identity despite duplicate display names", async () => {
    const server = await app(),
      token = await demo(server),
      initial = await state(server, token),
      first = initial.missions[0],
      other = initial.missions[3];
    await server.inject({
      method: "PATCH",
      url: `/api/missions/${other.id}`,
      cookies: { groundproof_session: token },
      payload: { name: first.name },
    });
    const exported = (
      await server.inject({
        url: `/api/missions/${first.id}/export`,
        cookies: { groundproof_session: token },
      })
    ).json();
    expect(
      exported.audit.some(
        (event: { action: string }) => event.action === "mission.updated",
      ),
    ).toBe(false);
    expect(
      exported.audit.some(
        (event: { action: string }) => event.action === "mission.approved",
      ),
    ).toBe(true);
  });

  it("rejects stale mission revisions after planning edits even when source hashes still match", async () => {
    const server = await app(),
      token = await demo(server),
      initial = await state(server, token),
      mission = initial.missions[0];
    const edit = await server.inject({
      method: "PATCH",
      url: `/api/missions/${mission.id}`,
      cookies: { groundproof_session: token },
      payload: {
        expectedRevision: mission.revision ?? 0,
        scheduledAt: new Date(Date.now() + 3 * 86400000).toISOString(),
      },
    });
    expect(edit.statusCode).toBe(200);
    expect(edit.json().revision).toBe((mission.revision ?? 0) + 1);
    const stale = await post(
      server,
      token,
      `/api/missions/${mission.id}/approve`,
      {
        expectedRevision: mission.revision ?? 0,
        expectedHashes: hashes(initial),
        note: "Old dialog describes a different appointment.",
      },
    );
    expect(stale.statusCode).toBe(409);
    expect(
      (
        await server.inject({
          method: "PATCH",
          url: `/api/missions/${mission.id}`,
          cookies: { groundproof_session: token },
          payload: {
            expectedRevision: mission.revision ?? 0,
            name: "Stale form overwrite",
          },
        })
      ).statusCode,
    ).toBe(409);
    const current = await state(server, token);
    expect(
      (
        await post(server, token, `/api/missions/${mission.id}/approve`, {
          expectedRevision: current.missions[0].revision,
          expectedHashes: hashes(current),
          note: "Reopened and reviewed the changed appointment.",
        })
      ).statusCode,
    ).toBe(200);
  });
  it("binds sign-off to a revocation epoch even when a source changes back to identical bytes", async () => {
    const server = await app(),
      token = await demo(server),
      initial = await state(server, token),
      mission = initial.missions[0];
    await post(server, token, "/api/demo/drill", { scenario: "closure" });
    await post(server, token, "/api/demo/drill", { scenario: "restore" });
    const restored = await state(server, token),
      source = restored.sources[0];
    expect(source.latest!.hash).toBe(initial.sources[0].latest!.hash);
    await post(server, token, `/api/sources/${source.id}/review`, {
      expectedHash: source.latest!.hash,
      decision: "accepted",
      note: "Original content restored and independently reviewed again.",
    });
    expect(
      (
        await post(server, token, `/api/missions/${mission.id}/approve`, {
          expectedRevision: mission.revision ?? 0,
          expectedHashes: hashes(initial),
          note: "Stale dialog from before closure and restoration.",
        })
      ).statusCode,
    ).toBe(409);
    expect((await state(server, token)).missions[0].approval).toBeNull();
  });
});
