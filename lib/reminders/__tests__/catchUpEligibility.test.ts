import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { instantToWorkspaceCalendarDate } from "@/lib/datetime/formatDateTime";
import {
  evaluateReminderEligibility,
  manualEmailSentTodayForInvoice,
  type ReminderEligibilityInput,
} from "../eligibility";
import {
  buildEligibleReminderCandidates,
  type InvoiceCandidateRow,
  type ReminderHistoryCandidateRow,
  type ReminderRuleCandidateRow,
} from "../getEligibleReminders";

const WORKSPACE_ID = "ws-catchup";

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

const RULE_BEFORE_3 = rule({
  id: "rule-before-3",
  trigger_type: "before_due",
  offset_days: 3,
  sort_order: 1,
});
const RULE_ON_DUE = rule({
  id: "rule-on-due",
  trigger_type: "on_due",
  offset_days: 0,
  sort_order: 2,
});
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

function invoice(overrides: Partial<InvoiceCandidateRow> = {}): InvoiceCandidateRow {
  return {
    id: "inv-1",
    invoice_number: "INV-001",
    client_id: "client-1",
    client_name: "Acme",
    client_is_active: true,
    client_archived_at: null,
    due_date: "2026-07-27",
    outstanding: 1000,
    paid: 0,
    total: 1000,
    base_status: "sent",
    display_status: "overdue",
    currency: "USD",
    is_overdue: true,
    overdue_days: 13,
    ...overrides,
  };
}

function baseEligibilityInput(
  overrides: Partial<ReminderEligibilityInput> = {}
): ReminderEligibilityInput {
  return {
    evaluationDate: "2026-08-10",
    workspaceTimeZone: "UTC",
    rule: {
      id: "rule-after-14",
      isEnabled: true,
      triggerType: "after_due",
      offsetDays: 14,
      forStatus: "sent",
    },
    invoice: {
      dueDate: "2026-07-27",
      outstanding: 1000,
      paid: 0,
      baseStatus: "sent",
      archivedAt: null,
      clientArchivedAt: null,
      clientIsActive: true,
    },
    history: [],
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
    evaluationDate: params.evaluationDate ?? "2026-08-10",
    workspaceTimeZone: params.workspaceTimeZone ?? "UTC",
    invoices: params.invoices ?? [invoice()],
    rules: params.rules ?? [RULE_AFTER_14],
    historyRows: params.historyRows ?? [],
    clientEmailsByClientId: new Map([["client-1", "client@example.com"]]),
  });
}

describe("catch-up eligibility — single rule occurrence", () => {
  it("1 — exact scheduled day remains eligible", () => {
    const result = evaluateReminderEligibility(baseEligibilityInput());
    assert.equal(result.eligible, true);
    assert.equal(result.scheduledDate, "2026-08-10");
  });

  it("2 — missed +14 occurrence remains eligible N+1", () => {
    const result = evaluateReminderEligibility(
      baseEligibilityInput({ evaluationDate: "2026-08-11" })
    );
    assert.equal(result.eligible, true);
    assert.equal(result.scheduledDate, "2026-08-10");
  });

  it("3 — missed +14 remains eligible several days later", () => {
    const result = evaluateReminderEligibility(
      baseEligibilityInput({ evaluationDate: "2026-08-20" })
    );
    assert.equal(result.eligible, true);
  });

  it("4 — successful +14 sent on scheduled day blocks future catch-up", () => {
    const result = evaluateReminderEligibility(
      baseEligibilityInput({
        history: [{ ruleId: "rule-after-14", status: "sent", sentAt: "2026-08-10T12:00:00.000Z" }],
      })
    );
    assert.equal(result.reason, "already_sent_for_rule");
  });

  it("5 — successful +14 catch-up sent later blocks subsequent days", () => {
    const result = evaluateReminderEligibility(
      baseEligibilityInput({
        evaluationDate: "2026-08-13",
        history: [{ ruleId: "rule-after-14", status: "sent", sentAt: "2026-08-12T12:00:00.000Z" }],
      })
    );
    assert.equal(result.reason, "already_sent_for_rule");
  });

  it("6 — failed provider attempt does not block next-day catch-up", () => {
    const result = evaluateReminderEligibility(
      baseEligibilityInput({
        evaluationDate: "2026-08-11",
        history: [{ ruleId: "rule-after-14", status: "failed", sentAt: "2026-08-10T12:00:00.000Z" }],
      })
    );
    assert.equal(result.eligible, true);
  });

  it("future scheduled day is not yet eligible", () => {
    const result = evaluateReminderEligibility(
      baseEligibilityInput({ evaluationDate: "2026-08-09" })
    );
    assert.equal(result.reason, "trigger_not_due");
  });
});

