import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildDailyActionCategories, isChaseableInvoice } from "@/lib/actions/buildDailyActionCategories";
import {
  computeFirstOverdueDate,
  computeMilestoneCrossDate,
  computeRequiringAttentionTotal,
  resolveLatestMilestone,
} from "@/lib/actions/collectionActivity";
import type { ChaseableInvoiceRow } from "@/lib/actions/types";

const DUE = "2026-07-01";

function invoice(overrides: Partial<ChaseableInvoiceRow> = {}): ChaseableInvoiceRow {
  return {
    id: overrides.id ?? "inv-1",
    invoiceNumber: overrides.invoiceNumber ?? "INV-001",
    clientId: overrides.clientId ?? "client-1",
    clientName: overrides.clientName ?? "Acme Corp",
    clientEmail: overrides.clientEmail ?? "client@example.com",
    clientPhone: overrides.clientPhone ?? null,
    clientCountry: overrides.clientCountry ?? null,
    dueDate: overrides.dueDate ?? DUE,
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

function build(params: {
  invoices: ChaseableInvoiceRow[];
  reminderEligible?: Set<string>;
  sentByInvoice?: Map<string, string[]>;
  defaultCurrency?: string;
}) {
  return buildDailyActionCategories({
    invoices: params.invoices,
    reminderEligibleInvoiceIds: params.reminderEligible ?? new Set(),
    sentReminderDatesByInvoiceId: params.sentByInvoice ?? new Map(),
    defaultCurrency: params.defaultCurrency ?? "USD",
    sentInvoiceCount: 1,
  });
}

function sentMap(invoiceId: string, dates: string[]): Map<string, string[]> {
  return new Map([[invoiceId, dates]]);
}

describe("collectionActivity date safety (R3B T)", () => {
  it("T — milestone crossing date uses calendar arithmetic without shifting due date", () => {
    assert.equal(computeFirstOverdueDate("2026-07-20"), "2026-07-21");
    assert.equal(computeMilestoneCrossDate("2026-07-20", 30), "2026-08-19");
    assert.equal(resolveLatestMilestone(6), null);
    assert.equal(resolveLatestMilestone(7), 7);
    assert.equal(resolveLatestMilestone(32), 30);
  });
});

describe("buildDailyActionCategories (R3B)", () => {
  it("A — reminder eligible → action", () => {
    const row = invoice({ id: "inv-a", isOverdue: false, overdueDays: 0, riskLevel: null });
    const result = build({
      invoices: [row],
      reminderEligible: new Set(["inv-a"]),
    });

    assert.equal(result.collectionActions.length, 1);
    assert.ok(result.collectionActions[0]?.reasons.some((r) => r.type === "reminder_due"));
    assert.equal(result.collectionActions[0]?.clientPhone, null);
  });

  it("passes clientPhone and clientCountry through to collection actions", () => {
    const result = build({
      invoices: [
        invoice({
          id: "inv-phone",
          clientPhone: "+962779610078",
          clientCountry: "Jordan",
          overdueDays: 3,
        }),
      ],
    });

    assert.equal(result.collectionActions[0]?.clientPhone, "+962779610078");
    assert.equal(result.collectionActions[0]?.clientCountry, "Jordan");
  });

  it("B — newly overdue day 1 → action", () => {
    const result = build({
      invoices: [invoice({ id: "inv-b", overdueDays: 1, riskLevel: "low" })],
    });

    assert.ok(result.collectionActions[0]?.reasons.some((r) => r.type === "newly_overdue"));
  });

  it("C — newly overdue day 4 after missed login → action", () => {
    const result = build({
      invoices: [invoice({ id: "inv-c", overdueDays: 4, riskLevel: "low" })],
    });

    assert.ok(result.collectionActions[0]?.reasons.some((r) => r.type === "newly_overdue"));
  });

  it("D — successful reminder after first overdue date suppresses early-overdue action", () => {
    const firstOverdue = computeFirstOverdueDate(DUE)!;
    const result = build({
      invoices: [invoice({ id: "inv-d", overdueDays: 4 })],
      sentByInvoice: sentMap("inv-d", [firstOverdue]),
    });

    assert.equal(result.collectionActions.length, 0);
  });

  it("E — high risk alone does not create action when triggers are suppressed", () => {
    const cross7 = computeMilestoneCrossDate(DUE, 7)!;
    const result = build({
      invoices: [invoice({ id: "inv-e", overdueDays: 10, riskLevel: "high" })],
      sentByInvoice: sentMap("inv-e", [cross7, "2026-07-10"]),
    });

    assert.equal(result.collectionActions.length, 0);
  });

  it("F — day 7 → 7-day milestone action", () => {
    const result = build({
      invoices: [invoice({ id: "inv-f", overdueDays: 7 })],
    });

    const milestone = result.collectionActions[0]?.reasons.find(
      (r) => r.type === "aging_milestone"
    );
    assert.ok(milestone && milestone.type === "aging_milestone");
    assert.equal(milestone.milestoneDays, 7);
  });

  it("G — day 14 with no post-day-7 reminder → 7-day action still present", () => {
    const result = build({
      invoices: [invoice({ id: "inv-g", overdueDays: 14 })],
    });

    const milestone = result.collectionActions[0]?.reasons.find(
      (r) => r.type === "aging_milestone"
    );
    assert.ok(milestone && milestone.type === "aging_milestone");
    assert.equal(milestone.milestoneDays, 7);
  });

  it("H — day 15 → 15-day milestone", () => {
    const result = build({
      invoices: [invoice({ id: "inv-h", overdueDays: 15 })],
    });

    const milestone = result.collectionActions[0]?.reasons.find(
      (r) => r.type === "aging_milestone"
    );
    assert.ok(milestone && milestone.type === "aging_milestone");
    assert.equal(milestone.milestoneDays, 15);
  });

  it("I — day 32 with no post-day-30 activity → 30-day escalation still present", () => {
    const result = build({
      invoices: [invoice({ id: "inv-i", overdueDays: 32 })],
    });

    const milestone = result.collectionActions[0]?.reasons.find(
      (r) => r.type === "aging_milestone"
    );
    assert.ok(milestone && milestone.type === "aging_milestone");
    assert.equal(milestone.milestoneDays, 30);
  });

  it("J — successful reminder day 31 suppresses day-32 30-day milestone", () => {
    const sentDay31 = computeMilestoneCrossDate(DUE, 31)!;
    const result = build({
      invoices: [invoice({ id: "inv-j", overdueDays: 32 })],
      sentByInvoice: sentMap("inv-j", [sentDay31]),
    });

    assert.equal(result.collectionActions.length, 0);
  });

  it("K — failed reminder after milestone does not suppress (sent map excludes failed)", () => {
    const result = build({
      invoices: [invoice({ id: "inv-k", overdueDays: 32 })],
      sentByInvoice: new Map(),
    });

    assert.equal(result.collectionActions.length, 1);
  });

  it("L — skipped reminder does not suppress", () => {
    const result = build({
      invoices: [invoice({ id: "inv-l", overdueDays: 32 })],
      sentByInvoice: new Map(),
    });

    assert.equal(result.collectionActions.length, 1);
  });

  it("M — partial payment / outstanding still > 0 does not suppress milestone", () => {
    const result = build({
      invoices: [invoice({ id: "inv-m", overdueDays: 32, outstanding: 500 })],
    });

    assert.equal(result.collectionActions.length, 1);
  });

  it("N — outstanding = 0 excluded", () => {
    const result = build({
      invoices: [invoice({ id: "inv-n", outstanding: 0, overdueDays: 32 })],
    });

    assert.equal(result.collectionActions.length, 0);
  });

  it("O — day 65 with reminder sent at day 35 → 60-day escalation appears", () => {
    const sentDay35 = computeMilestoneCrossDate(DUE, 35)!;
    const result = build({
      invoices: [invoice({ id: "inv-o", overdueDays: 65 })],
      sentByInvoice: sentMap("inv-o", [sentDay35]),
    });

    const milestone = result.collectionActions[0]?.reasons.find(
      (r) => r.type === "aging_milestone"
    );
    assert.ok(milestone && milestone.type === "aging_milestone");
    assert.equal(milestone.milestoneDays, 60);
  });

  it("P — multiple reasons on same invoice → one row", () => {
    const result = build({
      invoices: [invoice({ id: "inv-p", overdueDays: 4, riskLevel: "high" })],
      reminderEligible: new Set(["inv-p"]),
    });

    assert.equal(result.summary.actionsTodayCount, 1);
    assert.equal(result.collectionActions.length, 1);
    assert.ok(result.collectionActions[0]?.reasons.some((r) => r.type === "reminder_due"));
    assert.ok(result.collectionActions[0]?.reasons.some((r) => r.type === "newly_overdue"));
  });

  it("summary — cash requiring attention does not double-count multi-reason invoice", () => {
    const result = build({
      invoices: [invoice({ id: "inv-multi", overdueDays: 4, outstanding: 750 })],
      reminderEligible: new Set(["inv-multi"]),
    });

    assert.equal(result.collectionActions.length, 1);
    assert.equal(result.summary.actionsTodayCount, 1);
    assert.deepEqual(result.summary.requiringAttentionByCurrency, [
      { currency: "USD", amount: 750 },
    ]);
    assert.equal(result.summary.requiringAttentionAmount, 750);
  });

  it("summary — partially paid invoice uses outstanding only", () => {
    const result = build({
      invoices: [invoice({ id: "inv-partial", overdueDays: 7, outstanding: 250 })],
    });

    assert.equal(result.summary.requiringAttentionAmount, 250);
    assert.equal(result.collectionActions[0]?.outstanding, 250);
  });

  it("summary — high-risk customers counts unique clients not invoices", () => {
    const result = build({
      invoices: [
        invoice({
          id: "inv-1",
          clientId: "client-a",
          overdueDays: 10,
          riskLevel: "high",
        }),
        invoice({
          id: "inv-2",
          clientId: "client-a",
          overdueDays: 12,
          riskLevel: "high",
        }),
        invoice({
          id: "inv-3",
          clientId: "client-b",
          overdueDays: 8,
          riskLevel: "high",
        }),
        invoice({
          id: "inv-4",
          clientId: "client-c",
          overdueDays: 5,
          riskLevel: "low",
        }),
      ],
    });

    assert.equal(result.summary.highRiskCustomerCount, 2);
    assert.equal(result.summary.actionsTodayCount, 4);
  });

  it("summary — reminders ready counts unique invoices with reminder_due", () => {
    const result = build({
      invoices: [
        invoice({ id: "inv-rem-1", isOverdue: false, overdueDays: 0, riskLevel: null }),
        invoice({ id: "inv-rem-2", isOverdue: false, overdueDays: 0, riskLevel: null }),
        invoice({ id: "inv-mile", overdueDays: 15 }),
      ],
      reminderEligible: new Set(["inv-rem-1", "inv-rem-2"]),
    });

    assert.equal(result.summary.remindersDueCount, 2);
    assert.equal(result.summary.actionsTodayCount, 3);
  });

  it("Q — high-risk modifier affects ordering but not eligibility", () => {
    const result = build({
      invoices: [
        invoice({ id: "low-risk", overdueDays: 4, riskLevel: "low", outstanding: 500 }),
        invoice({ id: "high-risk", overdueDays: 4, riskLevel: "high", outstanding: 500 }),
      ],
    });

    assert.deepEqual(
      result.collectionActions.map((action) => action.id),
      ["high-risk", "low-risk"]
    );
    assert.equal(result.collectionActions[0]?.isHighRisk, true);
  });

  it("R — draft/void/archived/inactive client excluded", () => {
    const rows = [
      invoice({ id: "draft", baseStatus: "draft", displayStatus: "draft" }),
      invoice({ id: "void", baseStatus: "void", displayStatus: "void" }),
      invoice({ id: "inactive", clientIsActive: false }),
      invoice({ id: "client-archived", clientArchivedAt: "2026-01-01" }),
      invoice({ id: "archived", archivedAt: "2026-01-01" }),
    ];

    for (const row of rows) {
      assert.equal(isChaseableInvoice(row), false);
    }

    const result = build({
      invoices: rows,
      reminderEligible: new Set(rows.map((r) => r.id)),
    });

    assert.equal(result.collectionActions.length, 0);
  });

  it("S — mixed currencies are not blindly summed", () => {
    const result = build({
      invoices: [
        invoice({ id: "usd", currency: "USD", outstanding: 1000, overdueDays: 7 }),
        invoice({ id: "eur", currency: "EUR", outstanding: 2000, overdueDays: 7 }),
      ],
      defaultCurrency: "USD",
    });

    assert.equal(result.summary.requiringAttentionMixedCurrency, true);
    assert.equal(result.summary.requiringAttentionAmount, 1000);
    assert.equal(result.summary.requiringAttentionCurrency, "USD");
    assert.deepEqual(result.summary.requiringAttentionByCurrency, [
      { currency: "EUR", amount: 2000 },
      { currency: "USD", amount: 1000 },
    ]);
  });
});

describe("computeRequiringAttentionTotal", () => {
  it("sums single-currency actions normally", () => {
    const total = computeRequiringAttentionTotal({
      outstandingAmounts: [
        { outstanding: 100, currency: "USD" },
        { outstanding: 200, currency: "USD" },
      ],
      defaultCurrency: "USD",
    });

    assert.deepEqual(total, { amount: 300, currency: "USD", isMixedCurrency: false });
  });
});

describe("computeOutstandingByCurrency", () => {
  it("returns per-currency totals without cross-currency summing", async () => {
    const { computeOutstandingByCurrency } = await import("@/lib/actions/collectionActivity");

    const totals = computeOutstandingByCurrency({
      outstandingAmounts: [
        { outstanding: 1000, currency: "USD" },
        { outstanding: 500, currency: "USD" },
        { outstanding: 2000, currency: "EUR" },
      ],
      defaultCurrency: "USD",
    });

    assert.deepEqual(totals, [
      { currency: "EUR", amount: 2000 },
      { currency: "USD", amount: 1500 },
    ]);
  });
});

describe("resolveRecommendedAction (Task 2)", () => {
  it("maps reminder_due to scheduled reminder wording", async () => {
    const { resolveRecommendedAction } = await import("@/lib/actions/resolveRecommendedAction");

    assert.equal(
      resolveRecommendedAction({
        reasons: [{ type: "reminder_due" }],
        execution: { mode: "rule_bound", ruleId: "r1", templateId: null, scheduledDate: "2026-07-01", clientEmail: "a@b.com" },
        isHighRisk: false,
      }),
      "Send scheduled reminder"
    );
  });

  it("strengthens wording for high-risk reminder_due rows", async () => {
    const { resolveRecommendedAction } = await import("@/lib/actions/resolveRecommendedAction");

    assert.equal(
      resolveRecommendedAction({
        reasons: [{ type: "reminder_due" }, { type: "newly_overdue" }],
        execution: { mode: "rule_bound", ruleId: "r1", templateId: null, scheduledDate: "2026-07-01", clientEmail: "a@b.com" },
        isHighRisk: true,
      }),
      "Prioritize scheduled reminder"
    );
  });

  it("maps newly_overdue to first follow-up", async () => {
    const { resolveRecommendedAction } = await import("@/lib/actions/resolveRecommendedAction");

    assert.equal(
      resolveRecommendedAction({
        reasons: [{ type: "newly_overdue" }],
        execution: { mode: "manual", clientEmail: "a@b.com" },
        isHighRisk: false,
      }),
      "Send first follow-up"
    );
  });

  it("maps aging_milestone to follow-up now", async () => {
    const { resolveRecommendedAction } = await import("@/lib/actions/resolveRecommendedAction");

    assert.equal(
      resolveRecommendedAction({
        reasons: [{ type: "aging_milestone", milestoneDays: 15 }],
        execution: { mode: "manual", clientEmail: "a@b.com" },
        isHighRisk: false,
      }),
      "Follow up now"
    );
  });

  it("maps view_only execution to review invoice", async () => {
    const { resolveRecommendedAction } = await import("@/lib/actions/resolveRecommendedAction");

    assert.equal(
      resolveRecommendedAction({
        reasons: [{ type: "newly_overdue" }],
        execution: { mode: "view_only" },
        isHighRisk: false,
      }),
      "Review invoice"
    );
  });
});

describe("buildActionCenterGreeting (Task 2)", () => {
  it("uses first name when available", async () => {
    const { buildActionCenterGreeting } = await import("@/lib/actions/morningGreeting");

    const greeting = buildActionCenterGreeting({
      fullName: "Mohammed Al-Rashid",
      workspaceTimeZone: "UTC",
      now: new Date("2026-07-29T09:00:00.000Z"),
    });

    assert.match(greeting, /Mohammed/);
  });

  it("falls back without exposing email-like names", async () => {
    const { buildActionCenterGreeting, extractFirstName } = await import(
      "@/lib/actions/morningGreeting"
    );

    assert.equal(extractFirstName("user@example.com"), null);
    assert.equal(
      buildActionCenterGreeting({
        fullName: "user@example.com",
        workspaceTimeZone: "UTC",
        now: new Date("2026-07-29T09:00:00.000Z"),
      }),
      "Good morning"
    );
  });
});

describe("Action Center UI contracts (Task 2)", () => {
  it("CollectionActionCell preserves Send Reminder, WhatsApp, AI Assist, and View wiring", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(
      "app/[workspaceId]/actions/_components/CollectionActionCell.tsx",
      "utf8"
    );

    assert.match(src, /SendReminderButton/);
    assert.match(src, /WhatsAppCollectionLink/);
    assert.match(src, /AiCollectionAssistDialog/);
    assert.match(src, /View/);
  });

  it("DailyActionCenterView keeps caught-up empty state copy", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(
      "app/[workspaceId]/actions/_components/DailyActionCenterView.tsx",
      "utf8"
    );

    assert.match(src, /CAUGHT_UP_ACTIONS_EMPTY/);
    assert.match(src, /FIRST_RUN_ACTIONS_EMPTY/);
    assert.match(src, /recommendedAction/);
  });
});

