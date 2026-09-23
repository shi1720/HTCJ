import { createHash } from "node:crypto";
import { z } from "zod";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Db } from "./db.js";
import { appendAudit } from "./db.js";
import {
  clearSession,
  createSession,
  hashPassword,
  newRecoveryKey,
  publicUser,
  sessionUser,
  verifyPassword,
  verifyRecoveryKey,
  type UserRow,
} from "./auth.js";
import { fail } from "./errors.js";
import { reserveLoginAttempt } from "./maintenance.js";

const password = z.string().min(12, "Use at least 12 characters.").max(256);
const currentPassword = z.string().min(1).max(256);
const limited = { config: { rateLimit: { max: 12, timeWindow: "1 minute" } } };
function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success)
    fail(
      400,
      parsed.error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("; ")
        .slice(0, 500),
    );
  return parsed.data;
}
function budget(db: Db, purpose: string, email: string) {
  const key = createHash("sha256").update(`${purpose}:${email}`).digest("hex");
  if (!reserveLoginAttempt(db, key))
    fail(429, "Too many account-security attempts. Try again in 15 minutes.");
  return key;
}
function clearBudgets(db: Db, keys: string[]) {
  for (const key of keys)
    db.prepare("DELETE FROM login_attempts WHERE identity_hash=?").run(key);
}
function freshRow(db: Db, id: string): UserRow {
  return (
    (db
      .prepare("SELECT * FROM users WHERE id=? AND demo=0")
      .get(id) as UserRow) ??
    fail(401, "The account is no longer available. Sign in again.")
  );
}
function currentCredentials(
  db: Db,
  request: FastifyRequest,
  before: UserRow,
): UserRow {
  const row = freshRow(db, before.id);
  if (
    sessionUser(db, request.cookies.groundproof_session)?.id !== before.id ||
    row.password_hash !== before.password_hash ||
    row.recovery_hash !== before.recovery_hash
  )
    fail(
      409,
      "Account credentials changed during this request. Sign in again before retrying.",
    );
  return row;
}
export function registerAccountSecurity(
  app: FastifyInstance,
  db: Db,
  secure: boolean,
) {
  async function reauthenticate(request: FastifyRequest, supplied: string) {
    if (!request.user || request.user.demo)
      fail(403, "Account security changes require a registered account.");
    const before = freshRow(db, request.user.id),
      key = budget(db, "account-security", before.email);
    if (!(await verifyPassword(supplied, before.password_hash)))
      fail(401, "Current password is incorrect.");
    return { before, key };
  }
  function replaceSessions(
    row: UserRow,
    reply: FastifyReply,
    oldToken?: string,
  ) {
    db.prepare("DELETE FROM sessions WHERE user_id=?").run(row.id);
    const user = publicUser(row);
    createSession(db, user, reply, secure, oldToken);
    return user;
  }
  app.post("/api/auth/password", limited, async (request, reply) => {
    const input = parse(
      z.object({ currentPassword, newPassword: password }).strict(),
      request.body,
    );
    const { before, key } = await reauthenticate(
      request,
      input.currentPassword,
    );
    if (input.currentPassword === input.newPassword)
      fail(
        400,
        "Choose a new password that differs from the current password.",
      );
    const passwordHash = await hashPassword(input.newPassword);
    const user = db.transaction(() => {
      const row = currentCredentials(db, request, before);
      db.prepare("UPDATE users SET password_hash=? WHERE id=?").run(
        passwordHash,
        row.id,
      );
      clearBudgets(db, [
        key,
        createHash("sha256").update(row.email).digest("hex"),
      ]);
      appendAudit(
        db,
        row.id,
        row.name,
        "account.password_changed",
        row.workspace,
        "Changed the account password and revoked all prior sessions.",
      );
      return replaceSessions(row, reply, request.cookies.groundproof_session);
    })();
    return { user };
  });
  app.post("/api/auth/recovery-key", limited, async (request) => {
    const input = parse(z.object({ currentPassword }).strict(), request.body),
      { before, key } = await reauthenticate(request, input.currentPassword);
    const replacement = newRecoveryKey();
    db.transaction(() => {
      const row = currentCredentials(db, request, before);
      db.prepare("UPDATE users SET recovery_hash=? WHERE id=?").run(
        replacement.hash,
        row.id,
      );
      clearBudgets(db, [key]);
      appendAudit(
        db,
        row.id,
        row.name,
        "account.recovery_key_rotated",
        row.workspace,
        "Generated a replacement recovery key. The previous key is no longer valid. The key itself is never written to the audit trail.",
      );
    })();
    return { recoveryKey: replacement.key };
  });
  app.post("/api/auth/recover", limited, async (request, reply) => {
    const input = parse(
      z
        .object({
          email: z
            .string()
            .trim()
            .email()
            .max(254)
            .transform((value) => value.toLowerCase()),
          recoveryKey: z.string().trim().min(1).max(200),
          newPassword: password,
        })
        .strict(),
      request.body,
    );
    const key = budget(db, "account-recovery", input.email);
    const before = db
      .prepare("SELECT * FROM users WHERE email=? AND demo=0")
      .get(input.email) as UserRow | undefined;
    if (!verifyRecoveryKey(input.recoveryKey, before?.recovery_hash) || !before)
      fail(
        401,
        "Email or recovery key is incorrect, unavailable or already used.",
      );
    const passwordHash = await hashPassword(input.newPassword),
      replacement = newRecoveryKey();
    const user = db.transaction(() => {
      const row = freshRow(db, before.id);
      if (
        row.recovery_hash !== before.recovery_hash ||
        row.password_hash !== before.password_hash
      )
        fail(
          401,
          "Email or recovery key is incorrect, unavailable or already used.",
        );
      db.prepare(
        "UPDATE users SET password_hash=?,recovery_hash=? WHERE id=?",
      ).run(passwordHash, replacement.hash, row.id);
      clearBudgets(db, [
        key,
        createHash("sha256").update(row.email).digest("hex"),
      ]);
      appendAudit(
        db,
        row.id,
        row.name,
        "account.recovered",
        row.workspace,
        "Recovered the account using its single-use recovery key, replaced that key and revoked all prior sessions.",
      );
      return replaceSessions(row, reply, request.cookies.groundproof_session);
    })();
    return { user, recoveryKey: replacement.key };
  });
  app.post("/api/auth/logout-all", async (request, reply) => {
    const user = request.user!;
    db.transaction(() => {
      db.prepare("DELETE FROM sessions WHERE user_id=?").run(user.id);
      appendAudit(
        db,
        user.id,
        user.name,
        "account.sessions_revoked",
        user.workspace,
        "Signed out every active session for this account.",
      );
    })();
    clearSession(db, reply, secure, request.cookies.groundproof_session);
    return { ok: true };
  });
}
