import type { Db } from "./db.js";

/** Delete only expired sessions and old, inactive simulation accounts. Real accounts are never aged out. */
export function cleanupExpiredData(
  db: Db,
  now = new Date(),
  demoRetentionHours = 24,
) {
  const at = now.toISOString();
  const cutoff = new Date(
    now.getTime() - Math.max(24, demoRetentionHours) * 3600000,
  ).toISOString();
  return db.transaction(() => {
    const sessions = db
      .prepare("DELETE FROM sessions WHERE expires_at <= ?")
      .run(at).changes;
    const demos = db
      .prepare(
        `DELETE FROM users WHERE demo=1 AND created_at <= ? AND NOT EXISTS (SELECT 1 FROM sessions WHERE sessions.user_id=users.id)`,
      )
      .run(cutoff).changes;
    db.prepare("DELETE FROM provider_daily_usage WHERE day < ?").run(
      new Date(now.getTime() - 7 * 86400000).toISOString().slice(0, 10),
    );
    db.prepare("DELETE FROM provider_usage WHERE day < ?").run(
      new Date(now.getTime() - 7 * 86400000).toISOString().slice(0, 10),
    );
    const attempts = db
      .prepare("DELETE FROM login_attempts WHERE window_start <= ?")
      .run(now.getTime() - 86400000).changes;
    return { sessions, demos, attempts };
  })();
}

/** Persistent, identity-keyed login budget complements process-local IP throttling. */
export function reserveLoginAttempt(
  db: Db,
  key: string,
  now = Date.now(),
): boolean {
  return db.transaction(() => {
    const row = db
      .prepare(
        "SELECT attempts,window_start FROM login_attempts WHERE identity_hash=?",
      )
      .get(key) as { attempts: number; window_start: number } | undefined;
    if (row && now - row.window_start < 15 * 60000) {
      if (row.attempts >= 10) return false;
      db.prepare(
        "UPDATE login_attempts SET attempts=attempts+1 WHERE identity_hash=?",
      ).run(key);
    } else {
      const count = db
        .prepare("SELECT COUNT(*) AS n FROM login_attempts")
        .get() as { n: number };
      if (!row && count.n >= 100000) return false;
      db.prepare(
        "INSERT INTO login_attempts(identity_hash,attempts,window_start) VALUES(?,1,?) ON CONFLICT(identity_hash) DO UPDATE SET attempts=1,window_start=excluded.window_start",
      ).run(key, now);
    }
    return true;
  })();
}
