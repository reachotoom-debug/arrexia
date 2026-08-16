import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  getLatestSuccessfulCollectionEmailDate,
  isRecurringContactCooldownActive,
} from "../eligibility";
import {
  buildEligibleReminderCandidates,
  type InvoiceCandidateRow,
  type ReminderHistoryCandidateRow,
  type ReminderRuleCandidateRow,
} from "../getEligibleReminders";
import { RECURRING_CONTACT_COOLDOWN_DAYS } from "../recurringChase";

const WORKSPACE_ID = "ws-cadence";

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
    overdue_days: 21,
    ...overrides,
  };
}

function evaluateCandidates(params: {
  evaluationDate: string;
  historyRows?: ReminderHistoryCandidateRow[];
  rules?: ReminderRuleCandidateRow[];
}) {
  return buildEligibleReminderCandidates({
    workspaceId: WORKSPACE_ID,
    evaluationDate: params.evaluationDate,
    workspaceTimeZone: "UTC",
    invoices: [invoice()],
    rules: params.rules ?? [RULE_AFTER_14],
    historyRows: params.historyRows ?? [],
    clientEmailsByClientId: new Map([["client-1", "client@example.com"]]),
  });
}

const CATCHUP_JUL20_HISTORY: ReminderHistoryCandidateRow[] = [
  {
    invoice_id: "inv-1",
    rule_id: "rule-after-14",
    status: "sent",
    sent_at: "2026-07-20T10:00:00.000Z",
    scheduled_at: "2026-07-15",
  },
];

