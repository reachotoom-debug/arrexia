import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  INVOICES_VIEW_CONTRACT_COLUMN_NAMES,
  INVOICES_VIEW_CONTRACT_COLUMNS,
} from "../invoicesViewContract";

const VERIFIED_PRODUCTION_COLUMN_ORDER = [
  "id",
  "workspace_id",
  "client_id",
  "client_name",
  "invoice_number",
  "issue_date",
  "due_date",
  "currency",
  "total",
  "paid",
  "outstanding",
  "base_status",
  "display_status",
  "is_overdue",
  "overdue_days",
  "risk_level",
  "po_number",
  "notes",
  "archived_at",
  "client_is_active",
  "client_archived_at",
];

describe("invoices_view repository contract", () => {
  it("defines exactly 21 columns in verified production order", () => {
    assert.equal(INVOICES_VIEW_CONTRACT_COLUMNS.length, 21);
    assert.deepEqual(INVOICES_VIEW_CONTRACT_COLUMN_NAMES, VERIFIED_PRODUCTION_COLUMN_ORDER);
  });

  it("includes client status and archived_at columns required by application queries", () => {
    for (const column of ["archived_at", "client_is_active", "client_archived_at"]) {
      assert.ok(
        INVOICES_VIEW_CONTRACT_COLUMN_NAMES.includes(column),
        `missing ${column}`
      );
    }
  });

  it("canonical migration uses workspace_business_date instead of CURRENT_DATE", () => {
    const sql = readFileSync(
      "supabase/migrations/20260725000000_invoices_view_workspace_business_date.sql",
      "utf8"
    );
    assert.match(sql, /workspace_business_date/);
    assert.doesNotMatch(sql, /CURRENT_DATE/i);
  });
});
