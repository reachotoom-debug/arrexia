import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { instantToWorkspaceCalendarDate } from "@/lib/datetime/formatDateTime";
import {
  buildEligibleReminderCandidates,
  type InvoiceCandidateRow,
  type ReminderHistoryCandidateRow,
  type ReminderRuleCandidateRow,
} from "../getEligibleReminders";
import {
  executeEligibleReminderCandidates,
  type SendReminderForInvoiceFn,
} from "../executeReminderRun";
import {
  checkRuleOccurrenceDuplicateBeforeSend,
  ruleOccurrenceAlreadySent,
} from "../ruleOccurrenceGuard";

const WORKSPACE_ID = "ws-cron";
const TZ = "America/Los_Angeles";

function usableTemplate(id: string) {
  return { id, workspace_id: WORKSPACE_ID, is_enabled: true };
}

function rule(
  overrides: Partial<ReminderRuleCandidateRow> & { id: string; trigger_type: string; offset_days: number }
): ReminderRuleCandidateRow {
  return {
    name: overrides.id,
    for_status: "any",
    is_enabled: true,
    template_id: `${overrides.id}-tpl`,
    sort_order: 1,
    created_at: "2026-01-01T00:00:00.000Z",
    reminder_template: usableTemplate(`${overrides.id}-tpl`),
    ...overrides,
  };
}

function invoice(overrides: Partial<InvoiceCandidateRow> = {}): InvoiceCandidateRow {
  return {
    id: "inv-1",
    invoice_number: "INV-001",
    client_id: "client-1",
    client_name: "Acme",
    client_is_active: true,
    client_archived_at: null,
    due_date: "2026-07-22",
    outstanding: 100,
    paid: 0,
    total: 100,
    base_status: "sent",
    display_status: "sent",
    currency: "USD",
    is_overdue: false,
    overdue_days: 0,
    ...overrides,
  };
}

function evaluate(params: {
  evaluationDate?: string;
  invoices?: InvoiceCandidateRow[];
  rules?: ReminderRuleCandidateRow[];
  historyRows?: ReminderHistoryCandidateRow[];
}) {
  return buildEligibleReminderCandidates({
    workspaceId: WORKSPACE_ID,
    evaluationDate: params.evaluationDate ?? "2026-07-22",
    workspaceTimeZone: TZ,
    invoices: params.invoices ?? [invoice()],
    rules: params.rules ?? [
      rule({ id: "rule-on-due", trigger_type: "on_due", offset_days: 0 }),
    ],
    historyRows: params.historyRows ?? [],
    clientEmailsByClientId: new Map([["client-1", "a@test.com"]]),
  });
}

describe("R2C cron module contract", () => {
  it("run-reminders does not call findApplicableRuleForInvoice", () => {
    const src = readFileSync("lib/reminders/run-reminders.ts", "utf8");
    assert.doesNotMatch(src, /findApplicableRuleForInvoice/);
    assert.match(src, /getEligibleReminders/);
  });
});

