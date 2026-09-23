import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import type { Db } from "./db.js";
import type { User } from "../shared/types.js";
import type { FastifyReply } from "fastify";

const SCRYPT_OPTIONS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
function scrypt(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scryptCallback(password, salt, 64, SCRYPT_OPTIONS, (err, key) =>
      err ? reject(err) : resolve(key),
    ),
  );
}
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(24).toString("hex");
  return `scrypt$16384$${salt}$${(await scrypt(password, salt)).toString("hex")}`;
}
const DUMMY_HASH = `scrypt$16384$${"a".repeat(48)}$${"0".repeat(128)}`;
export async function verifyPassword(
  password: string,
  encoded?: string,
): Promise<boolean> {
  const parts = (encoded || DUMMY_HASH).split("$");
  const expected = Buffer.from(parts[3] || "", "hex");
  const actual = await scrypt(password, parts[2] || "invalid");
  return (
    expected.length === actual.length &&
    timingSafeEqual(actual, expected) &&
    Boolean(encoded)
  );
}
export interface UserRow {
  id: string;
  name: string;
  email: string;
  workspace: string;
  password_hash: string;
  demo: number;
  created_at: string;
}
export function publicUser(row: UserRow): User {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    workspace: row.workspace,
    demo: Boolean(row.demo),
  };
}
export function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
export function sessionUser(db: Db, token?: string): User | null {
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const row = db
    .prepare(
      `SELECT users.* FROM users JOIN sessions ON sessions.user_id = users.id WHERE sessions.token_hash = ? AND sessions.expires_at > ?`,
    )
    .get(tokenHash(token), new Date().toISOString()) as UserRow | undefined;
  return row ? publicUser(row) : null;
}
export function createSession(
  db: Db,
  user: User,
  reply: FastifyReply,
  secure: boolean,
  oldToken?: string,
) {
  const token = randomBytes(32).toString("hex");
  const maxAge = user.demo ? 86400 : 604800;
  db.transaction(() => {
    db.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(
      new Date().toISOString(),
    );
    if (oldToken)
      db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(
        tokenHash(oldToken),
      );
    db.prepare(
      "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)",
    ).run(
      tokenHash(token),
      user.id,
      new Date(Date.now() + maxAge * 1000).toISOString(),
    );
  })();
  reply.setCookie("groundproof_session", token, {
    path: "/",
    httpOnly: true,
    sameSite: "strict",
    secure,
    maxAge,
  });
}
export function clearSession(
  db: Db,
  reply: FastifyReply,
  secure: boolean,
  token?: string,
) {
  if (token)
    db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(
      tokenHash(token),
    );
  reply.clearCookie("groundproof_session", {
    path: "/",
    httpOnly: true,
    sameSite: "strict",
    secure,
  });
}
