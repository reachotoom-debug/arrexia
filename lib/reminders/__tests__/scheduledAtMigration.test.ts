import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const MIGRATION_VERSION = "20260809100000";
const MIGRATION_PATH = `supabase/migrations/${MIGRATION_VERSION}_recurring_overdue_chase.sql`;
const MIGRATIONS_DIR = "supabase/migrations";

describe("reminders.scheduled_at migration contract", () => {
  const migration = readFileSync(MIGRATION_PATH, "utf8");

  it("migration adds nullable date column with IF NOT EXISTS only", () => {
    assert.match(
      migration,
      /ALTER TABLE public\.reminders\s+ADD COLUMN IF NOT EXISTS scheduled_at date/i
    );
    assert.doesNotMatch(migration, /DROP COLUMN/i);
    assert.doesNotMatch(migration, /NOT NULL/i);
    assert.doesNotMatch(migration, /CREATE (UNIQUE )?INDEX/i);
    assert.doesNotMatch(migration, /CREATE OR REPLACE FUNCTION/i);
  });

  it("no later migration modifies or drops scheduled_at", () => {
    const laterMigrations = readdirSync(MIGRATIONS_DIR)
      .filter((name) => name.endsWith(".sql"))
      .filter((name) => name.localeCompare(`${MIGRATION_VERSION}_recurring_overdue_chase.sql`) > 0);

    for (const filename of laterMigrations) {
      const sql = readFileSync(join(MIGRATIONS_DIR, filename), "utf8");
      assert.doesNotMatch(
        sql,
        /scheduled_at/i,
        `unexpected scheduled_at reference in ${filename}`
      );
    }
  });

  it("generated types treat scheduled_at as nullable", () => {
    const types = readFileSync("types/supabase.ts", "utf8");
    assert.match(types, /scheduled_at: string \| null/);
    assert.match(types, /scheduled_at\?: string \| null/);
  });

  it("send path writes scheduled_at on reminder log insert", () => {
    const sendSrc = readFileSync("lib/reminders/send.ts", "utf8");
    assert.match(sendSrc, /scheduled_at: occurrenceScheduledAt/);
  });

  it("eligibility resolves legacy NULL scheduled_at from rule metadata", () => {
    const eligibilitySrc = readFileSync("lib/reminders/eligibility.ts", "utf8");
    assert.match(eligibilitySrc, /Legacy rows \(scheduled_at NULL\)/);
    assert.match(eligibilitySrc, /resolveEntryOccurrenceScheduledDate/);
  });
});
