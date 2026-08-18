import "@/lib/test/nodeTestSetup";

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { verifyCronReminderAuth } from "../cronAuth";
import { getWorkspaceOrganizationId } from "@/lib/workspaces/getWorkspaceOrganizationId";
import {
  buildEligibleReminderCandidates,
  type InvoiceCandidateRow,
  type ReminderRuleCandidateRow,
} from "../getEligibleReminders";
import {
  executeEligibleReminderCandidates,
  type SendReminderForInvoiceFn,
} from "../executeReminderRun";
import { runDueRemindersForWorkspace } from "../run-reminders";
import { ruleOccurrenceAlreadySent } from "../ruleOccurrenceGuard";

const WORKSPACE_ID = "ws-cron-exec";
const CRON_SECRET = "test-cron-secret-fixed";
const TZ = "Asia/Amman";
process.env.RESEND_API_KEY = process.env.RESEND_API_KEY ?? "test-resend-key";

const entitledAutomationExecution = {
  assertAutomatedReminderExecutionEntitlementFn: async () => ({ ok: true as const }),
};

function headers(init: Record<string, string>) {
  return {
    get(name: string) {
      const key = Object.keys(init).find(
        (k) => k.toLowerCase() === name.toLowerCase()
      );
      return key ? init[key] : null;
    },
  };
}

function rule(
  overrides: Partial<ReminderRuleCandidateRow> & {
    id: string;
    trigger_type: string;
    offset_days: number;
  }
): ReminderRuleCandidateRow {
  return {
    name: overrides.id,
    for_status: "any",
    is_enabled: true,
    template_id: `${overrides.id}-tpl`,
    sort_order: 1,
    created_at: "2026-01-01T00:00:00.000Z",
    reminder_template: {
      id: `${overrides.id}-tpl`,
      workspace_id: WORKSPACE_ID,
      is_enabled: true,
    },
    ...overrides,
  };
}

