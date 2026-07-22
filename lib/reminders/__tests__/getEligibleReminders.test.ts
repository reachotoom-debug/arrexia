import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { instantToWorkspaceCalendarDate } from "@/lib/datetime/formatDateTime";
import {
  buildEligibleReminderCandidates,
  mapSupabaseReminderRulesToCandidates,
  type InvoiceCandidateRow,
  type ReminderHistoryCandidateRow,
  type ReminderRuleCandidateRow,
  type SupabaseReminderRuleRow,
} from "../getEligibleReminders";

const WORKSPACE_ID = "ws-1";

function usableTemplate(
  id = "tpl-on-due"
): { id: string; workspace_id: string; is_enabled: boolean } {
  return { id, workspace_id: WORKSPACE_ID, is_enabled: true };
}

const RULE_ON_DUE: ReminderRuleCandidateRow = {
  id: "rule-on-due",
  name: "On due date",
  trigger_type: "on_due",
  offset_days: 0,
  for_status: "any",
  is_enabled: true,
  template_id: "tpl-on-due",
  sort_order: 1,
  created_at: "2026-01-01T00:00:00.000Z",
  reminder_template: usableTemplate(),
};

const RULE_AFTER_7: ReminderRuleCandidateRow = {
  id: "rule-after-7",
  name: "7 days after due",
  trigger_type: "after_due",
  offset_days: 7,
  for_status: "any",
  is_enabled: true,
  template_id: "tpl-after-7",
  sort_order: 2,
  created_at: "2026-01-02T00:00:00.000Z",
  reminder_template: usableTemplate("tpl-after-7"),
};

function baseInvoice(
  overrides: Partial<InvoiceCandidateRow> = {}
): InvoiceCandidateRow {
  return {
    id: "inv-1",
    invoice_number: "INV-001",
    client_id: "client-1",
    client_name: "Acme Corp",
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
  workspaceTimeZone?: string;
  invoices?: InvoiceCandidateRow[];
  rules?: ReminderRuleCandidateRow[];
  historyRows?: ReminderHistoryCandidateRow[];
}) {
  return buildEligibleReminderCandidates({
    workspaceId: WORKSPACE_ID,
    evaluationDate: params.evaluationDate ?? "2026-07-22",
    workspaceTimeZone: params.workspaceTimeZone ?? "UTC",
    invoices: params.invoices ?? [baseInvoice()],
    rules: params.rules ?? [RULE_ON_DUE],
    historyRows: params.historyRows ?? [],
    clientEmailsByClientId: new Map([["client-1", "billing@acme.test"]]),
  });
}

