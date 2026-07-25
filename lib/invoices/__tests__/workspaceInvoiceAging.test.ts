import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { resolveWorkspaceEvaluationDate } from "@/lib/datetime/workspaceCalendar";
import {
  computeInvoiceDisplayStatus,
  computeInvoiceOverdueDays,
  computeInvoiceRiskLevel,
  evaluateWorkspaceInvoiceAging,
  resolveWorkspaceBusinessDate,
} from "../workspaceInvoiceAging";

const BOUNDARY_INSTANT = new Date("2026-07-24T22:30:00.000Z");

describe("resolveWorkspaceBusinessDate (R2I)", () => {
  it("A — Asia/Amman boundary maps UTC 2026-07-24T22:30Z to 2026-07-25", () => {
    assert.equal(resolveWorkspaceBusinessDate(BOUNDARY_INSTANT, "Asia/Amman"), "2026-07-25");
  });

  it("B — America/New_York same instant maps to 2026-07-24", () => {
    assert.equal(
      resolveWorkspaceBusinessDate(BOUNDARY_INSTANT, "America/New_York"),
      "2026-07-24"
    );
  });

  it("M — null/unset timezone falls back to UTC", () => {
    assert.equal(resolveWorkspaceBusinessDate(BOUNDARY_INSTANT, null), "2026-07-24");
    assert.equal(resolveWorkspaceBusinessDate(BOUNDARY_INSTANT, ""), "2026-07-24");
  });

  it("N — invalid timezone falls back to UTC via resolveSafeTimeZone", () => {
    assert.equal(
      resolveWorkspaceBusinessDate(BOUNDARY_INSTANT, "Not/A_Timezone"),
      "2026-07-24"
    );
  });
});

describe("computeInvoiceOverdueDays (R2I)", () => {
  const workspaceToday = "2026-07-25";

  it("C — due yesterday → overdue_days 1", () => {
    assert.equal(
      computeInvoiceOverdueDays({ dueDate: "2026-07-24", workspaceToday }),
      1
    );
  });

  it("D — due today → overdue_days 0", () => {
    assert.equal(
      computeInvoiceOverdueDays({ dueDate: "2026-07-25", workspaceToday }),
      0
    );
  });

  it("E — due tomorrow → overdue_days 0", () => {
    assert.equal(
      computeInvoiceOverdueDays({ dueDate: "2026-07-26", workspaceToday }),
      0
    );
  });
});

describe("computeInvoiceDisplayStatus (R2I)", () => {
  const workspaceToday = "2026-07-25";

  it("F — partially paid overdue invoice stays partially_paid when not past due", () => {
    assert.equal(
      computeInvoiceDisplayStatus({
        baseStatus: "sent",
        outstanding: 50,
        paid: 50,
        dueDate: "2026-07-25",
        workspaceToday,
      }),
      "partially_paid"
    );
  });

  it("partially paid with due_date before workspace_today is overdue", () => {
    assert.equal(
      computeInvoiceDisplayStatus({
        baseStatus: "sent",
        outstanding: 50,
        paid: 50,
        dueDate: "2026-07-24",
        workspaceToday,
      }),
      "overdue"
    );
  });

  it("G — fully paid invoice is paid regardless of due date", () => {
    assert.equal(
      computeInvoiceDisplayStatus({
        baseStatus: "sent",
        outstanding: 0,
        paid: 100,
        dueDate: "2026-01-01",
        workspaceToday,
      }),
      "paid"
    );
  });

  it("H — archived semantics unchanged (void base_status)", () => {
    assert.equal(
      computeInvoiceDisplayStatus({
        baseStatus: "void",
        outstanding: 100,
        paid: 0,
        dueDate: "2026-01-01",
        workspaceToday,
      }),
      "void"
    );
  });

  it("draft remains draft even when due_date is in the past", () => {
    assert.equal(
      computeInvoiceDisplayStatus({
        baseStatus: "draft",
        outstanding: 100,
        paid: 0,
        dueDate: "2026-01-01",
        workspaceToday,
      }),
      "draft"
    );
  });
});