function invoice(overrides: Partial<InvoiceCandidateRow> = {}): InvoiceCandidateRow {
  return {
    id: "inv-0008",
    invoice_number: "INV-0008",
    client_id: "client-1",
    client_name: "Acme",
    client_is_active: true,
    client_archived_at: null,
    due_date: "2026-07-26",
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

describe("cron reminder execution (P0)", () => {
  it("A — GET auth accepts Authorization Bearer CRON_SECRET", () => {
    process.env.CRON_SECRET = CRON_SECRET;
    const result = verifyCronReminderAuth(
      headers({ Authorization: `Bearer ${CRON_SECRET}` })
    );
    assert.equal(result.ok, true);
  });

  it("B — missing CRON_SECRET fails closed with 500", () => {
    delete process.env.CRON_SECRET;
    const result = verifyCronReminderAuth(
      headers({ Authorization: "Bearer anything" })
    );
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 500);
    }
    process.env.CRON_SECRET = CRON_SECRET;
  });

  it("C — wrong or missing Authorization returns 401", () => {
    process.env.CRON_SECRET = CRON_SECRET;
    const missing = verifyCronReminderAuth(headers({}));
    assert.equal(missing.ok, false);
    if (!missing.ok) assert.equal(missing.status, 401);

    const wrong = verifyCronReminderAuth(
      headers({ Authorization: "Bearer wrong-secret" })
    );
    assert.equal(wrong.ok, false);
    if (!wrong.ok) assert.equal(wrong.status, 401);
  });

  it("D — cron route exposes GET and does not depend on cookies", () => {
    const routeSrc = readFileSync(
      "app/api/internal/reminders/run/route.ts",
      "utf8"
    );
    assert.match(routeSrc, /export async function GET/);
    assert.match(routeSrc, /verifyCronReminderAuth/);
    assert.doesNotMatch(routeSrc, /cookies\(/);
    assert.doesNotMatch(routeSrc, /requireWorkspace/);
    assert.doesNotMatch(routeSrc, /requireUser/);

    const runnerSrc = readFileSync("lib/reminders/run-reminders.ts", "utf8");
    assert.match(runnerSrc, /supabaseAdmin\(\)/);
    assert.match(runnerSrc, /supabase,/);
  });

  it("E — cron eligibility receives service-role supabase from runner", async () => {
    let receivedSupabase: unknown;
    const serviceClient = createAutomationRunnerSupabase({
      autoSendReminders: true,
      hasEmailSettings: true,
    });

    await runDueRemindersForWorkspace(WORKSPACE_ID, {
      ...entitledAutomationExecution,
      supabase: serviceClient as never,
      getEligibleRemindersFn: async (_workspaceId, opts) => {
        receivedSupabase = opts?.supabase;
        return [];
      },
    });

    assert.equal(receivedSupabase, serviceClient);
  });

  it("F — cron send path injects service-role supabase into sendReminderForInvoice", () => {
    const runnerSrc = readFileSync("lib/reminders/run-reminders.ts", "utf8");
    assert.match(
      runnerSrc,
      /sendReminderForInvoice\(\{[\s\S]*supabase: supabase as SupabaseClient/
    );

    const sendSrc = readFileSync("lib/reminders/send.ts", "utf8");
    assert.match(sendSrc, /supabaseOverride \?\? \(await supabaseServer\(\)\)/);
  });

  it("G — automation OFF skips workspace before eligibility", async () => {
    let eligibleCalled = false;
    const result = await runDueRemindersForWorkspace(WORKSPACE_ID, {
      supabase: createAutomationRunnerSupabase({ autoSendReminders: false }) as never,
      getEligibleRemindersFn: async () => {
        eligibleCalled = true;
        return [];
      },
    });

    assert.equal(result.remindersSent, 0);
    assert.equal(result.automationSkipReason, "automation_disabled");
    assert.equal(eligibleCalled, false);
  });

  it("H — email readiness failure skips workspace", async () => {
    let eligibleCalled = false;
    const result = await runDueRemindersForWorkspace(WORKSPACE_ID, {
      supabase: createAutomationRunnerSupabase({
        autoSendReminders: true,
        hasEmailSettings: false,
      }) as never,
      getEligibleRemindersFn: async () => {
        eligibleCalled = true;
        throw new Error("must not run");
      },
    });

    assert.equal(result.remindersSent, 0);
    assert.equal(result.emailSkipReason, "email_settings_missing");
    assert.equal(eligibleCalled, false);
  });

  it("I — same rule occurrence cannot send twice (eligibility + guard)", () => {
    const withHistory = buildEligibleReminderCandidates({
      workspaceId: WORKSPACE_ID,
      evaluationDate: "2026-07-26",
      workspaceTimeZone: TZ,
      invoices: [invoice()],
      rules: [rule({ id: "on-due", trigger_type: "on_due", offset_days: 0 })],
      historyRows: [
        {
          invoice_id: "inv-0008",
          rule_id: "on-due",
          status: "sent",
          sent_at: "2026-07-26T09:00:00.000Z",
        },
      ],
      clientEmailsByClientId: new Map([["client-1", "client@example.com"]]),
    });
    assert.equal(withHistory.length, 0);

    assert.equal(
      ruleOccurrenceAlreadySent({
        history: [
          {
            ruleId: "on-due",
            status: "sent",
            sentAt: "2026-07-26T09:00:00.000Z",
          },
        ],
        ruleId: "on-due",
        scheduledDate: "2026-07-26",
        workspaceTimeZone: TZ,
        triggerType: "on_due",
        offsetDays: 0,
        dueDate: "2026-07-26",
      }),
      true
    );
  });

  it("J — manual reminder path does not pass service-role supabase", () => {
    for (const file of [
      "app/api/workspaces/[workspaceId]/reminders/send/route.ts",
      "app/[workspaceId]/reminders/actions.ts",
      "app/api/reminders/send/route.ts",
    ]) {
      const src = readFileSync(file, "utf8");
      assert.match(src, /sendReminderForInvoice\(/);
      assert.doesNotMatch(src, /supabase:/);
      assert.doesNotMatch(src, /supabaseAdmin/);
    }

    const sendSrc = readFileSync("lib/reminders/send.ts", "utf8");
    assert.match(sendSrc, /supabaseOverride \?\? \(await supabaseServer\(\)\)/);
  });

  it("K — INV-style on-due candidate is processed once per hourly run", async () => {
    const candidates = buildEligibleReminderCandidates({
      workspaceId: WORKSPACE_ID,
      evaluationDate: "2026-07-26",
      workspaceTimeZone: TZ,
      invoices: [invoice()],
      rules: [rule({ id: "on-due", trigger_type: "on_due", offset_days: 0 })],
      historyRows: [],
      clientEmailsByClientId: new Map([["client-1", "client@example.com"]]),
    });

    assert.equal(candidates.length, 1);
    assert.equal(candidates[0].invoiceNumber, "INV-0008");
    assert.equal(candidates[0].scheduledDate, "2026-07-26");

    let sendCount = 0;
    const sendFn: SendReminderForInvoiceFn = async () => {
      sendCount++;
      return { success: true, status: "sent" };
    };

    const first = await executeEligibleReminderCandidates(
      WORKSPACE_ID,
      candidates,
      sendFn
    );
    assert.equal(first.remindersSent, 1);
    assert.equal(sendCount, 1);

    const blocked = buildEligibleReminderCandidates({
      workspaceId: WORKSPACE_ID,
      evaluationDate: "2026-07-26",
      workspaceTimeZone: TZ,
      invoices: [invoice()],
      rules: [rule({ id: "on-due", trigger_type: "on_due", offset_days: 0 })],
      historyRows: [
        {
          invoice_id: "inv-0008",
          rule_id: "on-due",
          status: "sent",
          sent_at: "2026-07-26T10:00:00.000Z",
        },
      ],
      clientEmailsByClientId: new Map([["client-1", "client@example.com"]]),
    });
    assert.equal(blocked.length, 0);
  });

  it("L — vercel.json defines daily cron on internal route", () => {
    const vercel = JSON.parse(readFileSync("vercel.json", "utf8")) as {
      crons: Array<{ path: string; schedule: string }>;
    };
    const reminderCron = vercel.crons.find(
      (cron) => cron.path === "/api/internal/reminders/run"
    );
    assert.ok(reminderCron);
    assert.equal(reminderCron.schedule, "0 6 * * *");
    assert.equal(
      vercel.crons.some((cron) => cron.path === "/api/internal/billing/lifecycle/run"),
      true
    );
  });

  it("M — cron/service-role send resolves workspace organization_id via passed client", async () => {
    const orgId = "org-cron-0008";
    const workspaceId = "ws-inv-0008";
    const supabase = {
      from(table: string) {
        assert.equal(table, "workspaces");
        return {
          select: () => ({
            eq: (_col: string, id: string) => ({
              single: async () => {
                assert.equal(id, workspaceId);
                return { data: { organization_id: orgId }, error: null };
              },
            }),
          }),
        };
      },
    };

    const resolved = await getWorkspaceOrganizationId(
      workspaceId,
      supabase as never
    );
    assert.equal(resolved, orgId);
  });

  it("N — send passes service-role supabase into organization_id lookup", () => {
    const sendSrc = readFileSync("lib/reminders/send.ts", "utf8");
    assert.match(
      sendSrc,
      /getWorkspaceOrganizationId\(\s*workspaceId,\s*supabase\s*\)/
    );
    assert.match(sendSrc, /organization_id: resolvedOrganizationId/);
    assert.match(sendSrc, /workspace_id: workspaceId/);
  });

  it("O — missing organization_id fails safely", async () => {
    const supabase = {
      from() {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({ data: { organization_id: null }, error: null }),
            }),
          }),
        };
      },
    };

    await assert.rejects(
      () => getWorkspaceOrganizationId("ws-missing-org", supabase as never),
      /Workspace organization_id not found for workspace ws-missing-org/
    );
  });

  it("P — manual send path keeps default organization_id lookup without injected client", () => {
    const helperSrc = readFileSync(
      "lib/workspaces/getWorkspaceOrganizationId.ts",
      "utf8"
    );
    assert.match(helperSrc, /supabaseClient \?\? \(await supabaseServer\(\)\)/);

    for (const file of [
      "app/api/workspaces/[workspaceId]/reminders/send/route.ts",
      "app/[workspaceId]/reminders/actions.ts",
    ]) {
      const src = readFileSync(file, "utf8");
      assert.doesNotMatch(src, /getWorkspaceOrganizationId/);
    }
  });

  it("Q — duplicate guard remains intact on cron send path", () => {
    const sendSrc = readFileSync("lib/reminders/send.ts", "utf8");
    assert.match(sendSrc, /checkRuleOccurrenceDuplicateBeforeSend/);
    assert.match(sendSrc, /already_sent_for_rule/);
  });
});

function createAutomationRunnerSupabase(params: {
  autoSendReminders: boolean;
  hasEmailSettings?: boolean;
  emailProvider?: string;
}) {
  return {
    from(table: string) {
      if (table === "settings") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { auto_send_reminders: params.autoSendReminders, email_provider: params.emailProvider ?? "resend" },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "workspace_email_settings") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: params.hasEmailSettings
                  ? { smtp_host: "smtp.example.com", smtp_port: 587 }
                  : null,
                error: null,
              }),
            }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
}
