/** Native better-sqlite3 is unavailable in Workers. All Worker callers inject DurableSqlite. */
export default class NativeSqliteUnavailable {
  constructor() {
    throw new Error(
      "Cloudflare requires the injected Durable Object SQLite adapter.",
    );
  }
}
