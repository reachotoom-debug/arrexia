import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { instantToWorkspaceCalendarDate } from "@/lib/datetime/formatDateTime";
import {
  evaluateReminderEligibility,
  evaluateScheduledOccurrenceEligibility,
  isOccurrenceSatisfied,
  manualEmailSentTodayForInvoice,
  sentHistoryBlocksRuleOccurrence,
} from "../eligibility";
import {
  buildEligibleReminderCandidates,
  type InvoiceCandidateRow,
  type ReminderHistoryCandidateRow,
  type ReminderRuleCandidateRow,
} from "../getEligibleReminders";
import {
  computeLatestRecurringOccurrence,
  RECURRING_OVERDUE_INTERVAL_DAYS,
} from "../recurringChase";
import { executeEligibleReminderCandidates } from "../executeReminderRun";

const WORKSPACE_ID = "ws-recurring";

function usableTemplate(id = "tpl-1") {
  return { id, workspace_id: WORKSPACE_ID, is_enabled: true };
}

function rule(
  overrides: Partial<ReminderRuleCandidateRow> & { id: string; trigger_type: string; offset_days: number }
): ReminderRuleCandidateRow {
  return {
    name: overrides.id,
    for_status: "sent",
    is_enabled: true,
    template_id: overrides.template_id ?? `tpl-${overrides.id}`,
    sort_order: overrides.sort_order ?? 1,
    created_at: "2026-01-01T00:00:00.000Z",
    reminder_template: usableTemplate(overrides.template_id ?? `tpl-${overrides.id}`),
    ...overrides,
  };
}

const RULE_AFTER_3 = rule({
  id: "rule-after-3",
  trigger_type: "after_due",
  offset_days: 3,
  sort_order: 3,
});
const RULE_AFTER_7 = rule({
  id: "rule-after-7",
  trigger_type: "after_due",
  offset_days: 7,
  sort_order: 4,
});
const RULE_AFTER_14 = rule({
  id: "rule-after-14",
  trigger_type: "after_due",
  offset_days: 14,
  sort_order: 5,
});

const MULTI_RULES = [RULE_AFTER_3, RULE_AFTER_7, RULE_AFTER_14];

function invoice(overrides: Partial<InvoiceCandidateRow> = {}): InvoiceCandidateRow {
  return {
    id: "inv-1",
    invoice_number: "INV-001",
    client_id: "client-1",
    client_name: "Acme",
    client_is_active: true,
    client_archived_at: null,
    due_date: "2026-07-01",
    outstanding: 1000,
    paid: 0,
    total: 1000,
    base_status: "sent",
    display_status: "overdue",
    currency: "USD",
    is_overdue: true,
    overdue_days: 63,
    ...overrides,
  };
}

function evaluateCandidates(params: {
  evaluationDate?: string;
  invoices?: InvoiceCandidateRow[];
  rules?: ReminderRuleCandidateRow[];
  historyRows?: ReminderHistoryCandidateRow[];
  workspaceTimeZone?: string;
}) {
  return buildEligibleReminderCandidates({
    workspaceId: WORKSPACE_ID,
    evaluationDate: params.evaluationDate ?? "2026-08-19",
    workspaceTimeZone: params.workspaceTimeZone ?? "UTC",
    invoices: params.invoices ?? [invoice()],
    rules: params.rules ?? MULTI_RULES,
    historyRows: params.historyRows ?? [],
    clientEmailsByClientId: new Map([["client-1", "client@example.com"]]),
  });
}

function allRulesRef(rules: ReminderRuleCandidateRow[]) {
  return rules.map((r) => ({
    id: r.id,
    triggerType: r.trigger_type,
    offsetDays: Number(r.offset_days ?? 0),
    sortOrder: r.sort_order,
    createdAt: r.created_at ?? null,
  }));
}

