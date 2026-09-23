import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../server/app.js";
import { openDatabase, type Db } from "../server/db.js";
import type { AppState, Snapshot } from "../shared/types.js";
const resources: { app: Awaited<ReturnType<typeof buildApp>>; db: Db }[] = [];
afterEach(async () => {
  for (const { app, db } of resources.splice(0)) {
    await app.close();
    db.close();
  }
});
async function setup() {
  const db = openDatabase(":memory:"),
    app = await buildApp({ db, rateLimit: false });
  resources.push({ db, app });
  const demo = await app.inject({ method: "POST", url: "/api/demo/start" }),
    cookies = { groundproof_session: demo.cookies[0].value };
  const state = (
    await app.inject({ url: "/api/state", cookies })
  ).json<AppState>();
  return { db, app, cookies, state };
}
describe("complete source snapshot history", () => {
  it("returns current and historical versions in stable insertion order without duplicates between pages", async () => {
    const test = await setup(),
      source = test.state.sources[0];
    for (const scenario of ["closure", "restore", "closure", "stale"]) {
      const result = await test.app.inject({
        method: "POST",
        url: "/api/demo/drill",
        cookies: test.cookies,
        payload: { scenario },
      });
      expect(result.statusCode).toBe(200);
    }
    const history = async (before?: string) =>
      (
        await test.app.inject({
          url: `/api/sources/${source.id}/history?limit=2${before ? `&before=${before}` : ""}`,
          cookies: test.cookies,
        })
      ).json<{ snapshots: Snapshot[]; nextCursor: string | null }>();
    const first = await history(),
      second = await history(first.nextCursor!),
      third = await history(second.nextCursor!);
    expect(first.snapshots).toHaveLength(2);
    expect(second.snapshots).toHaveLength(2);
    expect(third.snapshots).toHaveLength(1);
    expect(third.nextCursor).toBeNull();
    const all = [...first.snapshots, ...second.snapshots, ...third.snapshots];
    expect(new Set(all.map((snapshot) => snapshot.id)).size).toBe(5);
    expect(all.at(-1)).toEqual(source.latest);
    const current = (
      await test.app.inject({ url: "/api/state", cookies: test.cookies })
    ).json<AppState>().sources[0];
    expect(first.snapshots[0]).toEqual(current.latest);
  });
  it("scopes sources and cursors to the authenticated workspace and requested source", async () => {
    const test = await setup(),
      other = await test.app.inject({ method: "POST", url: "/api/demo/start" });
    expect(
      (
        await test.app.inject({
          url: `/api/sources/${test.state.sources[0].id}/history`,
          cookies: { groundproof_session: other.cookies[0].value },
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await test.app.inject({
          url: `/api/sources/${test.state.sources[0].id}/history?before=${test.state.sources[1].latest!.id}`,
          cookies: test.cookies,
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await test.app.inject({
          url: `/api/sources/${test.state.sources[0].id}/history`,
        })
      ).statusCode,
    ).toBe(401);
    expect(
      (
        await test.app.inject({
          url: `/api/sources/${test.state.sources[0].id}/history?limit=51`,
          cookies: test.cookies,
        })
      ).statusCode,
    ).toBe(400);
  });
  it("fails closed when an archived snapshot has been changed without its digest", async () => {
    const test = await setup(),
      source = test.state.sources[0],
      snapshot = { ...source.latest!, content: "Corrupted history entry" };
    test.db
      .prepare("UPDATE snapshots SET data=? WHERE id=?")
      .run(JSON.stringify(snapshot), snapshot.id);
    const history = await test.app.inject({
      url: `/api/sources/${source.id}/history`,
      cookies: test.cookies,
    });
    expect(history.statusCode).toBe(409);
    expect(history.json().error).toContain("integrity check");
  });
});