describe("buildEligibleReminderCandidates", () => {
  it("returns eligible rule occurrence", () => {
    const results = evaluate({});
    assert.equal(results.length, 1);
    assert.equal(results[0].invoiceId, "inv-1");
    assert.equal(results[0].ruleId, "rule-on-due");
    assert.equal(results[0].eligibilityReason, "eligible");
    assert.equal(results[0].scheduledDate, "2026-07-22");
  });

  it("excludes trigger not due", () => {
    const results = evaluate({
      evaluationDate: "2026-07-21",
      rules: [RULE_AFTER_7],
      invoices: [baseInvoice({ due_date: "2026-07-22" })],
    });
    assert.equal(results.length, 0);
  });

  it("excludes successful same-rule occurrence on scheduled date", () => {
    const results = evaluate({
      historyRows: [
        {
          invoice_id: "inv-1",
          rule_id: "rule-on-due",
          status: "sent",
          sent_at: "2026-07-22T10:00:00.000Z",
        },
      ],
    });
    assert.equal(results.length, 0);
  });

  it("does not exclude failed reminder for same rule occurrence", () => {
    const results = evaluate({
      historyRows: [
        {
          invoice_id: "inv-1",
          rule_id: "rule-on-due",
          status: "failed",
          sent_at: "2026-07-22T10:00:00.000Z",
        },
      ],
    });
    assert.equal(results.length, 1);
    assert.equal(results[0].ruleId, "rule-on-due");
  });

  it("excludes archived client", () => {
    const results = evaluate({
      invoices: [
        baseInvoice({
          client_archived_at: "2026-07-01T00:00:00.000Z",
        }),
      ],
    });
    assert.equal(results.length, 0);
  });

  it("keeps inactive non-archived client eligible", () => {
    const results = evaluate({
      invoices: [baseInvoice({ client_is_active: false })],
    });
    assert.equal(results.length, 1);
  });

  it("matches partially paid overdue invoice for partially_paid rule", () => {
    const results = evaluate({
      evaluationDate: "2026-07-29",
      rules: [
        {
          ...RULE_AFTER_7,
          for_status: "partially_paid",
        },
      ],
      invoices: [
        baseInvoice({
          due_date: "2026-07-22",
          paid: 40,
          outstanding: 60,
          base_status: "sent",
          display_status: "overdue",
          is_overdue: true,
          overdue_days: 7,
        }),
      ],
    });
    assert.equal(results.length, 1);
    assert.equal(results[0].ruleId, "rule-after-7");
  });

  it("excludes for_status mismatch", () => {
    const results = evaluate({
      rules: [{ ...RULE_ON_DUE, for_status: "overdue" }],
      invoices: [
        baseInvoice({
          due_date: "2026-07-25",
          is_overdue: false,
          display_status: "sent",
        }),
      ],
    });
    assert.equal(results.length, 0);
  });

  it("excludes unknown for_status (fail closed)", () => {
    const results = evaluate({
      rules: [{ ...RULE_ON_DUE, for_status: "legacy_status" }],
    });
    assert.equal(results.length, 0);
  });

  it("uses workspace-local evaluation date for duplicate checks", () => {
    const tz = "America/Los_Angeles";
    const evaluationDate = instantToWorkspaceCalendarDate(
      new Date("2026-07-22T07:00:00.000Z"),
      tz
    );
    assert.equal(evaluationDate, "2026-07-22");

    const results = buildEligibleReminderCandidates({
      workspaceId: WORKSPACE_ID,
      evaluationDate,
      workspaceTimeZone: tz,
      invoices: [baseInvoice()],
      rules: [RULE_ON_DUE],
      historyRows: [
        {
          invoice_id: "inv-1",
          rule_id: "rule-on-due",
          status: "sent",
          // 2026-07-22 06:59 UTC is still 2026-07-21 in Los Angeles
          sent_at: "2026-07-22T06:59:00.000Z",
        },
      ],
      clientEmailsByClientId: new Map([["client-1", "billing@acme.test"]]),
    });
    assert.equal(results.length, 1);
  });

  it("returns one row per eligible rule occurrence (deterministic order)", () => {
    const results = evaluate({
      evaluationDate: "2026-07-22",
      rules: [
        { ...RULE_AFTER_7, sort_order: 2 },
        { ...RULE_ON_DUE, sort_order: 1 },
      ],
      invoices: [baseInvoice({ due_date: "2026-07-22" })],
    });
    assert.equal(results.length, 1);
    assert.equal(results[0].ruleId, "rule-on-due");

    const bothDue = evaluate({
      evaluationDate: "2026-07-29",
      rules: [
        { ...RULE_AFTER_7, id: "rule-a", sort_order: 1 },
        {
          ...RULE_AFTER_7,
          id: "rule-b",
          name: "7 days after due (secondary)",
          sort_order: 2,
          template_id: "tpl-after-7-b",
          reminder_template: usableTemplate("tpl-after-7-b"),
        },
      ],
      invoices: [
        baseInvoice({
          due_date: "2026-07-22",
          display_status: "overdue",
          is_overdue: true,
          overdue_days: 7,
        }),
      ],
    });
    assert.equal(bothDue.length, 2);
    assert.equal(bothDue[0].ruleId, "rule-a");
    assert.equal(bothDue[1].ruleId, "rule-b");
    assert.notEqual(bothDue[0].id, bothDue[1].id);
  });

  it("excludes disabled reminder_template", () => {
    const results = evaluate({
      rules: [
        {
          ...RULE_ON_DUE,
          reminder_template: {
            id: "tpl-on-due",
            workspace_id: WORKSPACE_ID,
            is_enabled: false,
          },
        },
      ],
    });
    assert.equal(results.length, 0);
  });

  it("excludes missing reminder_template join", () => {
    const results = evaluate({
      rules: [{ ...RULE_ON_DUE, reminder_template: null }],
    });
    assert.equal(results.length, 0);
  });

  it("excludes cross-workspace reminder_template", () => {
    const results = evaluate({
      rules: [
        {
          ...RULE_ON_DUE,
          reminder_template: {
            id: "tpl-on-due",
            workspace_id: "other-workspace",
            is_enabled: true,
          },
        },
      ],
    });
    assert.equal(results.length, 0);
  });
});