describe("collection action sort priority (R3B)", () => {
  it("orders reminder due before milestone before newly overdue", () => {
    const result = build({
      invoices: [
        invoice({ id: "new-only", overdueDays: 3 }),
        invoice({ id: "mile-only", overdueDays: 15 }),
        invoice({
          id: "reminder-only",
          isOverdue: false,
          overdueDays: 0,
          riskLevel: null,
          displayStatus: "sent",
        }),
      ],
      reminderEligible: new Set(["reminder-only"]),
    });

    assert.deepEqual(result.collectionActions.map((action) => action.id), [
      "reminder-only",
      "mile-only",
      "new-only",
    ]);
  });
});

describe("resolveCollectionActionExecution (R3C)", () => {
  const reminderAction = {
    invoiceId: "inv-1",
    invoiceNumber: "INV-001",
    clientName: "Acme",
    clientEmail: "client@example.com",
    ruleId: "rule-7",
    templateId: "tpl-1",
    scheduledDate: "2026-07-08",
  };

  it("A — reminder-due row chooses exact rule-bound candidate", async () => {
    const { resolveCollectionActionExecution } = await import(
      "@/lib/actions/resolveCollectionActionExecution"
    );

    const execution = resolveCollectionActionExecution({
      hasReminderDue: true,
      reminderAction,
      clientEmail: "fallback@example.com",
    });

    assert.equal(execution.mode, "rule_bound");
    if (execution.mode === "rule_bound") {
      assert.equal(execution.ruleId, "rule-7");
      assert.equal(execution.templateId, "tpl-1");
      assert.equal(execution.scheduledDate, "2026-07-08");
      assert.equal(execution.clientEmail, "client@example.com");
    }
  });

  it("B — milestone without reminder candidate chooses manual-send execution", async () => {
    const { resolveCollectionActionExecution } = await import(
      "@/lib/actions/resolveCollectionActionExecution"
    );

    const execution = resolveCollectionActionExecution({
      hasReminderDue: false,
      clientEmail: "client@example.com",
    });

    assert.deepEqual(execution, {
      mode: "manual",
      clientEmail: "client@example.com",
    });
  });

  it("C — newly-overdue without reminder candidate chooses manual-send execution", async () => {
    const { resolveCollectionActionExecution } = await import(
      "@/lib/actions/resolveCollectionActionExecution"
    );

    const execution = resolveCollectionActionExecution({
      hasReminderDue: false,
      clientEmail: "newly@example.com",
    });

    assert.equal(execution.mode, "manual");
  });

  it("D — missing client email cannot send", async () => {
    const { resolveCollectionActionExecution } = await import(
      "@/lib/actions/resolveCollectionActionExecution"
    );

    assert.deepEqual(
      resolveCollectionActionExecution({
        hasReminderDue: false,
        clientEmail: null,
      }),
      { mode: "view_only" }
    );

    assert.deepEqual(
      resolveCollectionActionExecution({
        hasReminderDue: true,
        reminderAction: { ...reminderAction, clientEmail: null },
        clientEmail: null,
      }),
      { mode: "view_only" }
    );
  });

  it("E — reminder-due takes precedence when multiple reasons exist", async () => {
    const { resolveCollectionActionExecution } = await import(
      "@/lib/actions/resolveCollectionActionExecution"
    );

    const execution = resolveCollectionActionExecution({
      hasReminderDue: true,
      reminderAction,
      clientEmail: "client@example.com",
    });

    assert.equal(execution.mode, "rule_bound");
  });

  it("F — no fabricated ruleId/scheduledDate for milestone manual send", async () => {
    const { resolveCollectionActionExecution } = await import(
      "@/lib/actions/resolveCollectionActionExecution"
    );

    const execution = resolveCollectionActionExecution({
      hasReminderDue: false,
      clientEmail: "client@example.com",
    });

    assert.equal(execution.mode, "manual");
    assert.equal("ruleId" in execution, false);
    assert.equal("scheduledDate" in execution, false);
  });
});
