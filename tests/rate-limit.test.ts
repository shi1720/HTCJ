import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildApp } from "../server/app.js";

const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
const directories: string[] = [];
afterEach(async () => {
  for (const app of apps.splice(0)) await app.close();
  for (const dir of directories.splice(0))
    rmSync(dir, { recursive: true, force: true });
});
describe("enabled request rate limits", () => {
  it("returns a bounded JSON 429 and Retry-After when demo creation exceeds its endpoint quota", async () => {
    const app = await buildApp({
      databasePath: ":memory:",
      maintenanceIntervalMs: 0,
    });
    apps.push(app);
    for (let count = 0; count < 10; count++)
      expect(
        (await app.inject({ method: "POST", url: "/api/demo/start" }))
          .statusCode,
      ).toBe(201);
    const blocked = await app.inject({
      method: "POST",
      url: "/api/demo/start",
    });
    expect(blocked.statusCode).toBe(429);
    expect(blocked.json()).toEqual({
      error: "Too many requests. Please wait a minute and retry.",
    });
    expect(Number(blocked.headers["retry-after"])).toBeGreaterThan(0);
    expect(blocked.headers["cache-control"]).toBe("no-store");
    expect(blocked.body).not.toContain("stack");
  });
  it("exempts static/SPA responses and liveness while retaining the complete API request ceiling", async () => {
    const dir = mkdtempSync(join(tmpdir(), "groundproof-static-"));
    directories.push(dir);
    writeFileSync(
      join(dir, "index.html"),
      "<!doctype html><title>GroundProof test</title>",
    );
    writeFileSync(join(dir, "app.js"), "/* static test asset */");
    const app = await buildApp({
      databasePath: ":memory:",
      staticRoot: dir,
      maintenanceIntervalMs: 0,
    });
    apps.push(app);
    const demo = await app.inject({ method: "POST", url: "/api/demo/start" });
    const cookies = { groundproof_session: demo.cookies[0].value };
    for (let count = 0; count < 190; count++)
      expect((await app.inject(`/app.js?cache=${count}`)).statusCode).toBe(200);
    for (let count = 0; count < 180; count++)
      expect((await app.inject("/api/auth/me")).statusCode).toBe(200);
    expect((await app.inject("/api/auth/me")).statusCode).toBe(429);
    expect((await app.inject("/app.js")).statusCode).toBe(200);
    expect((await app.inject("/")).statusCode).toBe(200);
    expect((await app.inject("/api/health")).json()).toEqual({
      status: "ok",
      version: "1.0.0",
    });
    expect((await app.inject({ url: "/api/state", cookies })).statusCode).toBe(
      429,
    );
  });
  it("retains independent client buckets when a trusted adapter supplies a key generator", async () => {
    const app = await buildApp({
      databasePath: ":memory:",
      maintenanceIntervalMs: 0,
      rateLimitKeyGenerator: (request) =>
        (request.headers["x-test-client"] as string) || "default",
    });
    apps.push(app);
    const request = {
      method: "POST" as const,
      url: "/api/demo/start",
      headers: { "x-test-client": "one" },
    };
    for (let count = 0; count < 10; count++)
      expect((await app.inject(request)).statusCode).toBe(201);
    expect((await app.inject(request)).statusCode).toBe(429);
    expect(
      (await app.inject({ ...request, headers: { "x-test-client": "two" } }))
        .statusCode,
    ).toBe(201);
  });
});
