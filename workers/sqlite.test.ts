import { describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { DurableSqlite } from "./sqlite.js";
import { initializeDatabase, type Db } from "../server/db.js";
function adapter() {
  const native = new Database(":memory:");
  const storage = {
    sql: {
      exec(query: string, ...bindings: unknown[]) {
        // Workerd accepts multiple DDL statements. Its cursor is consumed synchronously.
        let rows: Record<string, unknown>[] = [];
        if (
          bindings.length === 0 &&
          /;\s*\S/.test(query.trim().replace(/;$/, ""))
        )
          native.exec(query);
        else {
          const statement = native.prepare(query);
          if (statement.reader)
            rows = statement.all(...bindings) as Record<string, unknown>[];
          else statement.run(...bindings);
        }
        return { toArray: () => rows, rowsWritten: 0 };
      },
    },
    transactionSync: <T>(callback: () => T) => native.transaction(callback)(),
  };
  return { db: new DurableSqlite(storage), native };
}
describe("Durable SQL application adapter", () => {
  it("keeps schema version, named bindings, changes and unique error semantics", () => {
    const { db, native } = adapter();
    initializeDatabase(db as unknown as Db);
    expect(db.pragma("user_version", { simple: true })).toBe(4);
    const row = {
      id: "user1",
      name: "O'Brien @id",
      email: "user@example.invalid",
      workspace: "a",
      password_hash: "none",
      demo: 0,
      created_at: new Date().toISOString(),
    };
    expect(
      db
        .prepare(
          "INSERT INTO users(id,name,email,workspace,password_hash,demo,created_at) VALUES(@id,@name,@email,@workspace,@password_hash,@demo,@created_at)",
        )
        .run(row).changes,
    ).toBe(1);
    expect(
      db
        .prepare("SELECT name, '@notbound' AS literal FROM users WHERE id=@id")
        .get({ id: "user1" }),
    ).toEqual({ name: row.name, literal: "@notbound" });
    expect(
      db.prepare("UPDATE users SET name=? WHERE id=?").run("changed", "missing")
        .changes,
    ).toBe(0);
    expect(() =>
      db
        .prepare("INSERT INTO users SELECT * FROM users WHERE id=?")
        .run("user1"),
    ).toThrow(/UNIQUE/);
    try {
      db.prepare("INSERT INTO users SELECT * FROM users WHERE id=?").run(
        "user1",
      );
    } catch (error) {
      expect((error as { code: string }).code).toBe("SQLITE_CONSTRAINT_UNIQUE");
    }
    native.close();
  });
  it("rolls back failed transactions and rejects missing bindings", () => {
    const { db, native } = adapter();
    db.exec("CREATE TABLE example (id TEXT PRIMARY KEY)");
    expect(() =>
      db.transaction(() => {
        db.prepare("INSERT INTO example VALUES(?)").run("partial");
        throw new Error("abort");
      })(),
    ).toThrow("abort");
    expect(db.prepare("SELECT * FROM example").all()).toEqual([]);
    expect(() => db.prepare("SELECT @missing").get({ different: 1 })).toThrow(
      "Missing SQL parameter",
    );
    native.close();
  });
});
