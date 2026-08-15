import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const INVOICES_VIEW_MIGRATION =
  "supabase/migrations/20260725000000_invoices_view_workspace_business_date.sql";
const CLIENTS_PAGE = "app/[workspaceId]/clients/page.tsx";

describe("client overdue flag vs invoices_view risk_level invariant", () => {
  it("invoices_view sets risk_level to NULL unless display_status is overdue", () => {
    const migration = readFileSync(INVOICES_VIEW_MIGRATION, "utf8");
    assert.match(migration, /WHEN display_status <> 'overdue' THEN NULL/);
  });

  it("client overdue aggregation checks display_status and risk_level", () => {
    const src = readFileSync(CLIENTS_PAGE, "utf8");
    assert.match(
      src,
      /inv\.display_status === "overdue" \|\| inv\.risk_level != null/
    );
  });

  it("risk_level non-null cannot occur on current/not-overdue invoices under view contract", () => {
    // Given invoices_view: risk_level is NULL whenever display_status <> 'overdue',
    // the `risk_level != null` branch is redundant but cannot mark a current invoice overdue.
    const migration = readFileSync(INVOICES_VIEW_MIGRATION, "utf8");
    assert.match(migration, /WHEN display_status <> 'overdue' THEN NULL/);
    assert.match(migration, /WHEN base_status = 'sent' AND outstanding > 0 AND due_date >= workspace_today/);
  });
});