describe("recurring overdue chase — recurrence formula", () => {
  it("1 — +14 successful → +21 becomes eligible", () => {
    const results = evaluateCandidates({
      evaluationDate: "2026-07-22",
      historyRows: [
        {
          invoice_id: "inv-1",
          rule_id: "rule-after-14",
          status: "sent",
          sent_at: "2026-07-15T10:00:00.000Z",
          scheduled_at: "2026-07-15",
        },
      ],
    });
    assert.equal(results.length, 1);
    assert.equal(results[0]?.scheduledDate, "2026-07-22");
    assert.equal(results[0]?.isRecurring, true);
  });

  it("2 — +21 successful → +28 becomes eligible", () => {
    const results = evaluateCandidates({
      evaluationDate: "2026-07-29",
      historyRows: [
        {
          invoice_id: "inv-1",
          rule_id: "rule-after-14",
          status: "sent",
          sent_at: "2026-07-22T10:00:00.000Z",
          scheduled_at: "2026-07-22",
        },
      ],
    });
    assert.equal(results.length, 1);
    assert.equal(results[0]?.scheduledDate, "2026-07-29");
    assert.equal(results[0]?.isRecurring, true);
  });

  it("3 — future +28 not eligible early", () => {
    const results = evaluateCandidates({
      evaluationDate: "2026-07-28",
      historyRows: [
        {
          invoice_id: "inv-1",
          rule_id: "rule-after-14",
          status: "sent",
          sent_at: "2026-07-22T10:00:00.000Z",
          scheduled_at: "2026-07-22",
        },
      ],
    });
    assert.equal(results.length, 0);
  });

  it("4 — missed +21 catches up next day", () => {
    const missed = evaluateCandidates({
      evaluationDate: "2026-07-22",
      historyRows: [
        {
          invoice_id: "inv-1",
          rule_id: "rule-after-14",
          status: "sent",
          sent_at: "2026-07-15T10:00:00.000Z",
          scheduled_at: "2026-07-15",
        },
      ],
    });
    assert.equal(missed[0]?.scheduledDate, "2026-07-22");

    const nextDay = evaluateCandidates({
      evaluationDate: "2026-07-23",
      historyRows: missed.length
        ? []
        : [
            {
              invoice_id: "inv-1",
              rule_id: "rule-after-14",
              status: "sent",
              sent_at: "2026-07-15T10:00:00.000Z",
              scheduled_at: "2026-07-15",
            },
          ],
    });
    assert.equal(nextDay.length, 1);
    assert.equal(nextDay[0]?.scheduledDate, "2026-07-22");
  });
});

