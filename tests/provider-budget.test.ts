import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../server/app.js";
import { openDatabase, type Db } from "../server/db.js";
import { reserveAnakinCapture } from "../server/provider-budget.js";
import { cleanupExpiredData } from "../server/maintenance.js";
import type { EvidenceSource } from "../shared/types.js";
const resources: { app: Awaited<ReturnType<typeof buildApp>>; db: Db }[] = [];
afterEach(async () => {
  for (const { app, db } of resources.splice(0)) {
    await app.close();
    db.close();
  }
  vi.unstubAllEnvs();
});
async function setup() {
  const db = openDatabase(":memory:");
  let calls = 0;
  const app = await buildApp({
    db,
    rateLimit: false,
    capture: async () => {
      calls++;
      return {
        content: "Real provider test adapter content for a public source",
      };
    },
  });
  resources.push({ app, db });
  const response = await app.inject({ method: "POST", url: "/api/demo/start" }),
    cookies = { groundproof_session: response.cookies[0].value },
    user = response.json().user;
  const post = (url: string, payload: object) =>
    app.inject({ method: "POST", url, cookies, payload });
  const source = (
    await post("/api/sources", {
      title: "Budget test page",
      url: "https://www.faa.gov/uas",
      category: "operating-policy",
      siteId: null,
      freshnessHours: 24,
    })
  ).json<EvidenceSource>();
  return { app, db, post, source, user, cookies, calls: () => calls };
}
describe("shared Anakin capture budgets", () => {
  it("allows three attempts per demo day, blocks the fourth before network and preserves the last snapshot", async () => {
    const test = await setup();
    for (let i = 0; i < 3; i++)
      expect(
        (
          await test.post(`/api/sources/${test.source.id}/capture`, {
            provider: "anakin",
          })
        ).statusCode,
      ).toBe(200);
    const before = (
      await test.app.inject({ url: "/api/state", cookies: test.cookies })
    )
      .json()
      .sources.find((source: EvidenceSource) => source.id === test.source.id);
    const result = await test.post(`/api/sources/${test.source.id}/capture`, {
      provider: "anakin",
    });
    expect(result.statusCode).toBe(429);
    expect(result.json().error).toContain("daily capture allowance");
    expect(test.calls()).toBe(3);
    const after = (
      await test.app.inject({ url: "/api/state", cookies: test.cookies })
    )
      .json()
      .sources.find((source: EvidenceSource) => source.id === test.source.id);
    expect(after.latest).toEqual(before.latest);
    expect(after.lastError).toContain("allowance");
    expect(
      (
        await test.post(`/api/sources/${test.source.id}/capture`, {
          provider: "direct",
        })
      ).statusCode,
    ).toBe(200);
    expect(test.calls()).toBe(4);
  });
  it("enforces a shared deployment ceiling across tenants and persists it independently of demo cleanup", async () => {
    vi.stubEnv("ANAKIN_DAILY_LIMIT", "2");
    const test = await setup();
    const another = (
      await test.app.inject({ method: "POST", url: "/api/demo/start" })
    ).json().user;
    const now = new Date();
    expect(reserveAnakinCapture(test.db, test.user.id, now)).toBe(true);
    expect(reserveAnakinCapture(test.db, another.id, now)).toBe(true);
    expect(reserveAnakinCapture(test.db, test.user.id, now)).toBe(false);
    const old = new Date(Date.now() - 48 * 3600000).toISOString();
    test.db
      .prepare("UPDATE users SET created_at=? WHERE id=?")
      .run(old, test.user.id);
    test.db
      .prepare("UPDATE sessions SET expires_at=? WHERE user_id=?")
      .run(old, test.user.id);
    cleanupExpiredData(test.db);
    expect(
      test.db.prepare("SELECT id FROM users WHERE id=?").get(test.user.id),
    ).toBeUndefined();
    expect(reserveAnakinCapture(test.db, another.id, now)).toBe(false);
    expect(
      reserveAnakinCapture(
        test.db,
        another.id,
        new Date(now.getTime() + 86400000),
      ),
    ).toBe(true);
  });
  it("fails closed for disabled or invalid configuration and never substitutes another provider", async () => {
    const test = await setup();
    for (const limit of ["0", "invalid", "-1", "10001"]) {
      vi.stubEnv("ANAKIN_DAILY_LIMIT", limit);
      expect(
        (
          await test.post(`/api/sources/${test.source.id}/capture`, {
            provider: "anakin",
          })
        ).statusCode,
      ).toBe(429);
    }
    expect(test.calls()).toBe(0);
  });
  it("reserves attempted supplier calls even when upstream fails", async () => {
    vi.stubEnv("ANAKIN_DAILY_LIMIT", "1");
    const db = openDatabase(":memory:");
    let calls = 0;
    const app = await buildApp({
      db,
      rateLimit: false,
      capture: async () => {
        calls++;
        throw new Error("Synthetic upstream outage");
      },
    });
    resources.push({ app, db });
    const demo = await app.inject({ method: "POST", url: "/api/demo/start" }),
      cookies = { groundproof_session: demo.cookies[0].value };
    const source = (
      await app.inject({
        method: "POST",
        url: "/api/sources",
        cookies,
        payload: {
          title: "Budget source",
          url: "https://www.faa.gov/uas",
          category: "airspace",
          siteId: null,
          freshnessHours: 24,
        },
      })
    ).json();
    const request = {
      method: "POST" as const,
      url: `/api/sources/${source.id}/capture`,
      cookies,
      payload: { provider: "anakin" },
    };
    expect((await app.inject(request)).statusCode).toBe(502);
    expect((await app.inject(request)).statusCode).toBe(429);
    expect(calls).toBe(1);
  });
});
