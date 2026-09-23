import type { Db } from "./db.js";

/** Shared supplier budget. Reservations count attempted calls, including unsuccessful upstream requests. */
export function reserveAnakinCapture(
  db: Db,
  tenant: string,
  now = new Date(),
): boolean {
  const configured = Number(process.env.ANAKIN_DAILY_LIMIT ?? 30);
  const limit =
    Number.isInteger(configured) && configured >= 0 && configured <= 10000
      ? configured
      : 0;
  const day = now.toISOString().slice(0, 10);
  return db.transaction(() => {
    const total = db
      .prepare("SELECT count AS n FROM provider_daily_usage WHERE day=?")
      .get(day) as { n: number } | undefined;
    if ((total?.n ?? 0) >= limit) return false;
    const account = db
      .prepare("SELECT demo FROM users WHERE id=?")
      .get(tenant) as { demo: number } | undefined;
    if (!account) return false;
    const own = db
      .prepare("SELECT count FROM provider_usage WHERE day=? AND tenant_id=?")
      .get(day, tenant) as { count: number } | undefined;
    if (account.demo && (own?.count ?? 0) >= 3) return false;
    db.prepare(
      "INSERT INTO provider_usage(day,tenant_id,count) VALUES(?,?,1) ON CONFLICT(day,tenant_id) DO UPDATE SET count=count+1",
    ).run(day, tenant);
    db.prepare(
      "INSERT INTO provider_daily_usage(day,count) VALUES(?,1) ON CONFLICT(day) DO UPDATE SET count=count+1",
    ).run(day);
    return true;
  })();
}