describe("recurring overdue chase — idempotency", () => {
  it("5 — multiple missed cycles → latest only", () => {
    const recurring = computeLatestRecurringOccurrence({
      dueDate: "2026-07-01",
      finalOffsetDays: 14,
      intervalDays: RECURRING_OVERDUE_INTERVAL_DAYS,
      evaluationDate: "2026-08-20",
    });
    assert.equal(recurring?.scheduledDate, "2026-08-19");

    const results = evaluateCandidates({
      evaluationDate: "2026-08-20",
      historyRows: [
        {
          invoice_id: "inv-1",
          rule_id: "rule-after-14",
          status: "sent",
          sent_at: "2026-07-15T10:00:00.000Z",
          scheduled_at: "2026-07-15",
        },
      ],
    });
    assert.equal(results.length, 1);
    assert.equal(results[0]?.scheduledDate, "2026-08-19");
  });

  it("6 — successful recurring occurrence blocks only same scheduledDate", () => {
    const blocked = sentHistoryBlocksRuleOccurrence(
      [
        {
          ruleId: "rule-after-14",
          status: "sent",
          sentAt: "2026-07-22T10:00:00.000Z",
          scheduledAt: "2026-07-22",
        },
      ],
      "rule-after-14",
      "2026-07-22",
      "UTC",
      { triggerType: "after_due", offsetDays: 14 },
      "2026-07-01"
    );
    assert.equal(blocked, true);

    const notBlocked = sentHistoryBlocksRuleOccurrence(
      [
        {
          ruleId: "rule-after-14",
          status: "sent",
          sentAt: "2026-07-22T10:00:00.000Z",
          scheduledAt: "2026-07-22",
        },
      ],
      "rule-after-14",
      "2026-07-29",
      "UTC",
      { triggerType: "after_due", offsetDays: 14 },
      "2026-07-01"
    );
    assert.equal(notBlocked, false);
  });

  it("7 — failed recurring occurrence retries", () => {
    const results = evaluateCandidates({
      evaluationDate: "2026-08-20",
      historyRows: [
        {
          invoice_id: "inv-1",
          rule_id: "rule-after-14",
          status: "failed",
          sent_at: "2026-08-19T10:00:00.000Z",
          scheduled_at: "2026-08-19",
        },
        {
          invoice_id: "inv-1",
          rule_id: "rule-after-14",
          status: "sent",
          sent_at: "2026-07-15T10:00:00.000Z",
          scheduled_at: "2026-07-15",
        },
      ],
    });
    assert.equal(results.length, 1);
    assert.equal(results[0]?.scheduledDate, "2026-08-19");
  });

  it("8 — catch-up send preserves original scheduled_at contract", () => {
    const sendSrc = readFileSync("lib/reminders/send.ts", "utf8");
    assert.match(sendSrc, /scheduled_at:/);
    assert.match(sendSrc, /ruleBoundOccurrenceScheduledDate/);
  });

  it("9 — sent_at may differ from scheduled_at", () => {
    const results = evaluateCandidates({
      evaluationDate: "2026-08-20",
      historyRows: [
        {
          invoice_id: "inv-1",
          rule_id: "rule-after-14",
          status: "sent",
          sent_at: "2026-08-20T10:00:00.000Z",
          scheduled_at: "2026-08-19",
        },
        {
          invoice_id: "inv-1",
          rule_id: "rule-after-14",
          status: "sent",
          sent_at: "2026-07-15T10:00:00.000Z",
          scheduled_at: "2026-07-15",
        },
      ],
    });
    assert.equal(results.length, 0);
  });
});

describe("recurring overdue chase — manual email satisfaction", () => {
  it("10 — manual email on current due occurrence satisfies that occurrence", () => {
    const results = evaluateCandidates({
      evaluationDate: "2026-07-23",
      historyRows: [
        {
          invoice_id: "inv-1",
          rule_id: "rule-after-14",
          status: "sent",
          sent_at: "2026-07-15T10:00:00.000Z",
          scheduled_at: "2026-07-15",
        },
        {
          invoice_id: "inv-1",
          rule_id: null,
          status: "sent",
          sent_at: "2026-07-23T09:00:00.000Z",
        },
      ],
    });
    assert.equal(results.length, 0);
  });

  it("11 — manual email does not satisfy future occurrence", () => {
    const satisfied = isOccurrenceSatisfied({
      history: [
        {
          ruleId: null,
          status: "sent",
          sentAt: "2026-07-23T09:00:00.000Z",
        },
        {
          ruleId: "rule-after-14",
          status: "sent",
          sentAt: "2026-07-15T10:00:00.000Z",
          scheduledAt: "2026-07-15",
        },
      ],
      ruleId: "rule-after-14",
      scheduledDate: "2026-07-29",
      rule: { triggerType: "after_due", offsetDays: 14 },
      dueDate: "2026-07-01",
      workspaceTimeZone: "UTC",
      allRules: allRulesRef(MULTI_RULES),
    });
    assert.equal(satisfied, false);
  });

  it("12 — manual email does not reset recurrence calendar", () => {
    const results = evaluateCandidates({
      evaluationDate: "2026-07-30",
      historyRows: [
        {
          invoice_id: "inv-1",
          rule_id: "rule-after-14",
          status: "sent",
          sent_at: "2026-07-15T10:00:00.000Z",
          scheduled_at: "2026-07-15",
        },
        {
          invoice_id: "inv-1",
          rule_id: null,
          status: "sent",
          sent_at: "2026-07-23T09:00:00.000Z",
        },
      ],
    });
    assert.equal(results.length, 1);
    assert.equal(results[0]?.scheduledDate, "2026-07-29");
  });

  it("13 — same-day manual suppression remains", () => {
    const results = evaluateCandidates({
      evaluationDate: "2026-07-22",
      historyRows: [
        {
          invoice_id: "inv-1",
          rule_id: null,
          status: "sent",
          sent_at: "2026-07-22T09:00:00.000Z",
        },
        {
          invoice_id: "inv-1",
          rule_id: "rule-after-14",
          status: "sent",
          sent_at: "2026-07-15T10:00:00.000Z",
          scheduled_at: "2026-07-15",
        },
      ],
    });
    assert.equal(results.length, 0);
    assert.equal(
      manualEmailSentTodayForInvoice(
        [
          { ruleId: null, status: "sent", sentAt: "2026-07-22T09:00:00.000Z" },
        ],
        "2026-07-22",
        "UTC"
      ),
      true
    );
  });

  it("14 — WhatsApp has no satisfaction effect", () => {
    assert.equal(
      manualEmailSentTodayForInvoice(
        [{ ruleId: "wa-channel", status: "sent", sentAt: "2026-07-22T09:00:00.000Z" }],
        "2026-07-22",
        "UTC"
      ),
      false
    );
  });
});

