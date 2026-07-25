import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildDailyActionCategories,
  isChaseableInvoice,
} from "@/lib/actions/buildDailyActionCategories";
import type { ChaseableInvoiceRow } from "@/lib/actions/types";

function invoice(overrides: Partial<ChaseableInvoiceRow> = {}): ChaseableInvoiceRow {
  return {
    id: overrides.id ?? "inv-1",
    invoiceNumber: overrides.invoiceNumber ?? "INV-001",
    clientId: overrides.clientId ?? "client-1",
    clientName: overrides.clientName ?? "Acme Corp",
    dueDate: overrides.dueDate ?? "2026-07-01",
    outstanding: overrides.outstanding ?? 1000,
    currency: overrides.currency ?? "USD",
    displayStatus: overrides.displayStatus ?? "overdue",
    baseStatus: overrides.baseStatus ?? "sent",
    isOverdue: overrides.isOverdue ?? true,
    overdueDays: overrides.overdueDays ?? 10,
    riskLevel: overrides.riskLevel ?? "medium",
    clientIsActive: overrides.clientIsActive ?? true,
    clientArchivedAt: overrides.clientArchivedAt ?? null,
    archivedAt: overrides.archivedAt ?? null,
  };
}

describe("buildDailyActionCategories (R3A)", () => {
  it("A — reminder-eligible invoice enters Needs Action", () => {
    const row = invoice({ id: "inv-reminder", isOverdue: false, overdueDays: 0, riskLevel: null });
    const result = buildDailyActionCategories({
      invoices: [row],
      reminderEligibleInvoiceIds: new Set(["inv-reminder"]),
      remindersDueRowCount: 1,
    });

    assert.equal(result.needsAction.length, 1);
    assert.deepEqual(result.needsAction[0]?.reasons, ["reminder_due"]);
  });

  it("B — high-risk invoice enters Needs Action", () => {
    const row = invoice({ id: "inv-high", riskLevel: "high", overdueDays: 60 });
    const result = buildDailyActionCategories({
      invoices: [row],
      reminderEligibleInvoiceIds: new Set(),
      remindersDueRowCount: 0,
    });

    assert.equal(result.needsAction.length, 1);
    assert.ok(result.needsAction[0]?.reasons.includes("high_risk"));
  });

  it("C — overdue_days=1 enters Needs Action", () => {
    const row = invoice({ id: "inv-new", overdueDays: 1, riskLevel: "low" });
    const result = buildDailyActionCategories({
      invoices: [row],
      reminderEligibleInvoiceIds: new Set(),
      remindersDueRowCount: 0,
    });

    assert.equal(result.needsAction.length, 1);
    assert.ok(result.needsAction[0]?.reasons.includes("newly_overdue"));
  });

  it("D — duplicate invoice across reasons appears once", () => {
    const row = invoice({ id: "inv-dup", riskLevel: "high", overdueDays: 1 });
    const result = buildDailyActionCategories({
      invoices: [row],
      reminderEligibleInvoiceIds: new Set(["inv-dup"]),
      remindersDueRowCount: 1,
    });

    assert.equal(result.needsAction.length, 1);
  });

  it("E — multiple reason badges preserved", () => {
    const row = invoice({ id: "inv-multi", riskLevel: "high", overdueDays: 1 });
    const result = buildDailyActionCategories({
      invoices: [row],
      reminderEligibleInvoiceIds: new Set(["inv-multi"]),
      remindersDueRowCount: 1,
    });

    const reasons = result.needsAction[0]?.reasons ?? [];
    assert.ok(reasons.includes("reminder_due"));
    assert.ok(reasons.includes("high_risk"));
    assert.ok(reasons.includes("newly_overdue"));
    assert.equal(reasons.length, 3);
  });

  it("F — paid/draft/void/inactive/archive excluded", () => {
    const rows = [
      invoice({ id: "paid", outstanding: 0 }),
      invoice({ id: "draft", baseStatus: "draft", displayStatus: "draft" }),
      invoice({ id: "void", baseStatus: "void", displayStatus: "void" }),
      invoice({ id: "inactive", clientIsActive: false }),
      invoice({ id: "client-archived", clientArchivedAt: "2026-01-01" }),
      invoice({ id: "archived", archivedAt: "2026-01-01" }),
    ];

    for (const row of rows) {
      assert.equal(isChaseableInvoice(row), false);
    }

    const result = buildDailyActionCategories({
      invoices: rows,
      reminderEligibleInvoiceIds: new Set(rows.map((r) => r.id)),
      remindersDueRowCount: rows.length,
    });

    assert.equal(result.needsAction.length, 0);
    assert.equal(result.summary.overdueCount, 0);
    assert.equal(result.summary.highRiskCount, 0);
  });

  it("G — high-risk list uses canonical risk_level", () => {
    const rows = [
      invoice({ id: "high-a", riskLevel: "high", outstanding: 500, overdueDays: 70 }),
      invoice({ id: "medium", riskLevel: "medium", outstanding: 9000, overdueDays: 20 }),
      invoice({ id: "high-b", riskLevel: "high", outstanding: 8000, overdueDays: 65 }),
    ];

    const result = buildDailyActionCategories({
      invoices: rows,
      reminderEligibleInvoiceIds: new Set(),
      remindersDueRowCount: 0,
    });

    assert.deepEqual(
      result.highRisk.map((item) => item.id),
      ["high-b", "high-a"]
    );
    assert.equal(result.summary.highRiskCount, 2);
  });

  it("H — summary counts correct", () => {
    const rows = [
      invoice({ id: "a", riskLevel: "high", overdueDays: 1 }),
      invoice({ id: "b", riskLevel: "low", overdueDays: 5, isOverdue: true }),
      invoice({ id: "c", riskLevel: "medium", overdueDays: 20, isOverdue: true }),
    ];

    const result = buildDailyActionCategories({
      invoices: rows,
      reminderEligibleInvoiceIds: new Set(["a", "c"]),
      remindersDueRowCount: 2,
    });

    assert.deepEqual(result.summary, {
      needsActionCount: 2,
      remindersDueCount: 2,
      highRiskCount: 1,
      overdueCount: 3,
    });
  });
});

describe("needs action sort priority (R3A)", () => {
  it("orders reminder due before high risk before newly overdue", () => {
    const rows = [
      invoice({ id: "new-only", overdueDays: 1, riskLevel: "low" }),
      invoice({ id: "high-only", overdueDays: 30, riskLevel: "high" }),
      invoice({
        id: "reminder-only",
        isOverdue: false,
        overdueDays: 0,
        riskLevel: null,
        displayStatus: "sent",
      }),
    ];

    const result = buildDailyActionCategories({
      invoices: rows,
      reminderEligibleInvoiceIds: new Set(["reminder-only"]),
      remindersDueRowCount: 1,
    });

    assert.deepEqual(result.needsAction.map((item) => item.id), [
      "reminder-only",
      "high-only",
      "new-only",
    ]);
  });
});
