import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildDailyActionCategories, isChaseableInvoice } from "@/lib/actions/buildDailyActionCategories";
import {
  formatOverduePortfolioEmptyContext,
  NO_ACTIONS_SCHEDULED_TODAY,
  shouldShowOverduePortfolioEmptyState,
} from "@/lib/actions/dailyActionCenterPresentation";
import {
  computeFirstOverdueDate,
  computeMilestoneCrossDate,
  computeRequiringAttentionTotal,
  resolveLatestMilestone,
  shouldShowAgingMilestoneAction,
} from "@/lib/actions/collectionActivity";
import { addCalendarDays } from "@/lib/reminders/ruleTrigger";
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
  evaluationDate?: string;
}) {
  const primary = params.invoices[0];
  const evaluationDate =
    params.evaluationDate ??
    (primary?.dueDate && primary.isOverdue && primary.overdueDays > 0
      ? addCalendarDays(primary.dueDate, primary.overdueDays)!
      : computeMilestoneCrossDate(DUE, 7)!);

  return buildDailyActionCategories({
    invoices: params.invoices,
    reminderEligibleInvoiceIds: params.reminderEligible ?? new Set(),
    sentReminderDatesByInvoiceId: params.sentByInvoice ?? new Map(),
    defaultCurrency: params.defaultCurrency ?? "USD",
    sentInvoiceCount: 1,
    evaluationDate,
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

  it("G — day 14 is not a milestone action day (7-day milestone does not linger)", () => {
    const result = build({
      invoices: [invoice({ id: "inv-g", overdueDays: 14 })],
      evaluationDate: addCalendarDays(DUE, 14)!,
    });

    assert.equal(result.collectionActions.length, 0);
  });

  it("H — day 15 → 15-day milestone on milestone cross date", () => {
    const result = build({
      invoices: [invoice({ id: "inv-h", overdueDays: 15 })],
      evaluationDate: computeMilestoneCrossDate(DUE, 15)!,
    });

    const milestone = result.collectionActions[0]?.reasons.find(
      (r) => r.type === "aging_milestone"
    );
    assert.ok(milestone && milestone.type === "aging_milestone");
    assert.equal(milestone.milestoneDays, 15);
  });

  it("I — day 32 is not a milestone action day without a due-today trigger", () => {
    const result = build({
      invoices: [invoice({ id: "inv-i", overdueDays: 32 })],
      evaluationDate: addCalendarDays(DUE, 32)!,
    });

    assert.equal(result.collectionActions.length, 0);
  });

  it("J — successful reminder on milestone cross date suppresses that milestone", () => {
    const cross30 = computeMilestoneCrossDate(DUE, 30)!;
    const result = build({
      invoices: [invoice({ id: "inv-j", overdueDays: 30 })],
      evaluationDate: cross30,
      sentByInvoice: sentMap("inv-j", [cross30]),
    });

    assert.equal(result.collectionActions.length, 0);
  });

  it("K — day 32 without reminder is not actionable from aging alone", () => {
    const result = build({
      invoices: [invoice({ id: "inv-k", overdueDays: 32 })],
      evaluationDate: addCalendarDays(DUE, 32)!,
      sentByInvoice: new Map(),
    });

    assert.equal(result.collectionActions.length, 0);
  });

  it("L — skipped reminder does not create perpetual aging action", () => {
    const result = build({
      invoices: [invoice({ id: "inv-l", overdueDays: 32 })],
      evaluationDate: addCalendarDays(DUE, 32)!,
      sentByInvoice: new Map(),
    });

    assert.equal(result.collectionActions.length, 0);
  });

  it("M — partial payment does not create aging action off milestone day", () => {
    const result = build({
      invoices: [invoice({ id: "inv-m", overdueDays: 32, outstanding: 500 })],
      evaluationDate: addCalendarDays(DUE, 32)!,
    });

    assert.equal(result.collectionActions.length, 0);
  });

  it("N — outstanding = 0 excluded", () => {
    const result = build({
      invoices: [invoice({ id: "inv-n", outstanding: 0, overdueDays: 32 })],
    });

    assert.equal(result.collectionActions.length, 0);
  });

  it("O — day 60 milestone appears on cross date even after earlier reminder", () => {
    const sentDay35 = computeMilestoneCrossDate(DUE, 35)!;
    const cross60 = computeMilestoneCrossDate(DUE, 60)!;
    const result = build({
      invoices: [invoice({ id: "inv-o", overdueDays: 60 })],
      evaluationDate: cross60,
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
    const evalDay = addCalendarDays(DUE, 3)!;
    const result = build({
      invoices: [
        invoice({
          id: "inv-1",
          clientId: "client-a",
          overdueDays: 3,
          riskLevel: "high",
        }),
        invoice({
          id: "inv-2",
          clientId: "client-a",
          overdueDays: 3,
          riskLevel: "high",
        }),
        invoice({
          id: "inv-3",
          clientId: "client-b",
          overdueDays: 3,
          riskLevel: "high",
        }),
        invoice({
          id: "inv-4",
          clientId: "client-c",
          overdueDays: 3,
          riskLevel: "low",
        }),
      ],
      evaluationDate: evalDay,
    });

    assert.equal(result.summary.highRiskCustomerCount, 2);
    assert.equal(result.summary.actionsTodayCount, 4);
  });

  it("summary — reminders ready counts unique invoices with reminder_due", () => {
    const evaluationDate = computeMilestoneCrossDate(DUE, 15)!;
    const result = build({
      invoices: [
        invoice({ id: "inv-rem-1", isOverdue: false, overdueDays: 0, riskLevel: null }),
        invoice({ id: "inv-rem-2", isOverdue: false, overdueDays: 0, riskLevel: null }),
        invoice({ id: "inv-mile", overdueDays: 15 }),
      ],
      reminderEligible: new Set(["inv-rem-1", "inv-rem-2"]),
      evaluationDate,
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
  it("maps reminder_due to scheduled email wording", async () => {
    const { resolveRecommendedAction } = await import("@/lib/actions/resolveRecommendedAction");

    assert.equal(
      resolveRecommendedAction({
        reasons: [{ type: "reminder_due" }],
        execution: { mode: "rule_bound", ruleId: "r1", templateId: null, scheduledDate: "2026-07-01", clientEmail: "a@b.com" },
        isHighRisk: false,
      }),
      "Send scheduled email"
    );
  });

  it("uses channel-neutral prioritize follow-up for high-risk reminder_due rows", async () => {
    const { resolveRecommendedAction } = await import("@/lib/actions/resolveRecommendedAction");

    assert.equal(
      resolveRecommendedAction({
        reasons: [{ type: "reminder_due" }, { type: "newly_overdue" }],
        execution: { mode: "rule_bound", ruleId: "r1", templateId: null, scheduledDate: "2026-07-01", clientEmail: "a@b.com" },
        isHighRisk: true,
      }),
      "Prioritize follow-up"
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

  it("maps aging_milestone to follow up today", async () => {
    const { resolveRecommendedAction } = await import("@/lib/actions/resolveRecommendedAction");

    assert.equal(
      resolveRecommendedAction({
        reasons: [{ type: "aging_milestone", milestoneDays: 15 }],
        execution: { mode: "manual", clientEmail: "a@b.com" },
        isHighRisk: false,
      }),
      "Follow up today"
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
  it("CollectionActionCell preserves Email, WhatsApp, AI Assist, and View wiring", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(
      "app/[workspaceId]/actions/_components/CollectionActionCell.tsx",
      "utf8"
    );

    assert.match(src, /SendReminderButton/);
    assert.match(src, />\s*Email\s*</);
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
    assert.match(src, /NO_ACTIONS_SCHEDULED_TODAY/);
    assert.match(src, /shouldShowOverduePortfolioEmptyState/);
    assert.match(src, /View Collections/);
    assert.match(src, /\/collections/);
    assert.match(src, /recommendedAction/);
  });

  it("CollectionsPortfolioActionCell exposes manual email send outside reminder eligibility", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(
      "app/[workspaceId]/collections/_components/CollectionsPortfolioActionCell.tsx",
      "utf8"
    );

    assert.match(src, /SendReminderButton/);
    assert.match(src, /ruleId=\{null\}/);
    assert.match(src, /scheduledDate=\{null\}/);
    assert.match(src, /clientEmail/);
  });
});

describe("collection action sort priority (R3B)", () => {
  it("orders reminder due before milestone before newly overdue", () => {
    const evaluationDate = computeMilestoneCrossDate(DUE, 15)!;
    const result = build({
      invoices: [
        invoice({ id: "new-only", dueDate: "2026-07-13", overdueDays: 3 }),
        invoice({ id: "mile-only", dueDate: DUE, overdueDays: 15 }),
        invoice({
          id: "reminder-only",
          isOverdue: false,
          overdueDays: 0,
          riskLevel: null,
          displayStatus: "sent",
        }),
      ],
      reminderEligible: new Set(["reminder-only"]),
      evaluationDate,
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

describe("Task 2/3 acceptance — Actions vs Collections eligibility (Part H)", () => {
  const evaluationDate = addCalendarDays(DUE, 200)!;

  it("200-day overdue invoice is NOT permanently actionable from 60-day milestone alone", () => {
    const milestone = shouldShowAgingMilestoneAction({
      isOverdue: true,
      overdueDays: 200,
      dueDate: DUE,
      sentCalendarDates: [],
      evaluationDate,
    });

    assert.equal(milestone, null);

    const result = build({
      invoices: [invoice({ id: "inv-old", overdueDays: 200 })],
      evaluationDate,
    });

    assert.equal(result.collectionActions.length, 0);
  });

  it("exact aging milestone still appears on cross date", () => {
    const cross60 = computeMilestoneCrossDate(DUE, 60)!;
    const milestone = shouldShowAgingMilestoneAction({
      isOverdue: true,
      overdueDays: 60,
      dueDate: DUE,
      sentCalendarDates: [],
      evaluationDate: cross60,
    });

    assert.equal(milestone, 60);
  });

  it("reminder-due invoice still appears in Actions", () => {
    const result = build({
      invoices: [
        invoice({
          id: "inv-rem",
          isOverdue: false,
          overdueDays: 0,
          riskLevel: null,
          displayStatus: "sent",
        }),
      ],
      reminderEligible: new Set(["inv-rem"]),
      evaluationDate,
    });

    assert.equal(result.collectionActions.length, 1);
    assert.ok(result.collectionActions[0]?.reasons.some((r) => r.type === "reminder_due"));
  });

  it("newly overdue invoice still appears in Actions", () => {
    const evalNew = addCalendarDays(DUE, 2)!;
    const result = build({
      invoices: [invoice({ id: "inv-new", overdueDays: 2 })],
      evaluationDate: evalNew,
    });

    assert.equal(result.collectionActions.length, 1);
    assert.ok(result.collectionActions[0]?.reasons.some((r) => r.type === "newly_overdue"));
  });

  it("Actions and Collections are not equivalent — old overdue without today trigger", () => {
    const portfolioOverdue = [
      invoice({ id: "inv-a", overdueDays: 200 }),
      invoice({ id: "inv-b", overdueDays: 100 }),
      invoice({ id: "inv-c", overdueDays: 60 }),
    ];

    const actionsResult = build({
      invoices: portfolioOverdue,
      evaluationDate,
    });

    const collectibleOverdue = portfolioOverdue.filter(
      (row) => row.isOverdue && row.outstanding > 0 && isChaseableInvoice(row)
    );

    assert.equal(collectibleOverdue.length, 3);
    assert.equal(actionsResult.collectionActions.length, 0);
    assert.notEqual(actionsResult.summary.actionsTodayCount, collectibleOverdue.length);
  });

  it("pagination slices 10 rows per page while summary uses full actionable set", async () => {
    const { DAILY_ACTION_CENTER_PAGE_SIZE } = await import("@/lib/actions/types");
    const evalDay = addCalendarDays(DUE, 3)!;
    const invoices = Array.from({ length: 25 }, (_, index) =>
      invoice({ id: `inv-page-${index}`, overdueDays: 3 })
    );

    const full = build({ invoices, evaluationDate: evalDay });
    assert.equal(full.summary.actionsTodayCount, 25);
    assert.equal(DAILY_ACTION_CENTER_PAGE_SIZE, 10);

    const page1 = full.collectionActions.slice(0, 10);
    const page2 = full.collectionActions.slice(10, 20);
    const page3 = full.collectionActions.slice(20, 30);

    assert.equal(page1.length, 10);
    assert.equal(page2.length, 10);
    assert.equal(page3.length, 5);
    assert.equal(full.summary.remindersDueCount, full.collectionActions.filter((row) =>
      row.reasons.some((r) => r.type === "reminder_due")
    ).length);
    assert.equal(
      full.summary.highRiskCustomerCount,
      new Set(
        full.collectionActions.filter((row) => row.isHighRisk).map((row) => row.clientId)
      ).size
    );
  });

  it("priority ordering preserved after eligibility correction", () => {
    const evaluationDate = computeMilestoneCrossDate(DUE, 15)!;
    const result = build({
      invoices: [
        invoice({ id: "low", dueDate: "2026-07-13", overdueDays: 3, riskLevel: "low", outstanding: 100 }),
        invoice({ id: "high", dueDate: "2026-07-13", overdueDays: 3, riskLevel: "high", outstanding: 100 }),
        invoice({ id: "mile", dueDate: DUE, overdueDays: 15, riskLevel: "low", outstanding: 500 }),
        invoice({
          id: "rem",
          isOverdue: false,
          overdueDays: 0,
          riskLevel: null,
          displayStatus: "sent",
          outstanding: 200,
        }),
      ],
      reminderEligible: new Set(["rem"]),
      evaluationDate,
    });

    assert.deepEqual(result.collectionActions.map((row) => row.id), ["rem", "mile", "high", "low"]);
  });
});

describe("Launch fix — reminders/actions coherence", () => {
  const evaluationDate = addCalendarDays(DUE, 33)!;

  it("overdue collectible portfolio is tracked separately from today actions", () => {
    const overdueInvoice = invoice({
      id: "inv-0002",
      overdueDays: 33,
      outstanding: 4000,
      invoiceNumber: "INV-0002",
    });

    const result = build({
      invoices: [overdueInvoice],
      evaluationDate,
    });

    assert.equal(result.summary.actionsTodayCount, 0);
    assert.equal(result.summary.overdueCollectibleCount, 1);
    assert.equal(result.summary.overdueCollectibleByCurrency[0]?.amount, 4000);
    assert.equal(result.summary.overdueCollectibleByCurrency[0]?.currency, "USD");
  });

  it("reminder metrics stay zero when no rule is due today", () => {
    const result = build({
      invoices: [invoice({ id: "inv-0002", overdueDays: 33, outstanding: 4000 })],
      reminderEligible: new Set(),
      evaluationDate,
    });

    assert.equal(result.summary.actionsTodayCount, 0);
    assert.equal(result.summary.remindersDueCount, 0);
    assert.equal(result.summary.overdueCollectibleCount, 1);
  });

  it("does not add overdue invoice to actions merely because it is overdue", () => {
    const result = build({
      invoices: [invoice({ id: "inv-0002", overdueDays: 33, outstanding: 4000 })],
      evaluationDate,
    });

    assert.equal(result.collectionActions.length, 0);
    assert.equal(result.summary.overdueCollectibleCount, 1);
  });

  it("empty state helper distinguishes overdue portfolio from caught up", () => {
    const summary = build({
      invoices: [invoice({ id: "inv-0002", overdueDays: 33, outstanding: 4000 })],
      evaluationDate,
    }).summary;

    assert.equal(shouldShowOverduePortfolioEmptyState(summary), true);
    assert.equal(NO_ACTIONS_SCHEDULED_TODAY.title, "No collection actions scheduled for today.");

    const message = formatOverduePortfolioEmptyContext({
      overdueCollectibleCount: summary.overdueCollectibleCount,
      overdueCollectibleByCurrency: summary.overdueCollectibleByCurrency,
      defaultCurrency: summary.requiringAttentionCurrency,
    });

    assert.match(message, /\$4,000\.00/);
    assert.match(message, /1 invoice/);
    assert.doesNotMatch(message, /caught up/i);
  });

  it("caught-up empty state remains when no overdue collectible invoices exist", () => {
    const summary = build({
      invoices: [invoice({ id: "inv-paid", isOverdue: false, overdueDays: 0, outstanding: 0 })],
      evaluationDate,
    }).summary;

    assert.equal(summary.actionsTodayCount, 0);
    assert.equal(summary.overdueCollectibleCount, 0);
    assert.equal(shouldShowOverduePortfolioEmptyState(summary), false);
  });

  it("exact-date automated reminder behavior remains unchanged", () => {
    const cross7 = addCalendarDays(DUE, 7)!;
    const result = build({
      invoices: [invoice({ id: "inv-7", overdueDays: 7 })],
      reminderEligible: new Set(["inv-7"]),
      evaluationDate: cross7,
    });

    assert.equal(result.collectionActions.length, 1);
    assert.ok(result.collectionActions[0]?.reasons.some((r) => r.type === "reminder_due"));
  });

  it("manual collection execution stays available without scheduled reminder eligibility", async () => {
    const { resolveCollectionActionExecution } = await import(
      "@/lib/actions/resolveCollectionActionExecution"
    );

    const execution = resolveCollectionActionExecution({
      hasReminderDue: false,
      clientEmail: "client@example.com",
    });

    assert.equal(execution.mode, "manual");
  });
});
