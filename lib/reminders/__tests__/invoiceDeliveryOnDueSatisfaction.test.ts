import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { instantToWorkspaceCalendarDate } from "@/lib/datetime/formatDateTime";
import {
  evaluateReminderEligibility,
  invoiceDeliverySatisfiesOnDueOccurrence,
  isRecurringContactCooldownActive,
  manualEmailSentTodayForInvoice,
} from "../eligibility";
import {
  buildEligibleReminderCandidates,
  buildSuccessfulInvoiceDeliveryOnDueDateByInvoiceId,
  type InvoiceCandidateRow,
  type InvoiceDeliveryCandidateRow,
  type ReminderHistoryCandidateRow,
  type ReminderRuleCandidateRow,
} from "../getEligibleReminders";

const WORKSPACE_ID = "ws-due-day-delivery";

function usableTemplate(id = "tpl-on-due") {
  return { id, workspace_id: WORKSPACE_ID, is_enabled: true };
}

const RULE_ON_DUE: ReminderRuleCandidateRow = {
  id: "rule-on-due",
  name: "On due date",
  trigger_type: "on_due",
  offset_days: 0,
  for_status: "sent",
  is_enabled: true,
  template_id: "tpl-on-due",
  sort_order: 2,
  created_at: "2026-01-01T00:00:00.000Z",
  reminder_template: usableTemplate(),
};

const RULE_BEFORE_3: ReminderRuleCandidateRow = {
  id: "rule-before-3",
  name: "3 days before due",
  trigger_type: "before_due",
  offset_days: 3,
  for_status: "sent",
  is_enabled: true,
  template_id: "tpl-before-3",
  sort_order: 1,
  created_at: "2026-01-01T00:00:00.000Z",
  reminder_template: usableTemplate("tpl-before-3"),
};

const RULE_AFTER_3: ReminderRuleCandidateRow = {
  id: "rule-after-3",
  name: "3 days after due",
  trigger_type: "after_due",
  offset_days: 3,
  for_status: "sent",
  is_enabled: true,
  template_id: "tpl-after-3",
  sort_order: 3,
  created_at: "2026-01-02T00:00:00.000Z",
  reminder_template: usableTemplate("tpl-after-3"),
};

const RULE_AFTER_7: ReminderRuleCandidateRow = {
  id: "rule-after-7",
  name: "7 days after due",
  trigger_type: "after_due",
  offset_days: 7,
  for_status: "sent",
  is_enabled: true,
  template_id: "tpl-after-7",
  sort_order: 4,
  created_at: "2026-01-03T00:00:00.000Z",
  reminder_template: usableTemplate("tpl-after-7"),
};

const RULE_AFTER_14: ReminderRuleCandidateRow = {
  id: "rule-after-14",
  name: "14 days after due",
  trigger_type: "after_due",
  offset_days: 14,
  for_status: "sent",
  is_enabled: true,
  template_id: "tpl-after-14",
  sort_order: 5,
  created_at: "2026-01-04T00:00:00.000Z",
  reminder_template: usableTemplate("tpl-after-14"),
};

function baseInvoice(
  overrides: Partial<InvoiceCandidateRow> = {}
): InvoiceCandidateRow {
  return {
    id: "inv-1",
    invoice_number: "INV-0001",
    client_id: "client-1",
    client_name: "Acme Corp",
    client_is_active: true,
    client_archived_at: null,
    due_date: "2026-08-17",
    outstanding: 1000,
    paid: 0,
    total: 1000,
    base_status: "sent",
    display_status: "sent",
    currency: "JOD",
    is_overdue: false,
    overdue_days: 0,
    ...overrides,
  };
}

function evaluate(params: {
  evaluationDate?: string;
  workspaceTimeZone?: string;
  invoices?: InvoiceCandidateRow[];
  rules?: ReminderRuleCandidateRow[];
  historyRows?: ReminderHistoryCandidateRow[];
  invoiceDeliveryRows?: InvoiceDeliveryCandidateRow[];
}) {
  return buildEligibleReminderCandidates({
    workspaceId: WORKSPACE_ID,
    evaluationDate: params.evaluationDate ?? "2026-08-17",
    workspaceTimeZone: params.workspaceTimeZone ?? "UTC",
    invoices: params.invoices ?? [baseInvoice()],
    rules: params.rules ?? [RULE_ON_DUE],
    historyRows: params.historyRows ?? [],
    invoiceDeliveryRows: params.invoiceDeliveryRows ?? [],
    clientEmailsByClientId: new Map([["client-1", "billing@acme.test"]]),
  });
}

