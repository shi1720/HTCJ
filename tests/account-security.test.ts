import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../server/app.js";
import { initializeDatabase, openDatabase, type Db } from "../server/db.js";
import * as auth from "../server/auth.js";

const resources: { app: Awaited<ReturnType<typeof buildApp>>; db: Db }[] = [];
const oldPassword = "Original long account passphrase";
const newPassword = "Replacement long account passphrase";
afterEach(async () => {
  vi.restoreAllMocks();
  for (const { app, db } of resources.splice(0)) {
    await app.close();
    db.close();
  }
});
async function setup(email = "owner@example.com") {
  const db = openDatabase(":memory:"),
    app = await buildApp({ db, rateLimit: false, maintenanceIntervalMs: 0 });
  resources.push({ app, db });
  const registration = await app.inject({
    method: "POST",
    url: "/api/auth/register",
    payload: {
      email,
      password: oldPassword,
      name: "Account owner",
      workspace: "Security workspace",
    },
  });
  expect(registration.statusCode).toBe(201);
  const data = registration.json(),
    token = registration.cookies[0].value;
  const post = (url: string, payload: object, cookie = token) =>
    app.inject({
      method: "POST",
      url,
      payload,
      cookies: { groundproof_session: cookie },
    });
  const state = (cookie = token) =>
    app.inject({ url: "/api/state", cookies: { groundproof_session: cookie } });
  const login = (password = oldPassword) =>
    app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email, password },
    });
  return {
    app,
    db,
    email,
    user: data.user,
    recoveryKey: data.recoveryKey as string,
    token,
    post,
    state,
    login,
  };
}
describe("account credentials and recovery", () => {
  it("returns a one-time recovery key at registration and stores only its digest", async () => {
    const test = await setup();
    expect(test.recoveryKey).toMatch(/^GP-[A-F0-9]{64}$/);
    const row = test.db
      .prepare("SELECT recovery_hash,password_hash FROM users WHERE id=?")
      .get(test.user.id) as { recovery_hash: string; password_hash: string };
    expect(row.recovery_hash).toBe(auth.tokenHash(test.recoveryKey));
    expect(row.password_hash).toMatch(/^scrypt\$/);
    const state = await test.state();
    expect(state.body).not.toContain(test.recoveryKey);
    expect(state.body).not.toContain(row.recovery_hash);
    expect(
      (
        await test.app.inject({
          url: "/api/auth/me",
          cookies: { groundproof_session: test.token },
        })
      ).body,
    ).not.toContain("recovery");
    expect((await test.login()).json()).not.toHaveProperty("recoveryKey");
  });
  it("changes a password, rotates the current cookie and revokes every prior session", async () => {
    const test = await setup(),
      other = (await test.login()).cookies[0].value;
    const changed = await test.post("/api/auth/password", {
      currentPassword: oldPassword,
      newPassword,
    });
    expect(changed.statusCode).toBe(200);
    const next = changed.cookies[0].value;
    expect(next).not.toBe(test.token);
    expect(changed.json().user.id).toBe(test.user.id);
    expect((await test.state()).statusCode).toBe(401);
    expect((await test.state(other)).statusCode).toBe(401);
    expect((await test.state(next)).statusCode).toBe(200);
    expect((await test.login()).statusCode).toBe(401);
    expect((await test.login(newPassword)).statusCode).toBe(200);
    expect(
      auth.verifyRecoveryKey(
        test.recoveryKey,
        (
          test.db
            .prepare("SELECT recovery_hash FROM users WHERE id=?")
            .get(test.user.id) as { recovery_hash: string }
        ).recovery_hash,
      ),
    ).toBe(true);
  });
  it("recovers without an existing session, consumes the key and returns a new key exactly once", async () => {
    const test = await setup(),
      other = (await test.login()).cookies[0].value;
    const payload = {
      email: test.email,
      recoveryKey: test.recoveryKey.toLowerCase(),
      newPassword,
    };
    const recovered = await test.app.inject({
      method: "POST",
      url: "/api/auth/recover",
      payload,
    });
    expect(recovered.statusCode).toBe(200);
    expect(recovered.json().recoveryKey).not.toBe(test.recoveryKey);
    expect(recovered.json().user.id).toBe(test.user.id);
    expect((await test.state()).statusCode).toBe(401);
    expect((await test.state(other)).statusCode).toBe(401);
    expect((await test.state(recovered.cookies[0].value)).statusCode).toBe(200);
    expect(
      (
        await test.app.inject({
          method: "POST",
          url: "/api/auth/recover",
          payload,
        })
      ).statusCode,
    ).toBe(401);
    expect((await test.login()).statusCode).toBe(401);
    expect((await test.login(newPassword)).statusCode).toBe(200);
    const audit = test.db
      .prepare("SELECT data FROM audit WHERE tenant_id=?")
      .all(test.user.id) as { data: string }[];
    const serialized = JSON.stringify(audit);
    expect(serialized).not.toContain(test.recoveryKey);
    expect(serialized).not.toContain(recovered.json().recoveryKey);
    expect(serialized).not.toContain(newPassword);
  });
  it("allows only one concurrent password change and revokes the losing request's session", async () => {
    const test = await setup();
    const responses = await Promise.all([
      test.post("/api/auth/password", {
        currentPassword: oldPassword,
        newPassword,
      }),
      test.post("/api/auth/password", {
        currentPassword: oldPassword,
        newPassword: newPassword + " second",
      }),
    ]);
    expect(responses.map((response) => response.statusCode).sort()).toEqual([
      200, 409,
    ]);
    const success = responses.find((response) => response.statusCode === 200)!;
    expect((await test.state()).statusCode).toBe(401);
    expect((await test.state(success.cookies[0].value)).statusCode).toBe(200);
    expect(
      (
        test.db
          .prepare("SELECT COUNT(*) AS count FROM sessions WHERE user_id=?")
          .get(test.user.id) as { count: number }
      ).count,
    ).toBe(1);
  });
  it("migrates existing version-four accounts without inventing a recoverable key or losing data", async () => {
    const test = await setup();
    test.db.exec(
      "ALTER TABLE users DROP COLUMN recovery_hash; PRAGMA user_version = 4;",
    );
    initializeDatabase(test.db);
    expect(test.db.pragma("user_version", { simple: true })).toBe(5);
    const row = test.db
      .prepare("SELECT recovery_hash,name,email FROM users WHERE id=?")
      .get(test.user.id) as {
      recovery_hash: null;
      name: string;
      email: string;
    };
    expect(row).toEqual({
      recovery_hash: null,
      name: test.user.name,
      email: test.email,
    });
    expect((await test.login()).statusCode).toBe(200);
    const generated = await test.post("/api/auth/recovery-key", {
      currentPassword: oldPassword,
    });
    expect(generated.statusCode).toBe(200);
    expect(generated.json().recoveryKey).toMatch(/^GP-[A-F0-9]{64}$/);
  });
  it("allows only one concurrent recovery with the same key", async () => {
    const test = await setup();
    const request = {
      method: "POST" as const,
      url: "/api/auth/recover",
      payload: {
        email: test.email,
        recoveryKey: test.recoveryKey,
        newPassword,
      },
    };
    const responses = await Promise.all([
      test.app.inject(request),
      test.app.inject(request),
    ]);
    expect(responses.map((response) => response.statusCode).sort()).toEqual([
      200, 401,
    ]);
    const success = responses.find((response) => response.statusCode === 200)!;
    expect((await test.state(success.cookies[0].value)).statusCode).toBe(200);
    expect(
      (
        test.db
          .prepare("SELECT COUNT(*) AS count FROM sessions WHERE user_id=?")
          .get(test.user.id) as { count: number }
      ).count,
    ).toBe(1);
  });
  it("rotates recovery keys for an existing account without exposing old keys", async () => {
    const test = await setup();
    test.db
      .prepare("UPDATE users SET recovery_hash=NULL WHERE id=?")
      .run(test.user.id);
    expect(
      (
        await test.post("/api/auth/recovery-key", {
          currentPassword: "incorrect",
        })
      ).statusCode,
    ).toBe(401);
    const first = await test.post("/api/auth/recovery-key", {
      currentPassword: oldPassword,
    });
    expect(first.statusCode).toBe(200);
    const second = await test.post("/api/auth/recovery-key", {
      currentPassword: oldPassword,
    });
    expect(second.statusCode).toBe(200);
    expect(first.json().recoveryKey).not.toBe(second.json().recoveryKey);
    const recover = (key: string) =>
      test.app.inject({
        method: "POST",
        url: "/api/auth/recover",
        payload: { email: test.email, recoveryKey: key, newPassword },
      });
    expect((await recover(first.json().recoveryKey)).statusCode).toBe(401);
    expect((await recover(second.json().recoveryKey)).statusCode).toBe(200);
  });
  it("uses the same failure response for nonexistent accounts, wrong keys and demo accounts", async () => {
    const test = await setup(),
      demo = await test.app.inject({ method: "POST", url: "/api/demo/start" });
    const requests = [
      { email: "unknown@example.com", recoveryKey: test.recoveryKey },
      { email: test.email, recoveryKey: "GP-" + "0".repeat(64) },
      { email: demo.json().user.email, recoveryKey: test.recoveryKey },
    ];
    const responses = await Promise.all(
      requests.map((input) =>
        test.app.inject({
          method: "POST",
          url: "/api/auth/recover",
          payload: { ...input, newPassword },
        }),
      ),
    );
    expect(responses.every((response) => response.statusCode === 401)).toBe(
      true,
    );
    expect(new Set(responses.map((response) => response.body)).size).toBe(1);
    expect(
      (
        await test.post(
          "/api/auth/password",
          { currentPassword: oldPassword, newPassword },
          demo.cookies[0].value,
        )
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await test.post(
          "/api/auth/recovery-key",
          { currentPassword: oldPassword },
          demo.cookies[0].value,
        )
      ).statusCode,
    ).toBe(403);
  });
  it("applies persistent identity budgets independently to recovery and password reauthentication", async () => {
    const test = await setup();
    for (let i = 0; i < 10; i++)
      expect(
        (
          await test.app.inject({
            method: "POST",
            url: "/api/auth/recover",
            payload: { email: test.email, recoveryKey: "wrong", newPassword },
          })
        ).statusCode,
      ).toBe(401);
    expect(
      (
        await test.app.inject({
          method: "POST",
          url: "/api/auth/recover",
          payload: {
            email: test.email,
            recoveryKey: test.recoveryKey,
            newPassword,
          },
        })
      ).statusCode,
    ).toBe(429);
    for (let i = 0; i < 10; i++)
      expect(
        (
          await test.post("/api/auth/recovery-key", {
            currentPassword: "incorrect",
          })
        ).statusCode,
      ).toBe(401);
    expect(
      (
        await test.post("/api/auth/recovery-key", {
          currentPassword: oldPassword,
        })
      ).statusCode,
    ).toBe(429);
    expect((await test.login()).statusCode).toBe(200);
  });
  it("logs out all sessions and rejects cross-origin recovery changes", async () => {
    const test = await setup(),
      other = (await test.login()).cookies[0].value;
    expect(
      (
        await test.app.inject({
          method: "POST",
          url: "/api/auth/recover",
          headers: { origin: "https://attacker.example" },
          payload: {
            email: test.email,
            recoveryKey: test.recoveryKey,
            newPassword,
          },
        })
      ).statusCode,
    ).toBe(403);
    expect((await test.post("/api/auth/logout-all", {})).statusCode).toBe(200);
    expect((await test.state()).statusCode).toBe(401);
    expect((await test.state(other)).statusCode).toBe(401);
  });
  it("rejects a password login verified against credentials replaced during scrypt", async () => {
    const test = await setup(),
      originalVerify = auth.verifyPassword;
    let release!: () => void, entered!: () => void;
    const gate = new Promise<void>((resolve) => {
        release = resolve;
      }),
      started = new Promise<void>((resolve) => {
        entered = resolve;
      });
    vi.spyOn(auth, "verifyPassword").mockImplementation(
      async (password, encoded) => {
        entered();
        await gate;
        return originalVerify(password, encoded);
      },
    );
    const pending = Promise.resolve(test.login());
    await started;
    const replacement = await auth.hashPassword(newPassword);
    test.db
      .prepare("UPDATE users SET password_hash=? WHERE id=?")
      .run(replacement, test.user.id);
    test.db.prepare("DELETE FROM sessions WHERE user_id=?").run(test.user.id);
    release();
    expect((await pending).statusCode).toBe(401);
    expect(
      (
        test.db
          .prepare("SELECT COUNT(*) AS count FROM sessions WHERE user_id=?")
          .get(test.user.id) as { count: number }
      ).count,
    ).toBe(0);
  });
  it("caps stored active sessions at twenty without reviving evicted tokens", async () => {
    const test = await setup();
    let newest = test.token;
    for (let i = 0; i < 21; i++) newest = (await test.login()).cookies[0].value;
    expect(
      (
        test.db
          .prepare("SELECT COUNT(*) AS count FROM sessions WHERE user_id=?")
          .get(test.user.id) as { count: number }
      ).count,
    ).toBe(20);
    expect((await test.state()).statusCode).toBe(401);
    expect((await test.state(newest)).statusCode).toBe(200);
  });
});