describe("getEligibleReminders tenant scoping contract", () => {
  it("caller-supplied history must be workspace-scoped (unscoped rows would false-block)", () => {
    const withoutForeignHistory = evaluate({ historyRows: [] });
    assert.equal(withoutForeignHistory.length, 1);

    // Simulates history loaded without workspace_id filter: same invoice/rule/date
    // from another tenant would incorrectly suppress eligibility.
    const withForeignHistory = evaluate({
      historyRows: [
        {
          invoice_id: "inv-1",
          rule_id: "rule-on-due",
          status: "sent",
          sent_at: "2026-07-22T10:00:00.000Z",
        },
      ],
    });
    assert.equal(withForeignHistory.length, 0);
  });
});

describe("getEligibleReminders suggested send metadata", () => {
  it("exposes ruleId and templateId for manual suggested send", () => {
    const results = evaluate({});
    assert.equal(results[0].ruleId, "rule-on-due");
    assert.equal(results[0].templateId, "tpl-on-due");
    assert.match(results[0].id, /^inv-1:rule-on-due$/);
  });
});

describe("mapSupabaseReminderRulesToCandidates (R2B.3)", () => {
  function supabaseRule(
    overrides: Partial<SupabaseReminderRuleRow> &
      Pick<
        SupabaseReminderRuleRow,
        "id" | "trigger_type" | "offset_days" | "template_id"
      >
  ): SupabaseReminderRuleRow {
    const templateId = overrides.template_id;
    return {
      name: overrides.name ?? "Rule",
      for_status: overrides.for_status ?? "sent",
      is_enabled: overrides.is_enabled ?? true,
      sort_order: overrides.sort_order ?? 1,
      created_at: overrides.created_at ?? "2026-01-01T00:00:00.000Z",
      reminder_templates:
        overrides.reminder_templates !== undefined
          ? overrides.reminder_templates
          : {
              id: templateId!,
              workspace_id: WORKSPACE_ID,
              is_enabled: true,
            },
      ...overrides,
    };
  }

  function evaluateSupabaseRules(params: {
    evaluationDate?: string;
    invoices?: InvoiceCandidateRow[];
    supabaseRules: SupabaseReminderRuleRow[];
    historyRows?: ReminderHistoryCandidateRow[];
  }) {
    return buildEligibleReminderCandidates({
      workspaceId: WORKSPACE_ID,
      evaluationDate: params.evaluationDate ?? "2026-07-22",
      workspaceTimeZone: "UTC",
      invoices: params.invoices ?? [baseInvoice()],
      rules: mapSupabaseReminderRulesToCandidates(params.supabaseRules),
      historyRows: params.historyRows ?? [],
      clientEmailsByClientId: new Map([["client-1", "billing@acme.test"]]),
    });
  }

  it("maps reminder_templates object join and produces eligible candidate", () => {
    const results = evaluateSupabaseRules({
      evaluationDate: "2026-07-22",
      supabaseRules: [
        supabaseRule({
          id: "rule-on-due",
          name: "On due date",
          trigger_type: "on_due",
          offset_days: 0,
          template_id: "tpl-on-due",
          reminder_templates: {
            id: "tpl-on-due",
            workspace_id: WORKSPACE_ID,
            is_enabled: true,
          },
        }),
      ],
      invoices: [baseInvoice({ due_date: "2026-07-22" })],
    });
    assert.equal(results.length, 1);
    assert.equal(results[0].ruleId, "rule-on-due");
    assert.equal(results[0].eligibilityReason, "eligible");
  });

  it("maps reminder_templates array join and produces eligible candidate", () => {
    const results = evaluateSupabaseRules({
      evaluationDate: "2026-07-22",
      supabaseRules: [
        supabaseRule({
          id: "rule-on-due",
          name: "On due date",
          trigger_type: "on_due",
          offset_days: 0,
          template_id: "tpl-on-due",
          reminder_templates: [
            {
              id: "tpl-on-due",
              workspace_id: WORKSPACE_ID,
              is_enabled: true,
            },
          ],
        }),
      ],
      invoices: [baseInvoice({ due_date: "2026-07-22" })],
    });
    assert.equal(results.length, 1);
    assert.equal(results[0].ruleId, "rule-on-due");
  });

  it("excludes rule when reminder_templates join is null/missing", () => {
    const results = evaluateSupabaseRules({
      supabaseRules: [
        supabaseRule({
          id: "rule-on-due",
          trigger_type: "on_due",
          offset_days: 0,
          template_id: "tpl-on-due",
          reminder_templates: null,
        }),
      ],
    });
    assert.equal(results.length, 0);
  });

  it("excludes rule when reminder_templates is_enabled=false", () => {
    const results = evaluateSupabaseRules({
      supabaseRules: [
        supabaseRule({
          id: "rule-on-due",
          trigger_type: "on_due",
          offset_days: 0,
          template_id: "tpl-on-due",
          reminder_templates: {
            id: "tpl-on-due",
            workspace_id: WORKSPACE_ID,
            is_enabled: false,
          },
        }),
      ],
    });
    assert.equal(results.length, 0);
  });

  it("excludes rule when reminder_templates belongs to another workspace", () => {
    const results = evaluateSupabaseRules({
      supabaseRules: [
        supabaseRule({
          id: "rule-on-due",
          trigger_type: "on_due",
          offset_days: 0,
          template_id: "tpl-on-due",
          reminder_templates: {
            id: "tpl-on-due",
            workspace_id: "other-workspace",
            is_enabled: true,
          },
        }),
      ],
    });
    assert.equal(results.length, 0);
  });

  it("returns exactly five eligible candidates for July 23 production regression", () => {
    const supabaseRules: SupabaseReminderRuleRow[] = [
      supabaseRule({
        id: "rule-before-3",
        name: "Before Due Date 3 Days",
        trigger_type: "before_due",
        offset_days: 3,
        template_id: "tpl-before-3",
        sort_order: 1,
      }),
      supabaseRule({
        id: "rule-on-due",
        name: "On due date",
        trigger_type: "on_due",
        offset_days: 0,
        template_id: "tpl-on-due",
        sort_order: 2,
      }),
      supabaseRule({
        id: "rule-after-3",
        name: "After due 3",
        trigger_type: "after_due",
        offset_days: 3,
        template_id: "tpl-after-3",
        sort_order: 3,
      }),
      supabaseRule({
        id: "rule-after-7",
        name: "After due 7",
        trigger_type: "after_due",
        offset_days: 7,
        template_id: "tpl-after-7",
        sort_order: 4,
      }),
      supabaseRule({
        id: "rule-after-14",
        name: "After due 14",
        trigger_type: "after_due",
        offset_days: 14,
        template_id: "tpl-after-14",
        sort_order: 5,
      }),
    ];

    for (const rule of supabaseRules) {
      const template = rule.reminder_templates;
      assert.ok(template);
      if (Array.isArray(template)) {
        assert.equal(template[0]?.id, rule.template_id);
      } else {
        assert.equal(template.id, rule.template_id);
      }
    }

    const invoices: InvoiceCandidateRow[] = [
      baseInvoice({
        id: "inv-0069",
        invoice_number: "INV-0069",
        due_date: "2026-07-26",
        outstanding: 3000,
        total: 3000,
        display_status: "sent",
        is_overdue: false,
      }),
      baseInvoice({
        id: "inv-0070",
        invoice_number: "INV-0070",
        due_date: "2026-07-23",
        outstanding: 6156,
        total: 6156,
        display_status: "sent",
        is_overdue: false,
      }),
      baseInvoice({
        id: "inv-0071",
        invoice_number: "INV-0071",
        due_date: "2026-07-20",
        outstanding: 5000,
        total: 5000,
        display_status: "overdue",
        is_overdue: true,
      }),
      baseInvoice({
        id: "inv-0072",
        invoice_number: "INV-0072",
        due_date: "2026-07-16",
        outstanding: 2000,
        total: 2000,
        display_status: "overdue",
        is_overdue: true,
      }),
      baseInvoice({
        id: "inv-0073",
        invoice_number: "INV-0073",
        due_date: "2026-07-09",
        outstanding: 5000,
        total: 5000,
        display_status: "overdue",
        is_overdue: true,
      }),
    ];

    const results = evaluateSupabaseRules({
      evaluationDate: "2026-07-23",
      supabaseRules,
      invoices,
    });

    assert.equal(results.length, 5);

    const byInvoice = new Map(results.map((r) => [r.invoiceNumber, r]));
    assert.equal(byInvoice.get("INV-0069")?.ruleId, "rule-before-3");
    assert.equal(byInvoice.get("INV-0069")?.scheduledDate, "2026-07-23");
    assert.equal(byInvoice.get("INV-0070")?.ruleId, "rule-on-due");
    assert.equal(byInvoice.get("INV-0070")?.scheduledDate, "2026-07-23");
    assert.equal(byInvoice.get("INV-0071")?.ruleId, "rule-after-3");
    assert.equal(byInvoice.get("INV-0071")?.scheduledDate, "2026-07-23");
    assert.equal(byInvoice.get("INV-0072")?.ruleId, "rule-after-7");
    assert.equal(byInvoice.get("INV-0072")?.scheduledDate, "2026-07-23");
    assert.equal(byInvoice.get("INV-0073")?.ruleId, "rule-after-14");
    assert.equal(byInvoice.get("INV-0073")?.scheduledDate, "2026-07-23");
  });
});
