import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";

import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";

import * as schema from "../../schema/index.js";
import { migrateNormalizeOpencodeHostConnections } from "../383-normalize-opencode-host-connections.js";

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
  baseUrl: string | null,
): void {
  sqlite
    .query(
      /*sql*/ `INSERT INTO provider_connections (name, provider, auth, base_url, created_at, updated_at)
       VALUES (?, ?, '{"type":"api_key","credential":"cred"}', ?, 1, 1)`,
    )
    .run(name, provider, baseUrl);
}

function readProvider(
  db: ReturnType<typeof createTestDb>["db"],
  name: string,
): string | undefined {
  const row = db
    .select({ provider: schema.providerConnections.provider })
    .from(schema.providerConnections)
    .where(eq(schema.providerConnections.name, name))
    .get();
  return row?.provider;
}

describe("migration 383: normalize opencode-host connections", () => {
  test("restamps openai-compatible rows whose host is opencode.ai", () => {
    const { sqlite, db } = createTestDb();
    insertRow(
      sqlite,
      "go",
      "openai-compatible",
      "https://opencode.ai/zen/go/v1",
    );
    insertRow(sqlite, "zen", "openai-compatible", "https://opencode.ai/zen/v1");
    insertRow(sqlite, "sub", "openai-compatible", "https://api.opencode.ai/v1");
    insertRow(sqlite, "port", "openai-compatible", "https://opencode.ai:443");
    insertRow(sqlite, "vllm", "openai-compatible", "http://localhost:8080/v1");
    insertRow(sqlite, "no-url", "openai-compatible", null);
    insertRow(
      sqlite,
      "lookalike",
      "openai-compatible",
      "https://opencode.ai.evil.example/v1",
    );
    insertRow(
      sqlite,
      "path-only",
      "openai-compatible",
      "https://proxy.example/cache/api.opencode.ai/v1",
    );
    insertRow(sqlite, "garbage", "openai-compatible", "not a url");
    insertRow(sqlite, "ollama", "ollama", "https://opencode.ai/v1");

    migrateNormalizeOpencodeHostConnections(db);

    expect(readProvider(db, "go")).toBe("opencode");
    expect(readProvider(db, "zen")).toBe("opencode");
    expect(readProvider(db, "sub")).toBe("opencode");
    expect(readProvider(db, "port")).toBe("opencode");
    expect(readProvider(db, "vllm")).toBe("openai-compatible");
    expect(readProvider(db, "no-url")).toBe("openai-compatible");
    expect(readProvider(db, "lookalike")).toBe("openai-compatible");
    expect(readProvider(db, "path-only")).toBe("openai-compatible");
    expect(readProvider(db, "garbage")).toBe("openai-compatible");
    expect(readProvider(db, "ollama")).toBe("ollama");
  });

  test("is idempotent", () => {
    const { sqlite, db } = createTestDb();
    insertRow(
      sqlite,
      "go",
      "openai-compatible",
      "https://opencode.ai/zen/go/v1",
    );
    migrateNormalizeOpencodeHostConnections(db);
    migrateNormalizeOpencodeHostConnections(db);
    expect(readProvider(db, "go")).toBe("opencode");
  });
});