describe("catch-up selection — one candidate per invoice", () => {
  const multiRules = [RULE_AFTER_3, RULE_AFTER_7, RULE_AFTER_14];

  it("8 — 40-day overdue with +3/+7/+14 unsent produces exactly one candidate", () => {
    const results = evaluateCandidates({
      evaluationDate: "2026-08-09",
      invoices: [invoice({ due_date: "2026-07-01" })],
      rules: multiRules,
    });
    assert.equal(results.length, 1);
  });

  it("9 — latest applicable occurrence is +14", () => {
    const results = evaluateCandidates({
      evaluationDate: "2026-08-09",
      invoices: [invoice({ due_date: "2026-07-01" })],
      rules: multiRules,
    });
    assert.equal(results[0]?.ruleId, "rule-after-14");
    assert.equal(results[0]?.scheduledDate, "2026-07-15");
  });

  it("10 — older +3/+7 do not replay after +14 is successfully satisfied", () => {
    const results = evaluateCandidates({
      evaluationDate: "2026-08-20",
      invoices: [invoice({ due_date: "2026-07-01" })],
      rules: multiRules,
      historyRows: [
        {
          invoice_id: "inv-1",
          rule_id: "rule-after-14",
          status: "sent",
          sent_at: "2026-08-12T10:00:00.000Z",
        },
      ],
    });
    assert.equal(results.length, 0);
  });

  it("11 — +3 sent but +7/+14 missed selects +14 only", () => {
    const results = evaluateCandidates({
      evaluationDate: "2026-08-09",
      invoices: [invoice({ due_date: "2026-07-01" })],
      rules: multiRules,
      historyRows: [
        {
          invoice_id: "inv-1",
          rule_id: "rule-after-3",
          status: "sent",
          sent_at: "2026-07-04T10:00:00.000Z",
        },
      ],
    });
    assert.equal(results.length, 1);
    assert.equal(results[0]?.ruleId, "rule-after-14");
  });

  it("12 — before-due rule does not catch up after invoice is deeply overdue", () => {
    const results = evaluateCandidates({
      evaluationDate: "2026-08-09",
      invoices: [invoice({ due_date: "2026-07-01" })],
      rules: [RULE_BEFORE_3, RULE_AFTER_14],
    });
    assert.equal(results.length, 1);
    assert.equal(results[0]?.ruleId, "rule-after-14");
  });

  it("22 — Ready to Send has max one candidate per invoice", () => {
    const results = evaluateCandidates({
      evaluationDate: "2026-08-09",
      invoices: [
        invoice({ id: "inv-a", due_date: "2026-07-01" }),
        invoice({ id: "inv-b", client_id: "client-2", due_date: "2026-07-05" }),
      ],
      rules: multiRules,
    });
    const byInvoice = new Set(results.map((row) => row.invoiceId));
    assert.equal(byInvoice.size, results.length);
    assert.equal(results.length, 2);
  });
});

describe("catch-up exclusions", () => {
  it("13 — paid invoice produces zero candidates", () => {
    const results = evaluateCandidates({
      invoices: [invoice({ outstanding: 0, paid: 1000 })],
    });
    assert.equal(results.length, 0);
  });

  it("14 — zero outstanding produces zero", () => {
    const results = evaluateCandidates({
      invoices: [invoice({ outstanding: 0 })],
    });
    assert.equal(results.length, 0);
  });

  it("15 — archived invoice produces zero", () => {
    const results = evaluateCandidates({
      invoices: [invoice({ archived_at: "2026-07-01T00:00:00.000Z" })],
    });
    assert.equal(results.length, 0);
  });

  it("16 — inactive client produces zero", () => {
    const results = evaluateCandidates({
      invoices: [invoice({ client_is_active: false })],
    });
    assert.equal(results.length, 0);
  });

  it("17 — partial payment with outstanding balance remains eligible", () => {
    const results = evaluateCandidates({
      evaluationDate: "2026-08-10",
      invoices: [invoice({ paid: 400, outstanding: 600 })],
    });
    assert.equal(results.length, 1);
  });
});