describe("due-day invoice delivery reminder satisfaction", () => {
  it("A — due today + successful invoice delivery today => on_due NOT eligible", () => {
    const results = evaluate({
      invoiceDeliveryRows: [
        {
          invoice_id: "inv-1",
          status: "sent",
          created_at: "2026-08-17T10:00:00.000Z",
        },
      ],
    });
    assert.equal(results.length, 0);
  });

  it("B — due today + no successful invoice delivery => on_due eligible", () => {
    const results = evaluate({});
    assert.equal(results.length, 1);
    assert.equal(results[0]?.ruleId, "rule-on-due");
    assert.equal(results[0]?.scheduledDate, "2026-08-17");
  });

  it("C — due today + failed invoice delivery today => on_due remains eligible", () => {
    const results = evaluate({
      invoiceDeliveryRows: [
        {
          invoice_id: "inv-1",
          status: "failed",
          created_at: "2026-08-17T10:00:00.000Z",
        },
      ],
    });
    assert.equal(results.length, 1);
    assert.equal(results[0]?.ruleId, "rule-on-due");
  });

  it("D — invoice delivery before due date does NOT satisfy on_due occurrence", () => {
    const results = evaluate({
      invoiceDeliveryRows: [
        {
          invoice_id: "inv-1",
          status: "sent",
          created_at: "2026-08-16T10:00:00.000Z",
        },
      ],
    });
    assert.equal(results.length, 1);
    assert.equal(results[0]?.ruleId, "rule-on-due");
  });

  it("E — invoice delivered on due date does NOT suppress later +3/+7/+14 occurrences", () => {
    const results = evaluate({
      evaluationDate: "2026-08-20",
      rules: [RULE_ON_DUE, RULE_AFTER_3, RULE_AFTER_7, RULE_AFTER_14],
      invoices: [
        baseInvoice({
          due_date: "2026-08-17",
          display_status: "overdue",
          is_overdue: true,
          overdue_days: 3,
        }),
      ],
      invoiceDeliveryRows: [
        {
          invoice_id: "inv-1",
          status: "sent",
          created_at: "2026-08-17T09:00:00.000Z",
        },
      ],
    });
    assert.equal(results.length, 1);
    assert.equal(results[0]?.ruleId, "rule-after-3");
    assert.equal(results[0]?.scheduledDate, "2026-08-20");
  });

  it("F — invoice delivered on due date does NOT alter recurring overdue cooldown semantics", () => {
    const evaluationDate = "2026-07-22";
    const history = [
      {
        ruleId: "rule-after-14",
        status: "sent",
        sentAt: "2026-07-20T12:00:00.000Z",
        scheduledAt: "2026-07-15",
        channel: "email",
      },
    ] as const;

    const cooldownWithoutDelivery = isRecurringContactCooldownActive({
      evaluationDate,
      history: [...history],
      workspaceTimeZone: "UTC",
    });

    const withoutDelivery = buildEligibleReminderCandidates({
      workspaceId: WORKSPACE_ID,
      evaluationDate,
      workspaceTimeZone: "UTC",
      invoices: [
        baseInvoice({
          due_date: "2026-07-01",
          display_status: "overdue",
          is_overdue: true,
          overdue_days: 21,
        }),
      ],
      rules: [RULE_AFTER_3, RULE_AFTER_7, RULE_AFTER_14],
      historyRows: [
        {
          invoice_id: "inv-1",
          rule_id: "rule-after-14",
          status: "sent",
          sent_at: "2026-07-20T12:00:00.000Z",
          scheduled_at: "2026-07-15",
          channel: "email",
        },
      ],
      clientEmailsByClientId: new Map([["client-1", "billing@acme.test"]]),
    });

    const withDelivery = buildEligibleReminderCandidates({
      workspaceId: WORKSPACE_ID,
      evaluationDate,
      workspaceTimeZone: "UTC",
      invoices: [
        baseInvoice({
          due_date: "2026-07-01",
          display_status: "overdue",
          is_overdue: true,
          overdue_days: 21,
        }),
      ],
      rules: [RULE_AFTER_3, RULE_AFTER_7, RULE_AFTER_14],
      historyRows: [
        {
          invoice_id: "inv-1",
          rule_id: "rule-after-14",
          status: "sent",
          sent_at: "2026-07-20T12:00:00.000Z",
          scheduled_at: "2026-07-15",
          channel: "email",
        },
      ],
      invoiceDeliveryRows: [
        {
          invoice_id: "inv-1",
          status: "sent",
          created_at: "2026-07-01T08:00:00.000Z",
        },
      ],
      clientEmailsByClientId: new Map([["client-1", "billing@acme.test"]]),
    });

    const cooldownWithDelivery = isRecurringContactCooldownActive({
      evaluationDate,
      history: [...history],
      workspaceTimeZone: "UTC",
    });

    assert.equal(cooldownWithoutDelivery, true);
    assert.equal(cooldownWithDelivery, true);
    assert.equal(withoutDelivery.length, 0);
    assert.equal(withDelivery.length, 0);
  });

  it("G — workspace timezone boundary uses workspace calendar date, not naive UTC", () => {
    const createdAt = "2026-08-16T22:00:00.000Z";
    assert.equal(instantToWorkspaceCalendarDate(createdAt, "Asia/Amman"), "2026-08-17");

    const map = buildSuccessfulInvoiceDeliveryOnDueDateByInvoiceId({
      invoices: [baseInvoice({ due_date: "2026-08-17" })],
      deliveryRows: [
        {
          invoice_id: "inv-1",
          status: "sent",
          created_at: createdAt,
        },
      ],
      workspaceTimeZone: "Asia/Amman",
    });
    assert.equal(map.get("inv-1"), true);

    const utcMap = buildSuccessfulInvoiceDeliveryOnDueDateByInvoiceId({
      invoices: [baseInvoice({ due_date: "2026-08-17" })],
      deliveryRows: [
        {
          invoice_id: "inv-1",
          status: "sent",
          created_at: createdAt,
        },
      ],
      workspaceTimeZone: "UTC",
    });
    assert.equal(utcMap.get("inv-1"), undefined);

    const results = evaluate({
      workspaceTimeZone: "Asia/Amman",
      invoiceDeliveryRows: [
        {
          invoice_id: "inv-1",
          status: "sent",
          created_at: createdAt,
        },
      ],
    });
    assert.equal(results.length, 0);
  });

  it("H — existing manual-email same-day suppression continues passing", () => {
    const blocked = manualEmailSentTodayForInvoice(
      [
        {
          ruleId: null,
          status: "sent",
          sentAt: "2026-08-17T10:00:00.000Z",
        },
      ],
      "2026-08-17",
      "UTC"
    );
    assert.equal(blocked, true);

    const results = evaluate({
      historyRows: [
        {
          invoice_id: "inv-1",
          rule_id: null,
          status: "sent",
          sent_at: "2026-08-17T10:00:00.000Z",
        },
      ],
      invoiceDeliveryRows: [
        {
          invoice_id: "inv-1",
          status: "sent",
          created_at: "2026-08-17T11:00:00.000Z",
        },
      ],
    });
    assert.equal(results.length, 0);
  });

  it("invoiceDeliverySatisfiesOnDueOccurrence is narrow to on_due + due date match", () => {
    assert.equal(
      invoiceDeliverySatisfiesOnDueOccurrence({
        triggerType: "on_due",
        scheduledDate: "2026-08-17",
        dueDate: "2026-08-17",
        successfulInvoiceDeliveryOnDueDate: true,
      }),
      true
    );
    assert.equal(
      invoiceDeliverySatisfiesOnDueOccurrence({
        triggerType: "after_due",
        scheduledDate: "2026-08-20",
        dueDate: "2026-08-17",
        successfulInvoiceDeliveryOnDueDate: true,
      }),
      false
    );
  });

  it("evaluateReminderEligibility marks on_due ineligible when delivery satisfied", () => {
    const result = evaluateReminderEligibility({
      evaluationDate: "2026-08-17",
      workspaceTimeZone: "UTC",
      rule: {
        id: "rule-on-due",
        isEnabled: true,
        triggerType: "on_due",
        offsetDays: 0,
        forStatus: "sent",
      },
      invoice: {
        dueDate: "2026-08-17",
        outstanding: 1000,
        paid: 0,
        baseStatus: "sent",
        clientIsActive: true,
      },
      history: [],
      successfulInvoiceDeliveryOnDueDate: true,
    });
    assert.equal(result.eligible, false);
    assert.equal(result.reason, "already_sent_for_rule");
  });

  it("getEligibleReminders loads invoice_delivery_logs for due-day satisfaction only", () => {
    const src = readFileSync("lib/reminders/getEligibleReminders.ts", "utf8");
    assert.match(src, /from\("invoice_delivery_logs"\)/);
    assert.match(src, /invoiceDeliveryRows/);
    assert.doesNotMatch(src, /invoice_delivery_logs[\s\S]*reminders.*insert/);
  });
});

describe("due-day invoice delivery — catch-up preserved", () => {
  it("I — before_due catch-up still eligible when delivery was on due date only", () => {
    const results = evaluate({
      evaluationDate: "2026-08-17",
      rules: [RULE_BEFORE_3, RULE_ON_DUE],
      invoiceDeliveryRows: [
        {
          invoice_id: "inv-1",
          status: "sent",
          created_at: "2026-08-17T10:00:00.000Z",
        },
      ],
    });
    assert.equal(results.length, 1);
    assert.equal(results[0]?.ruleId, "rule-before-3");
    assert.equal(results[0]?.scheduledDate, "2026-08-14");
  });
});