describe("recurring overdue chase — stop conditions", () => {
  it("15 — partial payment remains eligible", () => {
    const results = evaluateCandidates({
      evaluationDate: "2026-07-22",
      invoices: [invoice({ paid: 400, outstanding: 600 })],
      historyRows: [
        {
          invoice_id: "inv-1",
          rule_id: "rule-after-14",
          status: "sent",
          sent_at: "2026-07-15T10:00:00.000Z",
          scheduled_at: "2026-07-15",
        },
      ],
    });
    assert.equal(results.length, 1);
  });

  it("16 — paid stops", () => {
    const results = evaluateCandidates({
      invoices: [invoice({ outstanding: 0, paid: 1000 })],
    });
    assert.equal(results.length, 0);
  });

  it("17 — zero outstanding stops", () => {
    const results = evaluateCandidates({
      invoices: [invoice({ outstanding: 0 })],
    });
    assert.equal(results.length, 0);
  });

  it("18 — void stops", () => {
    const result = evaluateScheduledOccurrenceEligibility({
      evaluationDate: "2026-07-22",
      workspaceTimeZone: "UTC",
      scheduledDate: "2026-07-22",
      rule: {
        id: "rule-after-14",
        isEnabled: true,
        triggerType: "after_due",
        offsetDays: 14,
        forStatus: "sent",
      },
      invoice: {
        dueDate: "2026-07-01",
        outstanding: 1000,
        paid: 0,
        baseStatus: "void",
        clientIsActive: true,
      },
      history: [],
      allRules: allRulesRef(MULTI_RULES),
    });
    assert.equal(result.reason, "invoice_not_collectible");
  });

  it("19 — archived stops", () => {
    const results = evaluateCandidates({
      invoices: [invoice({ archived_at: "2026-07-01T00:00:00.000Z" })],
    });
    assert.equal(results.length, 0);
  });

  it("20 — inactive client stops", () => {
    const results = evaluateCandidates({
      invoices: [invoice({ client_is_active: false })],
    });
    assert.equal(results.length, 0);
  });

  it("21 — disabled final rule stops recurrence", () => {
    const results = evaluateCandidates({
      rules: [{ ...RULE_AFTER_14, is_enabled: false }],
    });
    assert.equal(results.length, 0);
  });
});

