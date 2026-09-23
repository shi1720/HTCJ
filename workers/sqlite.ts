/** Small synchronous adapter for the SQL operations used by GroundProof.
 * This does not emulate every better-sqlite3 API. Cursors are consumed before returning.
 */
type Cursor = { toArray(): Record<string, unknown>[]; rowsWritten: number };
export interface SqliteStorage {
  sql: { exec(query: string, ...bindings: unknown[]): Cursor };
  transactionSync<T>(callback: () => T): T;
}

function sqliteError(error: unknown): never {
  if (
    error instanceof Error &&
    /UNIQUE constraint failed/i.test(error.message)
  ) {
    Object.assign(error, { code: "SQLITE_CONSTRAINT_UNIQUE" });
  }
  throw error;
}

// Only application-owned SQL reaches this adapter. Named input values remain bindings.
function bind(
  sql: string,
  args: unknown[],
): { query: string; values: unknown[] } {
  if (
    args.length !== 1 ||
    !args[0] ||
    typeof args[0] !== "object" ||
    Array.isArray(args[0]) ||
    ArrayBuffer.isView(args[0])
  )
    return { query: sql, values: args };
  const input = args[0] as Record<string, unknown>,
    values: unknown[] = [];
  const query = sql.replace(
    /'(?:(?:'')|[^'])*'|"(?:(?:"")|[^"])*"|--[^\n]*|\/\*[\s\S]*?\*\/|[@:$]([A-Za-z_]\w*)/g,
    (token, name: string | undefined) => {
      if (!name) return token;
      if (!Object.prototype.hasOwnProperty.call(input, name))
        throw new Error(`Missing SQL parameter: ${name}`);
      values.push(input[name]);
      return "?";
    },
  );
  return { query, values };
}

export class DurableSqlite {
  readonly open = true;
  constructor(private readonly storage: SqliteStorage) {
    // Durable SQL denies PRAGMA user_version, so persist the application's schema
    // version in a dedicated table rather than weakening the migration guard.
    storage.sql
      .exec(
        "CREATE TABLE IF NOT EXISTS _groundproof_metadata (key TEXT PRIMARY KEY, value INTEGER NOT NULL)",
      )
      .toArray();
  }
  private execute(sql: string, args: unknown[] = []) {
    const { query, values } = bind(sql, args);
    try {
      const cursor = this.storage.sql.exec(query, ...values);
      const rows = cursor.toArray();
      return { rows, written: cursor.rowsWritten };
    } catch (error) {
      return sqliteError(error);
    }
  }
  prepare(query: string) {
    return {
      all: (...args: unknown[]) => this.execute(query, args).rows,
      get: (...args: unknown[]) => this.execute(query, args).rows[0],
      run: (...args: unknown[]) => {
        this.execute(query, args);
        const row = this.execute(
          "SELECT changes() AS changed, last_insert_rowid() AS inserted",
        ).rows[0];
        return {
          changes: Number(row.changed),
          lastInsertRowid: Number(row.inserted),
        };
      },
    };
  }
  exec(query: string) {
    const rewritten = query.replace(
      /\bPRAGMA\s+user_version\s*=\s*(\d+)\s*;/gi,
      (_match, version: string) =>
        `INSERT INTO _groundproof_metadata(key,value) VALUES('schema_version',${Number(version)}) ON CONFLICT(key) DO UPDATE SET value=excluded.value;`,
    );
    this.execute(rewritten);
    return this;
  }
  pragma(query: string, options?: { simple?: boolean }) {
    // Cloudflare manages WAL and lock timing. Foreign keys stay explicitly enabled.
    if (/^\s*(journal_mode|busy_timeout)\s*=/i.test(query))
      return options?.simple ? undefined : [];
    if (/^\s*user_version\s*$/i.test(query)) {
      const version = Number(
        this.execute(
          "SELECT value FROM _groundproof_metadata WHERE key='schema_version'",
        ).rows[0]?.value ?? 0,
      );
      return options?.simple ? version : [{ user_version: version }];
    }
    const rows = this.execute(`PRAGMA ${query}`).rows;
    return options?.simple
      ? rows[0]
        ? Object.values(rows[0])[0]
        : undefined
      : rows;
  }
  transaction<T extends (...args: any[]) => any>(callback: T): T {
    return ((...args: Parameters<T>) =>
      this.storage.transactionSync(() => {
        const result = callback(...args);
        if (result && typeof result.then === "function")
          throw new Error("Database transactions must complete synchronously.");
        return result;
      })) as T;
  }
  close() {
    /* Durable Object storage lifetime belongs to Cloudflare. */
  }
}
