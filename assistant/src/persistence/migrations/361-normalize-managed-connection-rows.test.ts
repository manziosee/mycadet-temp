import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";

import { drizzle } from "drizzle-orm/bun-sqlite";

import * as schema from "../schema/index.js";
import { migrateNormalizeManagedConnectionRows } from "./361-normalize-managed-connection-rows.js";

function createTestDb() {
  const sqlite = new Database(":memory:");
  sqlite.exec(/*sql*/ `
    CREATE TABLE provider_connections (
      name        TEXT PRIMARY KEY,
      provider    TEXT NOT NULL,
      auth        TEXT NOT NULL,
      label       TEXT,
      base_url    TEXT,
      models      TEXT,
      created_at  INTEGER NOT NULL,
      updated_at  INTEGER NOT NULL
    );
  `);
  return { sqlite, db: drizzle(sqlite, { schema }) };
}

function insertRow(
  sqlite: Database,
  name: string,
  provider: string,
  auth: string,
): void {
  sqlite
    .query(
      /*sql*/ `INSERT INTO provider_connections (name, provider, auth, created_at, updated_at)
       VALUES (?, ?, ?, 1, 1)`,
    )
    .run(name, provider, auth);
}

function readRows(db: ReturnType<typeof createTestDb>["db"]) {
  return db
    .select({
      name: schema.providerConnections.name,
      provider: schema.providerConnections.provider,
      auth: schema.providerConnections.auth,
    })
    .from(schema.providerConnections)
    .orderBy(schema.providerConnections.name)
    .all();
}

function readRow(
  db: ReturnType<typeof createTestDb>["db"],
  name: string,
): { provider: string; auth: string } {
  const row = readRows(db).find((r) => r.name === name);
  if (!row) {
    throw new Error(`row "${name}" not found`);
  }
  return row;
}

describe("migration 361: normalize cloud connection rows", () => {
  test("rewrites a cloud-auth row with a concrete provider to provider cadet", () => {
    const { sqlite, db } = createTestDb();
    insertRow(sqlite, "managed-openai", "openai", '{"type":"platform"}');

    migrateNormalizeManagedConnectionRows(db);

    const row = readRow(db, "managed-openai");
    expect(row.provider).toBe("cadet");
    expect(JSON.parse(row.auth)).toEqual({ type: "platform" });
  });

  test("heals a stuck legacy canonical row (name cadet, concrete provider, platform auth)", () => {
    const { sqlite, db } = createTestDb();
    insertRow(sqlite, "cadet", "anthropic", '{"type":"platform"}');

    migrateNormalizeManagedConnectionRows(db);

    expect(readRow(db, "cadet").provider).toBe("cadet");
  });

  test("rewrites a cadet-provider row with non-cloud auth to platform auth", () => {
    const { sqlite, db } = createTestDb();
    insertRow(
      sqlite,
      "keyed-cadet",
      "cadet",
      '{"type":"api_key","credential":"vault/x"}',
    );
    insertRow(sqlite, "none-cadet", "cadet", '{"type":"none"}');

    migrateNormalizeManagedConnectionRows(db);

    expect(JSON.parse(readRow(db, "keyed-cadet").auth)).toEqual({
      type: "platform",
    });
    expect(JSON.parse(readRow(db, "none-cadet").auth)).toEqual({
      type: "platform",
    });
  });

  test("leaves consistent rows untouched", () => {
    const { sqlite, db } = createTestDb();
    insertRow(sqlite, "cadet", "cadet", '{"type":"platform"}');
    insertRow(
      sqlite,
      "anthropic-key",
      "anthropic",
      '{"type":"api_key","credential":"vault/anthropic"}',
    );
    insertRow(
      sqlite,
      "chatgpt-subscription",
      "openai",
      '{"type":"oauth_subscription"}',
    );
    insertRow(sqlite, "ollama-local", "ollama", '{"type":"none"}');

    const before = readRows(db);
    migrateNormalizeManagedConnectionRows(db);

    expect(readRows(db)).toEqual(before);
  });

  test("leaves a BYOK row claiming the canonical name untouched", () => {
    const { sqlite, db } = createTestDb();
    insertRow(
      sqlite,
      "cadet",
      "anthropic",
      '{"type":"api_key","credential":"vault/anthropic"}',
    );

    migrateNormalizeManagedConnectionRows(db);

    const row = readRow(db, "cadet");
    expect(row.provider).toBe("anthropic");
    expect(JSON.parse(row.auth).type).toBe("api_key");
  });

  test("leaves a row with unparseable auth untouched", () => {
    const { sqlite, db } = createTestDb();
    insertRow(sqlite, "broken", "cadet", "not json");

    migrateNormalizeManagedConnectionRows(db);

    expect(readRow(db, "broken").auth).toBe("not json");
  });

  test("is idempotent", () => {
    const { sqlite, db } = createTestDb();
    insertRow(sqlite, "managed-openai", "openai", '{"type":"platform"}');
    insertRow(sqlite, "keyed-cadet", "cadet", '{"type":"api_key"}');

    migrateNormalizeManagedConnectionRows(db);
    const afterFirst = readRows(db);
    migrateNormalizeManagedConnectionRows(db);

    expect(readRows(db)).toEqual(afterFirst);
  });

  test("no-ops on a database from before the provider_connections table", () => {
    const sqlite = new Database(":memory:");
    const db = drizzle(sqlite, { schema });

    expect(() => migrateNormalizeManagedConnectionRows(db)).not.toThrow();
  });
});