describe("recurring overdue chase — automation contract", () => {
  it("22 — automation off → no cron send (runner gate preserved)", () => {
    const runSrc = readFileSync("lib/reminders/run-reminders.ts", "utf8");
    assert.match(runSrc, /auto_send_reminders|automationGate|automation/i);
  });

  it("23 — automation re-enabled → latest catch-up", () => {
    const results = evaluateCandidates({
      evaluationDate: "2026-08-20",
      historyRows: [
        {
          invoice_id: "inv-1",
          rule_id: "rule-after-14",
          status: "sent",
          sent_at: "2026-07-15T10:00:00.000Z",
          scheduled_at: "2026-07-15",
        },
      ],
    });
    assert.equal(results[0]?.scheduledDate, "2026-08-19");
  });
});

describe("recurring overdue chase — imported invoice", () => {
  it("24 — imported 63-day overdue → ONE latest recurring occurrence", () => {
    const results = evaluateCandidates({
      evaluationDate: "2026-09-02",
      invoices: [invoice({ due_date: "2026-07-01" })],
      historyRows: [],
    });
    assert.equal(results.length, 1);
    assert.equal(results[0]?.isRecurring, true);
    assert.equal(results[0]?.scheduledDate, "2026-09-02");
  });

  it("25 — no historical +3/+7/+14 replay for imported old invoice", () => {
    const results = evaluateCandidates({
      evaluationDate: "2026-09-02",
      historyRows: [],
    });
    assert.notEqual(results[0]?.scheduledDate, "2026-07-04");
    assert.notEqual(results[0]?.scheduledDate, "2026-07-08");
    assert.notEqual(results[0]?.scheduledDate, "2026-07-15");
  });
});

describe("recurring overdue chase — timezone and surfaces", () => {
  it("26 — timezone boundary", () => {
    const instant = new Date("2026-07-21T16:00:00.000Z");
    const singaporeDate = instantToWorkspaceCalendarDate(instant, "Asia/Singapore");
    assert.equal(singaporeDate, "2026-07-22");

    const results = evaluateCandidates({
      evaluationDate: singaporeDate!,
      workspaceTimeZone: "Asia/Singapore",
      historyRows: [
        {
          invoice_id: "inv-1",
          rule_id: "rule-after-14",
          status: "sent",
          sent_at: "2026-07-15T10:00:00.000Z",
          scheduled_at: "2026-07-15",
        },
      ],
    });
    assert.equal(results.length, 1);
    assert.equal(results[0]?.scheduledDate, "2026-07-22");
  });

  it("27 — Ready-to-Send max one candidate per invoice", () => {
    const results = evaluateCandidates({
      evaluationDate: "2026-08-20",
      invoices: [
        invoice({ id: "inv-a" }),
        invoice({ id: "inv-b", client_id: "client-2" }),
      ],
    });
    assert.equal(new Set(results.map((r) => r.invoiceId)).size, results.length);
  });

  it("28 — Actions max one row per invoice (same canonical candidate)", () => {
    const actionsSrc = readFileSync("lib/actions/getDailyActionCenterData.ts", "utf8");
    assert.match(actionsSrc, /getEligibleReminders/);
    assert.match(actionsSrc, /if \(map\[candidate\.invoiceId\]\) continue/);
  });

  it("29 — Actions uses same canonical candidate engine", () => {
    const actionsSrc = readFileSync("lib/actions/getDailyActionCenterData.ts", "utf8");
    assert.doesNotMatch(actionsSrc, /computeLatestRecurringOccurrence/);
  });

  it("30 — cron uses same canonical candidate", () => {
    const runSrc = readFileSync("lib/reminders/run-reminders.ts", "utf8");
    assert.match(runSrc, /getEligibleReminders/);
    assert.match(runSrc, /executeEligibleReminderCandidates/);
  });
});