describe("computeInvoiceRiskLevel (R2I)", () => {
  it("J — risk thresholds unchanged and driven by overdue_days", () => {
    assert.equal(
      computeInvoiceRiskLevel({
        displayStatus: "overdue",
        overdueDays: 1,
        outstanding: 100,
      }),
      "low"
    );
    assert.equal(
      computeInvoiceRiskLevel({
        displayStatus: "overdue",
        overdueDays: 20,
        outstanding: 100,
      }),
      "medium"
    );
    assert.equal(
      computeInvoiceRiskLevel({
        displayStatus: "overdue",
        overdueDays: 60,
        outstanding: 100,
      }),
      "high"
    );
    assert.equal(
      computeInvoiceRiskLevel({
        displayStatus: "overdue",
        overdueDays: 5,
        outstanding: 5000,
      }),
      "high"
    );
    assert.equal(
      computeInvoiceRiskLevel({ displayStatus: "sent", overdueDays: 0, outstanding: 100 }),
      null
    );
  });
});

describe("reminder parity (R2I L)", () => {
  it("reminder evaluation date matches invoice aging workspace today", () => {
    const instant = BOUNDARY_INSTANT;
    const timeZone = "Asia/Amman";
    const reminderDate = resolveWorkspaceEvaluationDate(instant, timeZone);
    const agingDate = resolveWorkspaceBusinessDate(instant, timeZone);
    assert.equal(reminderDate, agingDate);
    assert.equal(reminderDate, "2026-07-25");
  });
});

describe("evaluateWorkspaceInvoiceAging integration (R2I)", () => {
  it("Asia/Amman boundary: due yesterday is overdue with 1 day", () => {
    const result = evaluateWorkspaceInvoiceAging({
      baseStatus: "sent",
      outstanding: 100,
      paid: 0,
      dueDate: "2026-07-24",
      referenceInstant: BOUNDARY_INSTANT,
      workspaceTimeZone: "Asia/Amman",
    });

    assert.equal(result.workspaceToday, "2026-07-25");
    assert.equal(result.overdueDays, 1);
    assert.equal(result.displayStatus, "overdue");
    assert.equal(result.isOverdue, true);
    assert.equal(result.riskLevel, "low");
  });

  it("due today is sent, not overdue", () => {
    const result = evaluateWorkspaceInvoiceAging({
      baseStatus: "sent",
      outstanding: 100,
      paid: 0,
      dueDate: "2026-07-25",
      referenceInstant: BOUNDARY_INSTANT,
      workspaceTimeZone: "Asia/Amman",
    });

    assert.equal(result.overdueDays, 0);
    assert.equal(result.displayStatus, "sent");
    assert.equal(result.isOverdue, false);
    assert.equal(result.riskLevel, null);
  });
});

describe("invoices_view migration contract (R2I K)", () => {
  it("migration replaces CURRENT_DATE with workspace_business_date", () => {
    const sql = readFileSync(
      "supabase/migrations/20260725000000_invoices_view_workspace_business_date.sql",
      "utf8"
    );
    assert.match(sql, /workspace_business_date/);
    assert.match(sql, /LEFT JOIN public\.settings s/);
    assert.doesNotMatch(sql, /CURRENT_DATE/i);
  });

  it("preserves 21-column SELECT contract order", () => {
    const sql = readFileSync(
      "supabase/migrations/20260725000000_invoices_view_workspace_business_date.sql",
      "utf8"
    );
    const expected = [
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
      "(display_status = 'overdue') AS is_overdue",
      "overdue_days",
      "CASE",
      "risk_level",
      "po_number",
      "notes",
      "archived_at",
      "client_is_active",
      "client_archived_at",
    ];
    for (const token of expected) {
      assert.match(sql, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }
  });
});

describe("invoices_view repository contract", () => {
  it("I — inactive non-archived client does not change invoice display_status", () => {
    const result = evaluateWorkspaceInvoiceAging({
      baseStatus: "sent",
      outstanding: 100,
      paid: 0,
      dueDate: "2026-07-24",
      referenceInstant: BOUNDARY_INSTANT,
      workspaceTimeZone: "Asia/Amman",
    });
    assert.equal(result.displayStatus, "overdue");
  });
});
