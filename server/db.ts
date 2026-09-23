import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import type { AuditEvent } from "../shared/types.js";

export type Db = Database.Database;
export function openDatabase(
  filename = process.env.DATABASE_PATH || "./data/groundproof.sqlite",
): Db {
  if (filename !== ":memory:")
    mkdirSync(dirname(resolve(filename)), { recursive: true, mode: 0o700 });
  const db = new Database(filename);
  return initializeDatabase(db);
}
export function initializeDatabase(db: Db): Db {
  const version = db.pragma("user_version", { simple: true }) as number;
  if (version > 5) {
    db.close();
    throw new Error(
      "This database was created by a newer GroundProof release. Upgrade the application before opening it.",
    );
  }
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      workspace TEXT NOT NULL, password_hash TEXT NOT NULL, demo INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);
    CREATE TABLE IF NOT EXISTS sites (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, data TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS sites_tenant ON sites(tenant_id);
    CREATE TABLE IF NOT EXISTS sources (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, data TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS sources_tenant ON sources(tenant_id);
    CREATE TABLE IF NOT EXISTS snapshots (
      id TEXT PRIMARY KEY, source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
      tenant_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, data TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS snapshots_tenant_source ON snapshots(tenant_id,source_id);
    CREATE TABLE IF NOT EXISTS missions (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      data TEXT NOT NULL, invalidated INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS missions_tenant ON missions(tenant_id);
    CREATE TABLE IF NOT EXISTS audit (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, data TEXT NOT NULL, object_id TEXT
    );
    CREATE INDEX IF NOT EXISTS audit_tenant ON audit(tenant_id);
    CREATE TABLE IF NOT EXISTS login_attempts (
      identity_hash TEXT PRIMARY KEY, attempts INTEGER NOT NULL, window_start INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS login_attempts_window ON login_attempts(window_start);
    CREATE TABLE IF NOT EXISTS provider_usage (
      day TEXT NOT NULL, tenant_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      count INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(day,tenant_id)
    );
    CREATE TABLE IF NOT EXISTS provider_daily_usage (
      day TEXT PRIMARY KEY, count INTEGER NOT NULL DEFAULT 0
    );
    INSERT OR IGNORE INTO provider_daily_usage(day,count) SELECT day,SUM(count) FROM provider_usage GROUP BY day;
    CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
    PRAGMA user_version = 5;
  `);
  const userColumns = db.pragma("table_info(users)") as { name: string }[];
  if (!userColumns.some((column) => column.name === "recovery_hash"))
    db.exec("ALTER TABLE users ADD COLUMN recovery_hash TEXT");
  const auditColumns = db.pragma("table_info(audit)") as { name: string }[];
  if (!auditColumns.some((column) => column.name === "object_id"))
    db.exec("ALTER TABLE audit ADD COLUMN object_id TEXT");
  db.exec(
    "CREATE INDEX IF NOT EXISTS audit_object ON audit(tenant_id,object_id)",
  );
  return db;
}

type DataTable = "sites" | "sources" | "missions" | "audit";
export function listData<T>(db: Db, table: DataTable, tenant: string): T[] {
  const rows = db
    .prepare(`SELECT data FROM ${table} WHERE tenant_id = ? ORDER BY rowid`)
    .all(tenant) as { data: string }[];
  return rows.map((row) => JSON.parse(row.data) as T);
}
export function getData<T>(
  db: Db,
  table: DataTable,
  tenant: string,
  id: string,
): T | null {
  const row = db
    .prepare(`SELECT data FROM ${table} WHERE tenant_id = ? AND id = ?`)
    .get(tenant, id) as { data: string } | undefined;
  return row ? (JSON.parse(row.data) as T) : null;
}
export function insertData(
  db: Db,
  table: DataTable,
  tenant: string,
  data: { id: string },
) {
  db.prepare(`INSERT INTO ${table}(id,tenant_id,data) VALUES(?,?,?)`).run(
    data.id,
    tenant,
    JSON.stringify(data),
  );
}
export function updateData(
  db: Db,
  table: Exclude<DataTable, "audit">,
  tenant: string,
  data: { id: string },
) {
  db.prepare(`UPDATE ${table} SET data = ? WHERE tenant_id = ? AND id = ?`).run(
    JSON.stringify(data),
    tenant,
    data.id,
  );
}
export function appendAudit(
  db: Db,
  tenant: string,
  actor: string,
  action: string,
  objectName: string,
  detail: string,
  objectId?: string,
): AuditEvent {
  const event: AuditEvent = {
    id: randomUUID(),
    at: new Date().toISOString(),
    actor,
    action,
    objectName,
    detail,
  };
  db.prepare(
    "INSERT INTO audit(id,tenant_id,data,object_id) VALUES(?,?,?,?)",
  ).run(event.id, tenant, JSON.stringify(event), objectId ?? null);
  return event;
}

export function recentAudit(db: Db, tenant: string, limit = 250): AuditEvent[] {
  const rows = db
    .prepare(
      "SELECT data FROM audit WHERE tenant_id=? ORDER BY rowid DESC LIMIT ?",
    )
    .all(tenant, limit) as { data: string }[];
  return rows.map((row) => JSON.parse(row.data) as AuditEvent);
}
export function objectAudit(
  db: Db,
  tenant: string,
  objectIds: string[],
): AuditEvent[] {
  if (!objectIds.length) return [];
  const placeholders = objectIds.map(() => "?").join(",");
  const rows = db
    .prepare(
      `SELECT data FROM audit WHERE tenant_id=? AND object_id IN (${placeholders}) ORDER BY rowid`,
    )
    .all(tenant, ...objectIds) as { data: string }[];
  return rows.map((row) => JSON.parse(row.data) as AuditEvent);
}
