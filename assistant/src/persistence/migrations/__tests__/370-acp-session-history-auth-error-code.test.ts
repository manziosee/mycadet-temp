/**
 * Migration 370 adds the nullable `auth_error_code` column that carries a
 * run's credential failure across a reload, and is idempotent so a repair flow
 * can re-run it.
 */

import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";

import { drizzle } from "drizzle-orm/bun-sqlite";

import { getSqliteFrom } from "../../db-connection.js";
import * as schema from "../../schema/index.js";
import { migrateAcpSessionHistoryAuthErrorCode } from "../370-acp-session-history-auth-error-code.js";

function createTestDb() {
  const sqlite = new Database(":memory:");
  sqlite.exec("PRAGMA journal_mode=WAL");
  sqlite.exec(
    "CREATE TABLE acp_session_history (id TEXT PRIMARY KEY, status TEXT)",
  );
  return drizzle(sqlite, { schema });
}

function columnNames(db: ReturnType<typeof createTestDb>): string[] {
  const rows = getSqliteFrom(db)
    .prepare<{ name: string }, []>("PRAGMA table_info(acp_session_history)")
    .all();
  return rows.map((row) => row.name);
}

describe("migrateAcpSessionHistoryAuthErrorCode", () => {
  test("adds the column when it is missing", () => {
    const db = createTestDb();

    migrateAcpSessionHistoryAuthErrorCode(db);

    expect(columnNames(db)).toContain("auth_error_code");
  });

  test("re-running is a no-op", () => {
    const db = createTestDb();

    migrateAcpSessionHistoryAuthErrorCode(db);
    migrateAcpSessionHistoryAuthErrorCode(db);

    expect(columnNames(db)).toContain("auth_error_code");
  });

  test("leaves existing rows null rather than inventing a failure", () => {
    const db = createTestDb();
    getSqliteFrom(db).exec(
      "INSERT INTO acp_session_history (id, status) VALUES ('run-1', 'completed')",
    );

    migrateAcpSessionHistoryAuthErrorCode(db);

    const row = getSqliteFrom(db)
      .prepare<
        { auth_error_code: string | null },
        []
      >("SELECT auth_error_code FROM acp_session_history WHERE id = 'run-1'")
      .get()!;
    expect(row.auth_error_code).toBeNull();
  });
});