describe("catch-up timezone and manual suppression", () => {
  it("18 — workspace timezone boundary is correct", () => {
    const instant = new Date("2026-08-09T16:00:00.000Z");
    const singaporeDate = instantToWorkspaceCalendarDate(instant, "Asia/Singapore");
    assert.equal(singaporeDate, "2026-08-10");

    const results = evaluateCandidates({
      evaluationDate: singaporeDate!,
      workspaceTimeZone: "Asia/Singapore",
      invoices: [invoice({ due_date: "2026-07-27" })],
      rules: [RULE_AFTER_14],
    });
    assert.equal(results.length, 1);
  });

  it("19 — manual successful email today suppresses automated candidate today", () => {
    const results = evaluateCandidates({
      evaluationDate: "2026-08-10",
      historyRows: [
        {
          invoice_id: "inv-1",
          rule_id: null,
          status: "sent",
          sent_at: "2026-08-10T09:00:00.000Z",
        },
      ],
    });
    assert.equal(results.length, 0);
  });

  it("20 — manual email yesterday does not permanently satisfy today's rule occurrence", () => {
    const results = evaluateCandidates({
      evaluationDate: "2026-08-11",
      historyRows: [
        {
          invoice_id: "inv-1",
          rule_id: null,
          status: "sent",
          sent_at: "2026-08-10T09:00:00.000Z",
        },
      ],
    });
    assert.equal(results.length, 1);
    assert.equal(results[0]?.ruleId, "rule-after-14");
  });

  it("21 — WhatsApp has no effect on email reminder eligibility", () => {
    assert.equal(
      manualEmailSentTodayForInvoice(
        [{ ruleId: "wa-fake", status: "sent", sentAt: "2026-08-10T09:00:00.000Z" }],
        "2026-08-10",
        "UTC"
      ),
      false
    );

    const results = evaluateCandidates({
      evaluationDate: "2026-08-10",
      historyRows: [],
    });
    assert.equal(results.length, 1);
  });
});

describe("catch-up on_due stale suppression", () => {
  it("on_due is suppressed when later after_due catch-up exists", () => {
    const results = evaluateCandidates({
      evaluationDate: "2026-08-05",
      invoices: [invoice({ due_date: "2026-07-27" })],
      rules: [RULE_ON_DUE, RULE_AFTER_7],
    });
    assert.equal(results.length, 1);
    assert.equal(results[0]?.ruleId, "rule-after-7");
  });
});

describe("catch-up automation recovery contract", () => {
  it("7 — automation-disabled day can recover after re-enable on later date", () => {
    const dayAfterScheduled = evaluateCandidates({
      evaluationDate: "2026-08-11",
      rules: [RULE_AFTER_14],
    });
    assert.equal(dayAfterScheduled.length, 1);
    assert.equal(dayAfterScheduled[0]?.scheduledDate, "2026-08-10");
  });
});

describe("catch-up cross-surface contracts", () => {
  it("23 — catch-up candidate set implies at most one Daily Action reminder_due row per invoice", () => {
    const results = evaluateCandidates({
      evaluationDate: "2026-08-09",
      invoices: [
        invoice({ id: "inv-a", due_date: "2026-07-01" }),
        invoice({ id: "inv-b", client_id: "client-2", due_date: "2026-07-05" }),
      ],
      rules: [RULE_AFTER_3, RULE_AFTER_7, RULE_AFTER_14],
    });
    const reminderEligible = new Set(results.map((row) => row.invoiceId));
    assert.equal(reminderEligible.size, results.length);
  });

  it("24 — cron runner consumes canonical getEligibleReminders candidates", () => {
    const src = readFileSync("lib/reminders/run-reminders.ts", "utf8");
    assert.match(src, /getEligibleReminders/);
    assert.match(src, /executeEligibleReminderCandidates/);
    assert.doesNotMatch(src, /catchUp|catch-up/i);
  });
});