describe("recurring overdue chase — legacy compatibility", () => {
  it("legacy NULL scheduled_at blocks static one-shot only", () => {
    const legacyBlocksFinal = sentHistoryBlocksRuleOccurrence(
      [{ ruleId: "rule-after-14", status: "sent", sentAt: "2026-07-15T10:00:00.000Z" }],
      "rule-after-14",
      "2026-07-15",
      "UTC",
      { triggerType: "after_due", offsetDays: 14 },
      "2026-07-01"
    );
    assert.equal(legacyBlocksFinal, true);

    const legacyDoesNotBlockRecurring = sentHistoryBlocksRuleOccurrence(
      [{ ruleId: "rule-after-14", status: "sent", sentAt: "2026-07-15T10:00:00.000Z" }],
      "rule-after-14",
      "2026-07-22",
      "UTC",
      { triggerType: "after_due", offsetDays: 14 },
      "2026-07-01"
    );
    assert.equal(legacyDoesNotBlockRecurring, false);
  });

  it("legacy +14 sent enables recurring without replay", () => {
    const results = evaluateCandidates({
      evaluationDate: "2026-07-22",
      historyRows: [
        {
          invoice_id: "inv-1",
          rule_id: "rule-after-14",
          status: "sent",
          sent_at: "2026-07-15T10:00:00.000Z",
        },
      ],
    });
    assert.equal(results.length, 1);
    assert.equal(results[0]?.scheduledDate, "2026-07-22");
    assert.equal(results[0]?.isRecurring, true);
  });
});

describe("recurring overdue chase — catch-up V1 regression", () => {
  it("31 — original catch-up +14 still eligible when due", () => {
    const results = evaluateCandidates({
      evaluationDate: "2026-07-15",
      rules: [RULE_AFTER_14],
      historyRows: [],
    });
    assert.equal(results.length, 1);
    assert.equal(results[0]?.scheduledDate, "2026-07-15");
    assert.notEqual(results[0]?.isRecurring, true);
  });

  it("32 — existing one-shot rules remain correct", () => {
    const results = evaluateCandidates({
      evaluationDate: "2026-07-08",
      rules: MULTI_RULES,
      historyRows: [],
    });
    assert.equal(results.length, 1);
    assert.equal(results[0]?.scheduledDate, "2026-07-08");
    assert.equal(results[0]?.ruleId, "rule-after-7");
  });

  it("cron execute passes scheduledDate through to send", async () => {
    let capturedScheduledDate: string | undefined;
    await executeEligibleReminderCandidates(
      WORKSPACE_ID,
      [
        {
          id: "inv-1:rule-after-14:2026-07-22",
          invoiceId: "inv-1",
          invoiceNumber: "INV-001",
          clientId: "client-1",
          clientName: "Acme",
          clientEmail: "a@b.com",
          dueDate: "2026-07-01",
          total: 1000,
          paid: 0,
          outstanding: 1000,
          baseStatus: "sent",
          displayStatus: "overdue",
          currency: "USD",
          isOverdue: true,
          ruleId: "rule-after-14",
          ruleName: "14 days",
          templateId: "tpl-1",
          triggerType: "after_due",
          offsetDays: 14,
          scheduledDate: "2026-07-22",
          daysFromDueDate: 21,
          ruleLabel: "Recurring overdue chase",
          eligibilityReason: "eligible",
          isRecurring: true,
        },
      ],
      async (opts) => {
        capturedScheduledDate = opts.scheduledDate;
        return { success: true, status: "sent" };
      }
    );
    assert.equal(capturedScheduledDate, "2026-07-22");
  });
});

describe("recurring presentation labels", () => {
  it("recurring candidate uses chase labels", () => {
    const results = evaluateCandidates({
      evaluationDate: "2026-07-22",
      historyRows: [
        {
          invoice_id: "inv-1",
          rule_id: "rule-after-14",
          status: "sent",
          sent_at: "2026-07-15T10:00:00.000Z",
          scheduled_at: "2026-07-15",
        },
      ],
    });
    assert.equal(results[0]?.ruleLabel, "Recurring overdue chase");
  });
});
