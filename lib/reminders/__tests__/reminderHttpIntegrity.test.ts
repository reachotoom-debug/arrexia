import "@/lib/test/nodeTestSetup";
import assert from "node:assert/strict";
import Module, { createRequire } from "node:module";
import { test } from "node:test";
import type { NextRequest } from "next/server";
import type { ReminderRunResult } from "../run-reminders";
import type { SendReminderOptions } from "../send";

type Load = (request: string, parent?: NodeModule | null, isMain?: boolean) => unknown;
const runtime = Module as typeof Module & { _load: Load };
const originalLoad = runtime._load;
const workspaceId = "11111111-1111-1111-1111-111111111111";
const invoiceId = "22222222-2222-2222-2222-222222222222";
let denied: 401 | 403 | undefined;
let calls = 0;
let cronAllowed = true;
let workspaceResults: ReminderRunResult[] = [];
runtime._load = function(request, ...args) {
  if (request === "@/lib/auth/server") return { requireWorkspaceForApi: async (requested: string) => {
    assert.equal(requested, workspaceId);
    return denied ? { ok: false, status: denied, error: "Denied" }
      : { ok: true, user: { id: "verified-user" }, workspace: { id: "verified-workspace" } };
  } };
  if (request === "@/lib/reminders/send") return { sendReminderForInvoice: async (options: SendReminderOptions) => {
    calls++;
    assert.equal(options.workspaceId, "verified-workspace");
    assert.equal(options.userId, "verified-user");
    assert.equal(options.supabase, undefined, "manual API must retain member execution");
    return { success: true, status: "sent", historyPersisted: false, reminderId: "record", message: "History failed" };
  } };
  if (request === "@/lib/reminders/cronAuth") return { verifyCronReminderAuth: () => cronAllowed
    ? { ok: true } : { ok: false, status: 401, error: "Unauthorized" } };
  if (request === "@/lib/reminders/run-reminders") return { runDueRemindersForAllWorkspaces: async () => {
    calls++;
    return { workspacesProcessed: workspaceResults.length, totalInvoicesProcessed: 1,
      totalRemindersSent: workspaceResults.reduce((sum, row) => sum + row.remindersSent, 0),
      totalRemindersFailed: workspaceResults.reduce((sum, row) => sum + row.remindersFailed, 0),
      totalRemindersUncertain: workspaceResults.reduce((sum, row) => sum + row.remindersUncertain, 0),
      workspaceResults, errors: [] };
  } };
  return originalLoad.call(this, request, ...args);
};
const load = createRequire(__filename);
const generic = load("@/app/api/reminders/send/route").POST as typeof import("@/app/api/reminders/send/route").POST;
const workspace = load("@/app/api/workspaces/[workspaceId]/reminders/send/route").POST as typeof import("@/app/api/workspaces/[workspaceId]/reminders/send/route").POST;
const cron = load("@/app/api/internal/reminders/run/route") as typeof import("@/app/api/internal/reminders/run/route");
runtime._load = originalLoad;
const request = () => new Request("http://fixture.invalid/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspaceId, invoiceId }) }) as NextRequest;
const handlers = [
  ["generic", () => generic(request())],
  ["workspace", () => workspace(request(), { params: Promise.resolve({ workspaceId }) })],
] as const;
for (const [name, invoke] of handlers) {
  for (const status of [401, 403] as const) test(`${name} denies ${status === 401 ? "unauthorized" : "cross-workspace"} requests before sender`, async () => {
    denied = status; calls = 0;
    const response = await invoke();
    assert.equal(response.status, status); assert.equal(calls, 0);
  });
  test(`${name} uses verified scope and exposes accepted-history reconciliation`, async () => {
    denied = undefined; calls = 0;
    const response = await invoke(); const body = await response.json();
    assert.equal(calls, 1); assert.equal(body.success ?? body.ok, true);
    assert.equal(body.status, "sent"); assert.equal(body.reminderId, "record");
    assert.equal(body.historyPersisted, false); assert.equal(body.reconciliationRequired, true);
    assert.equal(body.retryAllowed, false); assert.match(body.message, /do not resend/i);
  });
}
function result(overrides: Partial<ReminderRunResult> = {}): ReminderRunResult {
  return { workspaceId, candidatesEligible: 1, invoicesProcessed: 1, remindersSent: 0,
    remindersFailed: 0, remindersSkipped: 0, remindersUncertain: 0, warnings: [], errors: [], ...overrides };
}
for (const method of ["GET", "POST"] as const) {
  test(`cron ${method} denies unauthorized execution`, async () => {
    cronAllowed = false; calls = 0;
    assert.equal((await cron[method](request())).status, 401); assert.equal(calls, 0);
  });
  test(`cron ${method} reports caught workspace failure despite zero failed count`, async () => {
    cronAllowed = true; workspaceResults = [result({ errors: [{ invoiceId: "workspace", error: "Incomplete data" }] })];
    const response = await cron[method](request()); const body = await response.json();
    assert.equal(response.status, 500); assert.equal(body.success, false); assert.equal(body.status, "failed");
    assert.equal(body.summary.errorsCount, 1); assert.equal(body.retryAllowed, false);
  });
  test(`cron ${method} preserves partial accepted-history and uncertain outcomes without replay`, async () => {
    cronAllowed = true;
    workspaceResults = [result({ remindersSent: 1, warnings: [{ invoiceId, warning: "Accepted; reconcile", historyPersisted: false }] }),
      result({ remindersFailed: 1, remindersUncertain: 1, errors: [{ invoiceId: "other", error: "Timeout", deliveryUncertain: true }] })];
    const response = await cron[method](request()); const body = await response.json();
    assert.equal(response.status, 200); assert.equal(body.success, false); assert.equal(body.status, "partial");
    assert.equal(body.summary.totalRemindersSent, 1); assert.equal(body.summary.warningsCount, 1);
    assert.equal(body.summary.totalRemindersUncertain, 1); assert.equal(body.reconciliationRequired, true);
    assert.equal(body.workspaceResults[0].warnings[0].historyPersisted, false);
    assert.equal(body.errors[0].deliveryUncertain, true); assert.equal(body.retryAllowed, false);
    assert.match(body.message, /do not resend or replay/i);
  });
}