describe("recurring contact cadence — cooldown gate", () => {
  it("1 — +14 catch-up sent Jul 20 blocks recurring Jul 22", () => {
    const results = evaluateCandidates({
      evaluationDate: "2026-07-22",
      historyRows: CATCHUP_JUL20_HISTORY,
    });
    assert.equal(results.length, 0);
  });

  it("2 — recurring becomes actionable after 7-day contact interval", () => {
    const results = evaluateCandidates({
      evaluationDate: "2026-07-27",
      historyRows: CATCHUP_JUL20_HISTORY,
    });
    assert.equal(results.length, 1);
    assert.equal(results[0]?.scheduledDate, "2026-07-22");
    assert.equal(results[0]?.isRecurring, true);
  });

  it("3 — after cooldown, selects latest recurrence only (no Jul 22 backlog)", () => {
    const results = evaluateCandidates({
      evaluationDate: "2026-07-30",
      historyRows: CATCHUP_JUL20_HISTORY,
    });
    assert.equal(results.length, 1);
    assert.equal(results[0]?.scheduledDate, "2026-07-29");
    assert.equal(results[0]?.isRecurring, true);
  });

  it("4 — successful manual email establishes recurring cooldown", () => {
    const blocked = evaluateCandidates({
      evaluationDate: "2026-08-14",
      historyRows: [
        ...CATCHUP_JUL20_HISTORY,
        {
          invoice_id: "inv-1",
          rule_id: null,
          status: "sent",
          sent_at: "2026-08-13T09:00:00.000Z",
        },
      ],
    });
    assert.equal(blocked.length, 0);

    const allowed = evaluateCandidates({
      evaluationDate: "2026-08-20",
      historyRows: [
        ...CATCHUP_JUL20_HISTORY,
        {
          invoice_id: "inv-1",
          rule_id: null,
          status: "sent",
          sent_at: "2026-08-13T09:00:00.000Z",
        },
      ],
    });
    assert.equal(allowed.length, 1);
    assert.ok(allowed[0]?.isRecurring);
  });

  it("5 — failed email does not establish cooldown", () => {
    assert.equal(
      isRecurringContactCooldownActive({
        evaluationDate: "2026-07-22",
        history: [
          {
            ruleId: "rule-after-14",
            status: "failed",
            sentAt: "2026-07-20T10:00:00.000Z",
          },
        ],
      }),
      false
    );

    const withSuccessfulCatchUp = evaluateCandidates({
      evaluationDate: "2026-07-22",
      historyRows: CATCHUP_JUL20_HISTORY,
    });
    assert.equal(withSuccessfulCatchUp.length, 0);
  });

  it("6 — WhatsApp does not establish cooldown", () => {
    assert.equal(
      getLatestSuccessfulCollectionEmailDate(
        [
          {
            ruleId: "rule-after-14",
            status: "sent",
            sentAt: "2026-07-20T10:00:00.000Z",
            channel: "whatsapp",
          },
        ],
        "UTC"
      ),
      null
    );

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
        {
          invoice_id: "inv-1",
          rule_id: "rule-after-14",
          status: "sent",
          sent_at: "2026-07-20T10:00:00.000Z",
          channel: "whatsapp",
        },
      ],
    });
    assert.equal(results.length, 1);
    assert.equal(results[0]?.scheduledDate, "2026-07-22");
  });

  it("7 — invoice delivery is outside general reminder cooldown/history but satisfies on_due on due date", () => {
    const eligibleSrc = readFileSync("lib/reminders/getEligibleReminders.ts", "utf8");
    assert.match(eligibleSrc, /from\("reminders"\)/);
    assert.match(eligibleSrc, /from\("invoice_delivery_logs"\)/);
    assert.match(eligibleSrc, /buildSuccessfulInvoiceDeliveryOnDueDateByInvoiceId/);
    assert.doesNotMatch(eligibleSrc, /invoice_delivery_logs[\s\S]*isRecurringContactCooldownActive/);

    const results = evaluateCandidates({
      evaluationDate: "2026-07-01",
      rules: [
        rule({
          id: "rule-on-due",
          trigger_type: "on_due",
          offset_days: 0,
          sort_order: 1,
        }),
      ],
    });
    assert.equal(results.length, 1);

    const blocked = buildEligibleReminderCandidates({
      workspaceId: WORKSPACE_ID,
      evaluationDate: "2026-07-01",
      workspaceTimeZone: "UTC",
      invoices: [invoice({ due_date: "2026-07-01" })],
      rules: [
        rule({
          id: "rule-on-due",
          trigger_type: "on_due",
          offset_days: 0,
          sort_order: 1,
        }),
      ],
      historyRows: [],
      invoiceDeliveryRows: [
        {
          invoice_id: "inv-1",
          status: "sent",
          created_at: "2026-07-01T12:00:00.000Z",
        },
      ],
      clientEmailsByClientId: new Map([["client-1", "client@example.com"]]),
    });
    assert.equal(blocked.length, 0);
  });

  it("8 — scheduled_at remains logical recurrence date, not cooldown expiry", () => {
    const results = evaluateCandidates({
      evaluationDate: "2026-07-27",
      historyRows: CATCHUP_JUL20_HISTORY,
    });
    assert.equal(results[0]?.scheduledDate, "2026-07-22");
    assert.notEqual(results[0]?.scheduledDate, "2026-07-27");
  });

  it("9 — no backlog replay after cooldown expires", () => {
    const jul27 = evaluateCandidates({
      evaluationDate: "2026-07-27",
      historyRows: CATCHUP_JUL20_HISTORY,
    });
    const jul30 = evaluateCandidates({
      evaluationDate: "2026-07-30",
      historyRows: CATCHUP_JUL20_HISTORY,
    });
    assert.equal(jul27[0]?.scheduledDate, "2026-07-22");
    assert.equal(jul30[0]?.scheduledDate, "2026-07-29");
  });

  it("10 — Ready to Send, Actions, and cron share canonical candidate gate", () => {
    const eligibleSrc = readFileSync("lib/reminders/getEligibleReminders.ts", "utf8");
    const actionsSrc = readFileSync("lib/actions/getDailyActionCenterData.ts", "utf8");
    const runSrc = readFileSync("lib/reminders/run-reminders.ts", "utf8");
    assert.match(eligibleSrc, /isRecurringContactCooldownActive/);
    assert.match(actionsSrc, /getEligibleReminders/);
    assert.match(runSrc, /getEligibleReminders/);
    assert.doesNotMatch(runSrc, /isRecurringContactCooldownActive/);
  });
});

describe("recurring contact cadence — initial sequence preserved", () => {
  it("11 — early +3/+7/+14 sequence ignores recurring cooldown", () => {
    const results = evaluateCandidates({
      evaluationDate: "2026-07-04",
      rules: MULTI_RULES,
      historyRows: [
        {
          invoice_id: "inv-1",
          rule_id: null,
          status: "sent",
          sent_at: "2026-07-03T09:00:00.000Z",
        },
      ],
    });
    assert.equal(results.length, 1);
    assert.equal(results[0]?.ruleId, "rule-after-3");
    assert.equal(results[0]?.scheduledDate, "2026-07-04");
    assert.notEqual(results[0]?.isRecurring, true);
  });

  it("12 — cooldown constant matches product default", () => {
    assert.equal(RECURRING_CONTACT_COOLDOWN_DAYS, 7);
  });
});
