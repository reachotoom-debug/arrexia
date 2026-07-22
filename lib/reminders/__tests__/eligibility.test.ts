import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { instantToWorkspaceCalendarDate } from "@/lib/datetime/formatDateTime";
import {
  evaluateReminderEligibility,
  isFinanciallyPartiallyPaid,
  type ReminderEligibilityInput,
} from "../eligibility";

function baseInput(
  overrides: Partial<ReminderEligibilityInput> = {}
): ReminderEligibilityInput {
  return {
    evaluationDate: "2026-07-22",
    workspaceTimeZone: "UTC",
    rule: {
      id: "rule-1",
      isEnabled: true,
      triggerType: "on_due",
      offsetDays: 0,
      forStatus: "any",
    },
    invoice: {
      dueDate: "2026-07-22",
      outstanding: 100,
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

describe("evaluateReminderEligibility — rule enabled", () => {
  it("disabled rule → ineligible (rule_disabled)", () => {
    const result = evaluateReminderEligibility(
      baseInput({ rule: { ...baseInput().rule, isEnabled: false } })
    );
    assert.equal(result.eligible, false);
    assert.equal(result.reason, "rule_disabled");
  });
});

describe("evaluateReminderEligibility — balance", () => {
  it("outstanding = 0 → ineligible", () => {
    const result = evaluateReminderEligibility(
      baseInput({ invoice: { ...baseInput().invoice, outstanding: 0 } })
    );
    assert.equal(result.reason, "no_outstanding_balance");
  });

  it("outstanding < 0 → ineligible", () => {
    const result = evaluateReminderEligibility(
      baseInput({ invoice: { ...baseInput().invoice, outstanding: -5 } })
    );
    assert.equal(result.reason, "no_outstanding_balance");
  });

  it("outstanding > 0 → continues toward eligibility when other checks pass", () => {
    const result = evaluateReminderEligibility(baseInput());
    assert.equal(result.eligible, true);
    assert.equal(result.reason, "eligible");
  });
});

describe("evaluateReminderEligibility — partial pay", () => {
  it("paid > 0 and outstanding > 0 qualifies as partially_paid", () => {
    assert.equal(isFinanciallyPartiallyPaid(50, 50), true);
  });

  it("overdue partially-paid invoice matches for_status = partially_paid", () => {
    const result = evaluateReminderEligibility(
      baseInput({
        evaluationDate: "2026-07-29",
        rule: {
          ...baseInput().rule,
          triggerType: "after_due",
          offsetDays: 7,
          forStatus: "partially_paid",
        },
        invoice: {
          ...baseInput().invoice,
          dueDate: "2026-07-22",
          paid: 40,
          outstanding: 60,
          baseStatus: "sent",
        },
      })
    );
    assert.equal(result.eligible, true);
    assert.equal(result.reason, "eligible");
  });
});

describe("evaluateReminderEligibility — archive", () => {
  it("archived invoice → ineligible", () => {
    const result = evaluateReminderEligibility(
      baseInput({
        invoice: {
          ...baseInput().invoice,
          archivedAt: "2026-07-01T00:00:00.000Z",
        },
      })
    );
    assert.equal(result.reason, "invoice_archived");
  });

  it("archived client → ineligible", () => {
    const result = evaluateReminderEligibility(
      baseInput({
        invoice: {
          ...baseInput().invoice,
          clientArchivedAt: "2026-07-01T00:00:00.000Z",
        },
      })
    );
    assert.equal(result.reason, "client_archived");
  });
});

describe("evaluateReminderEligibility — inactive client", () => {
  it("inactive but non-archived client is NOT rejected solely for inactivity", () => {
    const result = evaluateReminderEligibility(
      baseInput({
        invoice: {
          ...baseInput().invoice,
          clientIsActive: false,
          clientArchivedAt: null,
        },
      })
    );
    assert.equal(result.eligible, true);
    assert.equal(result.reason, "eligible");
  });
});

describe("evaluateReminderEligibility — non-collectible status", () => {
  it("draft → ineligible", () => {
    const result = evaluateReminderEligibility(
      baseInput({ invoice: { ...baseInput().invoice, baseStatus: "draft" } })
    );
    assert.equal(result.reason, "invoice_not_collectible");
  });

  it("void → ineligible", () => {
    const result = evaluateReminderEligibility(
      baseInput({ invoice: { ...baseInput().invoice, baseStatus: "void" } })
    );
    assert.equal(result.reason, "invoice_not_collectible");
  });
});

describe("evaluateReminderEligibility — for_status", () => {
  it("null → unrestricted", () => {
    const result = evaluateReminderEligibility(
      baseInput({ rule: { ...baseInput().rule, forStatus: null } })
    );
    assert.equal(result.eligible, true);
  });

  it("empty → unrestricted", () => {
    const result = evaluateReminderEligibility(
      baseInput({ rule: { ...baseInput().rule, forStatus: "" } })
    );
    assert.equal(result.eligible, true);
  });

  it("any → unrestricted", () => {
    const result = evaluateReminderEligibility(
      baseInput({ rule: { ...baseInput().rule, forStatus: "any" } })
    );
    assert.equal(result.eligible, true);
  });

  it("sent matches sent invoice", () => {
    const result = evaluateReminderEligibility(
      baseInput({ rule: { ...baseInput().rule, forStatus: "sent" } })
    );
    assert.equal(result.eligible, true);
  });

  it("sent rejects non-matching invoice (status_not_allowed)", () => {
    const result = evaluateReminderEligibility(
      baseInput({
        rule: { ...baseInput().rule, forStatus: "sent" },
        invoice: { ...baseInput().invoice, baseStatus: null },
      })
    );
    assert.equal(result.reason, "status_not_allowed");
  });

  it("sent rejects void before for_status (invoice_not_collectible)", () => {
    const result = evaluateReminderEligibility(
      baseInput({
        rule: { ...baseInput().rule, forStatus: "sent" },
        invoice: { ...baseInput().invoice, baseStatus: "void" },
      })
    );
    assert.equal(result.reason, "invoice_not_collectible");
  });

  it("overdue uses due-date/outstanding truth", () => {
    const overdueEligible = evaluateReminderEligibility(
      baseInput({
        evaluationDate: "2026-07-29",
        rule: {
          ...baseInput().rule,
          triggerType: "after_due",
          offsetDays: 7,
          forStatus: "overdue",
        },
        invoice: {
          ...baseInput().invoice,
          dueDate: "2026-07-22",
        },
      })
    );
    assert.equal(overdueEligible.eligible, true);

    const notOverdue = evaluateReminderEligibility(
      baseInput({
        evaluationDate: "2026-07-20",
        rule: { ...baseInput().rule, forStatus: "overdue" },
        invoice: { ...baseInput().invoice, dueDate: "2026-07-22" },
      })
    );
    assert.equal(notOverdue.reason, "status_not_allowed");
  });

  it("unknown for_status → ineligible (unsupported_for_status)", () => {
    const result = evaluateReminderEligibility(
      baseInput({ rule: { ...baseInput().rule, forStatus: "mystery_status" } })
    );
    assert.equal(result.eligible, false);
    assert.equal(result.reason, "unsupported_for_status");
  });
});

describe("evaluateReminderEligibility — triggers", () => {
  it("before_due 3 matches exactly three calendar days before due", () => {
    const result = evaluateReminderEligibility(
      baseInput({
        evaluationDate: "2026-07-19",
        rule: {
          ...baseInput().rule,
          triggerType: "before_due",
          offsetDays: 3,
        },
        invoice: { ...baseInput().invoice, dueDate: "2026-07-22" },
      })
    );
    assert.equal(result.eligible, true);
    assert.equal(result.scheduledDate, "2026-07-19");
  });

  it("before_due 3 rejects two days before due", () => {
    const result = evaluateReminderEligibility(
      baseInput({
        evaluationDate: "2026-07-20",
        rule: {
          ...baseInput().rule,
          triggerType: "before_due",
          offsetDays: 3,
        },
        invoice: { ...baseInput().invoice, dueDate: "2026-07-22" },
      })
    );
    assert.equal(result.reason, "trigger_not_due");
  });

  it("on_due matches due date only", () => {
    const onDue = evaluateReminderEligibility(
      baseInput({
        evaluationDate: "2026-07-22",
        invoice: { ...baseInput().invoice, dueDate: "2026-07-22" },
      })
    );
    assert.equal(onDue.eligible, true);

    const dayBefore = evaluateReminderEligibility(
      baseInput({
        evaluationDate: "2026-07-21",
        invoice: { ...baseInput().invoice, dueDate: "2026-07-22" },
      })
    );
    assert.equal(dayBefore.reason, "trigger_not_due");
  });

  it("after_due 7 matches exactly seven days after due", () => {
    const result = evaluateReminderEligibility(
      baseInput({
        evaluationDate: "2026-07-29",
        rule: {
          ...baseInput().rule,
          triggerType: "after_due",
          offsetDays: 7,
        },
        invoice: { ...baseInput().invoice, dueDate: "2026-07-22" },
      })
    );
    assert.equal(result.eligible, true);
    assert.equal(result.scheduledDate, "2026-07-29");
  });

  it("unsupported trigger type fails safely", () => {
    const result = evaluateReminderEligibility(
      baseInput({
        rule: { ...baseInput().rule, triggerType: "relative_to_due_date", offsetDays: 3 },
      })
    );
    assert.equal(result.reason, "unsupported_trigger_type");
  });
});

describe("evaluateReminderEligibility — due date", () => {
  it("missing due_date → ineligible", () => {
    const result = evaluateReminderEligibility(
      baseInput({ invoice: { ...baseInput().invoice, dueDate: null } })
    );
    assert.equal(result.reason, "missing_due_date");
  });
});

describe("evaluateReminderEligibility — history", () => {
  const historyBase = baseInput({
    evaluationDate: "2026-07-29",
    rule: {
      ...baseInput().rule,
      triggerType: "after_due",
      offsetDays: 7,
    },
    invoice: { ...baseInput().invoice, dueDate: "2026-07-22" },
  });

  it("same rule + successful sent occurrence → duplicate/ineligible", () => {
    const result = evaluateReminderEligibility({
      ...historyBase,
      history: [
        {
          ruleId: "rule-1",
          status: "sent",
          sentAt: "2026-07-29T10:00:00.000Z",
        },
      ],
    });
    assert.equal(result.reason, "already_sent_for_rule");
  });

  it("same rule + failed reminder → does not block", () => {
    const result = evaluateReminderEligibility({
      ...historyBase,
      history: [
        {
          ruleId: "rule-1",
          status: "failed",
          sentAt: "2026-07-29T10:00:00.000Z",
        },
      ],
    });
    assert.equal(result.eligible, true);
  });

  it("same rule + skipped reminder → does not block", () => {
    const result = evaluateReminderEligibility({
      ...historyBase,
      history: [
        {
          ruleId: "rule-1",
          status: "skipped",
          sentAt: "2026-07-29T10:00:00.000Z",
        },
      ],
    });
    assert.equal(result.eligible, true);
  });

  it("different rule → does not block", () => {
    const result = evaluateReminderEligibility({
      ...historyBase,
      history: [
        {
          ruleId: "other-rule",
          status: "sent",
          sentAt: "2026-07-29T10:00:00.000Z",
        },
      ],
    });
    assert.equal(result.eligible, true);
  });

  it("manual reminder with rule_id = null → does not block rule-specific eligibility", () => {
    const result = evaluateReminderEligibility({
      ...historyBase,
      history: [
        {
          ruleId: null,
          status: "sent",
          sentAt: "2026-07-29T10:00:00.000Z",
        },
      ],
    });
    assert.equal(result.eligible, true);
  });

  it("sent on a different calendar day does not block the scheduled occurrence", () => {
    const result = evaluateReminderEligibility({
      ...historyBase,
      history: [
        {
          ruleId: "rule-1",
          status: "sent",
          sentAt: "2026-07-28T10:00:00.000Z",
        },
      ],
    });
    assert.equal(result.eligible, true);
  });
});

describe("workspace-local timezone contract", () => {
  it("UTC instant maps to Singapore workspace date before eligibility evaluation", () => {
    const instant = new Date("2026-07-21T16:00:00.000Z");
    const utcDate = instantToWorkspaceCalendarDate(instant, "UTC");
    const singaporeDate = instantToWorkspaceCalendarDate(instant, "Asia/Singapore");

    assert.equal(utcDate, "2026-07-21");
    assert.equal(singaporeDate, "2026-07-22");

    const result = evaluateReminderEligibility(
      baseInput({
        evaluationDate: singaporeDate!,
        workspaceTimeZone: "Asia/Singapore",
        invoice: { ...baseInput().invoice, dueDate: "2026-07-22" },
      })
    );
    assert.equal(result.eligible, true);
    assert.equal(result.scheduledDate, "2026-07-22");
  });
});