describe("R2C eligibility (canonical builder)", () => {
  it("includes before_due candidate on scheduled date", () => {
    const results = evaluate({
      evaluationDate: "2026-07-19",
      rules: [rule({ id: "rule-before", trigger_type: "before_due", offset_days: 3 })],
      invoices: [invoice({ due_date: "2026-07-22" })],
    });
    assert.equal(results.length, 1);
    assert.equal(results[0].triggerType, "before_due");
  });

  it("includes on_due candidate", () => {
    const results = evaluate({
      evaluationDate: "2026-07-22",
      rules: [rule({ id: "rule-on-due", trigger_type: "on_due", offset_days: 0 })],
    });
    assert.equal(results.length, 1);
  });

  it("includes after_due candidate", () => {
    const results = evaluate({
      evaluationDate: "2026-07-29",
      rules: [rule({ id: "rule-after", trigger_type: "after_due", offset_days: 7 })],
      invoices: [invoice({ due_date: "2026-07-22", display_status: "overdue", is_overdue: true })],
    });
    assert.equal(results.length, 1);
  });

  it("excludes trigger-not-due occurrence", () => {
    const results = evaluate({
      evaluationDate: "2026-07-21",
      rules: [rule({ id: "rule-on-due", trigger_type: "on_due", offset_days: 0 })],
    });
    assert.equal(results.length, 0);
  });

  it("excludes for_status mismatch", () => {
    const results = evaluate({
      rules: [
        {
          ...rule({ id: "rule-overdue", trigger_type: "on_due", offset_days: 0 }),
          for_status: "overdue",
        },
      ],
      invoices: [invoice({ due_date: "2026-07-25" })],
    });
    assert.equal(results.length, 0);
  });

  it("includes partially-paid overdue under partially_paid rule", () => {
    const results = evaluate({
      evaluationDate: "2026-07-29",
      rules: [
        {
          ...rule({ id: "rule-pp", trigger_type: "after_due", offset_days: 7 }),
          for_status: "partially_paid",
        },
      ],
      invoices: [
        invoice({
          due_date: "2026-07-22",
          paid: 40,
          outstanding: 60,
          display_status: "overdue",
          is_overdue: true,
        }),
      ],
    });
    assert.equal(results.length, 1);
  });

  it("excludes archived client", () => {
    const results = evaluate({
      invoices: [invoice({ client_archived_at: "2026-07-01T00:00:00.000Z" })],
    });
    assert.equal(results.length, 0);
  });

  it("includes inactive non-archived client", () => {
    const results = evaluate({
      invoices: [invoice({ client_is_active: false })],
    });
    assert.equal(results.length, 1);
  });

  it("excludes disabled template", () => {
    const tplId = "rule-on-due-tpl";
    const results = evaluate({
      rules: [
        {
          ...rule({ id: "rule-on-due", trigger_type: "on_due", offset_days: 0 }),
          reminder_template: { id: tplId, workspace_id: WORKSPACE_ID, is_enabled: false },
        },
      ],
    });
    assert.equal(results.length, 0);
  });

  it("excludes missing template join", () => {
    const results = evaluate({
      rules: [
        {
          ...rule({ id: "rule-on-due", trigger_type: "on_due", offset_days: 0 }),
          reminder_template: null,
        },
      ],
    });
    assert.equal(results.length, 0);
  });

  it("excludes successful prior same-rule occurrence", () => {
    const results = evaluate({
      historyRows: [
        {
          invoice_id: "inv-1",
          rule_id: "rule-on-due",
          status: "sent",
          sent_at: "2026-07-22T15:00:00.000Z",
        },
      ],
    });
    assert.equal(results.length, 0);
  });

  it("does not exclude failed prior occurrence", () => {
    const results = evaluate({
      historyRows: [
        {
          invoice_id: "inv-1",
          rule_id: "rule-on-due",
          status: "failed",
          sent_at: "2026-07-22T15:00:00.000Z",
        },
      ],
    });
    assert.equal(results.length, 1);
  });

  it("respects workspace-local evaluation date boundary", () => {
    const evaluationDate = instantToWorkspaceCalendarDate(
      new Date("2026-07-22T07:00:00.000Z"),
      TZ
    );
    assert.equal(evaluationDate, "2026-07-22");

    const results = buildEligibleReminderCandidates({
      workspaceId: WORKSPACE_ID,
      evaluationDate,
      workspaceTimeZone: TZ,
      invoices: [invoice()],
      rules: [rule({ id: "rule-on-due", trigger_type: "on_due", offset_days: 0 })],
      historyRows: [
        {
          invoice_id: "inv-1",
          rule_id: "rule-on-due",
          status: "sent",
          sent_at: "2026-07-22T06:59:00.000Z",
        },
      ],
      clientEmailsByClientId: new Map([["client-1", "a@test.com"]]),
    });
    assert.equal(results.length, 1);
  });
});

