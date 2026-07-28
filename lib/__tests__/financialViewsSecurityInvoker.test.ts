import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const MIGRATION_PATH =
  "supabase/migrations/20260729000000_financial_views_security_invoker.sql";

const CANONICAL_VIEWS = ["invoices_view", "payments_view"] as const;

const DEPENDENT_VIEWS = [
  "invoice_risk_view",
  "payment_eligible_clients",
  "payments_orphans",
] as const;

describe("financial views security_invoker migration contract", () => {
  const migration = readFileSync(MIGRATION_PATH, "utf8");

  for (const viewName of CANONICAL_VIEWS) {
    it(`${viewName} — sets security_invoker=true via ALTER VIEW`, () => {
      assert.match(
        migration,
        new RegExp(
          `ALTER VIEW public\\.${viewName}\\s+SET \\(security_invoker = true\\)`,
          "i"
        )
      );
    });
  }

  for (const viewName of DEPENDENT_VIEWS) {
    it(`${viewName} — sets security_invoker=true (dependent view)`, () => {
      assert.match(
        migration,
        new RegExp(
          `ALTER VIEW public\\.${viewName}\\s+SET \\(security_invoker = true\\)`,
          "i"
        )
      );
    });
  }

  it("does not recreate views (ALTER VIEW only)", () => {
    const sqlOnly = migration
      .split("\n")
      .filter((line) => !line.trim().startsWith("--"))
      .join("\n");
    assert.doesNotMatch(sqlOnly, /CREATE\s+(OR\s+REPLACE\s+)?VIEW/i);
    assert.doesNotMatch(sqlOnly, /DROP VIEW/i);
  });

  it("revokes anon SELECT on all financial views", () => {
    for (const viewName of [...CANONICAL_VIEWS, ...DEPENDENT_VIEWS]) {
      assert.match(
        migration,
        new RegExp(`REVOKE SELECT ON public\\.${viewName} FROM anon`, "i")
      );
    }
  });

  it("does not revoke authenticated SELECT", () => {
    assert.doesNotMatch(migration, /REVOKE SELECT[\s\S]*FROM authenticated/i);
  });

  it("reloads PostgREST schema cache", () => {
    assert.match(migration, /pg_notify\('pgrst', 'reload schema'\)/);
  });
});
