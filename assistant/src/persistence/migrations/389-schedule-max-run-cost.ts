import type { DrizzleDb } from "../db-connection.js";
import { getSqliteFrom } from "../db-connection.js";

/**
 * Add a nullable `max_run_cost_usd REAL` column to `cron_jobs`.
 *
 * The most a single run of the schedule may spend on LLM calls before the
 * scheduler stops the run and pauses the schedule. `NULL` (all pre-existing
 * rows) means no limit.
 *
 * Idempotent: the PRAGMA guard makes re-running a no-op once the column
 * exists.
 */
export function migrateScheduleMaxRunCost(database: DrizzleDb): void {
  const raw = getSqliteFrom(database);

  const columns = raw
    .query<{ name: string }, []>(`PRAGMA table_info(cron_jobs)`)
    .all();
  const columnNames = new Set(columns.map((c) => c.name));

  if (!columnNames.has("max_run_cost_usd")) {
    raw.exec(`ALTER TABLE cron_jobs ADD COLUMN max_run_cost_usd REAL`);
  }
}