describe("executeEligibleReminderCandidates", () => {
  it("passes ruleId, templateId, scheduledDate and auto_cron source to send", async () => {
    const eligible = evaluate({});
    type SendCall = Parameters<SendReminderForInvoiceFn>[0];
    const calls: SendCall[] = [];

    await executeEligibleReminderCandidates(
      WORKSPACE_ID,
      eligible,
      async (opts) => {
        calls.push(opts);
        return { success: true, status: "sent" };
      }
    );

    assert.equal(calls.length, 1);
    assert.equal(calls[0].ruleId, "rule-on-due");
    assert.equal(calls[0].templateId, "rule-on-due-tpl");
    assert.equal(calls[0].scheduledDate, "2026-07-22");
    assert.equal(calls[0].source, "auto_cron");
  });

  it("continues after one send failure", async () => {
    const eligible = evaluate({
      evaluationDate: "2026-07-29",
      rules: [
        rule({ id: "rule-a", trigger_type: "after_due", offset_days: 7, sort_order: 1 }),
        {
          ...rule({ id: "rule-b", trigger_type: "after_due", offset_days: 7, sort_order: 2 }),
          template_id: "rule-b-tpl",
          reminder_template: usableTemplate("rule-b-tpl"),
        },
      ],
      invoices: [
        invoice({
          due_date: "2026-07-22",
          display_status: "overdue",
          is_overdue: true,
          overdue_days: 7,
        }),
      ],
    });

    assert.equal(eligible.length, 2);

    let callCount = 0;
    const summary = await executeEligibleReminderCandidates(
      WORKSPACE_ID,
      eligible,
      async () => {
        callCount++;
        if (callCount === 1) {
          return { success: false, status: "failed", errorMessage: "smtp down" };
        }
        return { success: true, status: "sent" };
      }
    );

    assert.equal(callCount, 2);
    assert.equal(summary.remindersFailed, 1);
    assert.equal(summary.remindersSent, 1);
  });
});

describe("ruleOccurrence duplicate guard", () => {
  it("blocks when successful sent history exists for scheduled date", () => {
    const blocked = ruleOccurrenceAlreadySent({
      history: [
        {
          ruleId: "rule-on-due",
          status: "sent",
          sentAt: "2026-07-22T10:00:00.000Z",
        },
      ],
      ruleId: "rule-on-due",
      scheduledDate: "2026-07-22",
      workspaceTimeZone: "UTC",
    });
    assert.equal(blocked, true);
  });

  it("does not block on failed history", () => {
    const blocked = ruleOccurrenceAlreadySent({
      history: [
        {
          ruleId: "rule-on-due",
          status: "failed",
          sentAt: "2026-07-22T10:00:00.000Z",
        },
      ],
      ruleId: "rule-on-due",
      scheduledDate: "2026-07-22",
      workspaceTimeZone: "UTC",
    });
    assert.equal(blocked, false);
  });

  it("pre-send guard queries workspace-scoped history", async () => {
    const eqCalls: string[] = [];
    const builder = {
      select() {
        return builder;
      },
      eq(column: string, value: string) {
        eqCalls.push(`${column}=${value}`);
        return builder;
      },
      then(
        resolve: (value: { data: unknown[]; error: null }) => void,
        _reject?: (reason: unknown) => void
      ) {
        resolve({
          data: [
            {
              rule_id: "rule-on-due",
              status: "sent",
              sent_at: "2026-07-22T12:00:00.000Z",
            },
          ],
          error: null,
        });
      },
    };
    const supabase = {
      from(table: string) {
        assert.equal(table, "reminders");
        return builder;
      },
    };

    const result = await checkRuleOccurrenceDuplicateBeforeSend({
      supabase: supabase as never,
      workspaceId: WORKSPACE_ID,
      invoiceId: "inv-1",
      ruleId: "rule-on-due",
      triggerType: "on_due",
      offsetDays: 0,
      dueDate: "2026-07-22",
      workspaceTimeZone: "UTC",
    });

    assert.equal(result.blocked, true);
    assert.ok(eqCalls.some((c) => c.startsWith("workspace_id=")));
    assert.ok(eqCalls.some((c) => c.startsWith("invoice_id=")));
  });
});
