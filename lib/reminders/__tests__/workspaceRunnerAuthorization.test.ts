import assert from "node:assert/strict";
import Module, { createRequire } from "node:module";
import { test } from "node:test";
import type { ReminderRunResult, RunDueRemindersOptions } from "../run-reminders";

type Load = (request: string, parent?: NodeModule | null, isMain?: boolean) => unknown;
const runtime = Module as typeof Module & { _load: Load };
const originalLoad = runtime._load;
const effects: unknown[] = [];
let access: { ok: true; workspace: { id: string } } | { ok: false; status: number; error: string };
let result: ReminderRunResult;
const admin = { from() { throw new Error("No database access allowed"); } };
runtime._load = function (request, ...args) {
  if (request === "@/lib/auth/server") return {
    requireWorkspace: async () => { throw new Error("Page authentication must not be used"); },
    requireWorkspaceForApi: async (id: string) => { effects.push(["auth", id]); return access; },
  };
  if (request === "@/lib/supabase/admin") return { supabaseAdmin: () => { effects.push("admin"); return admin; } };
  if (request === "@/lib/reminders/run-reminders") return { runDueRemindersForWorkspace: async (id: string, options: RunDueRemindersOptions) => {
    effects.push(["run", id, options?.supabase === admin]); return result;
  } };
  return originalLoad.call(this, request, ...args);
};
const handler = createRequire(__filename)("@/app/api/workspaces/[workspaceId]/reminders/run/route").POST;
runtime._load = originalLoad;
const request = () => new Request("http://localhost/run", { method: "POST" });
const run = () => handler(request(), { params: Promise.resolve({ workspaceId: "requested" }) });
function reset(overrides: Partial<ReminderRunResult> = {}) {
  effects.length = 0;
  access = { ok: true, workspace: { id: "verified" } };
  result = { workspaceId: "verified", candidatesEligible: 1, invoicesProcessed: 1,
    remindersSent: 1, remindersFailed: 0, remindersSkipped: 0, remindersUncertain: 0, errors: [], warnings: [], ...overrides };
}

for (const status of [401, 403]) test(`runner returns ${status} without constructing privileged client`, async () => {
  reset(); access = { ok: false, status, error: status === 401 ? "Unauthorized" : "Forbidden" };
  const response = await run();
  assert.equal(response.status, status);
  assert.equal((await response.json()).success, false);
  assert.deepEqual(effects, [["auth", "requested"]]);
});
test("runner derives privileged execution scope from verified authorization context", async () => {
  reset(); const response = await run();
  assert.equal(response.status, 200);
  assert.deepEqual(effects, [["auth", "requested"], "admin", ["run", "verified", true]]);
  assert.equal((await response.json()).status, "success");
});
const batches: Array<[string, Partial<ReminderRunResult>, string, number]> = [
  ["failed", { remindersSent: 0, remindersFailed: 1, errors: [{ invoiceId: "one", error: "failed" }] }, "failed", 500],
  ["workspace failure", { remindersSent: 0, remindersFailed: 0, errors: [{ invoiceId: "workspace", error: "load failed" }] }, "failed", 500],
  ["partial", { remindersFailed: 1 }, "partial", 200],
  ["accepted with warning", { warnings: [{ invoiceId: "one", warning: "History missing", historyPersisted: false }] }, "partial", 200],
  ["uncertain", { remindersSent: 0, remindersFailed: 1, remindersUncertain: 1 }, "failed", 500],
  ["skipped", { remindersSent: 0, invoicesProcessed: 0, candidatesEligible: 0, entitlementSkipReason: "trial_expired" }, "skipped", 200],
];
for (const [label, overrides, status, http] of batches) test(`runner reports ${label} batch truthfully`, async () => {
  reset(overrides); const response = await run(); const body = await response.json();
  assert.equal(response.status, http); assert.equal(body.status, status);
  assert.equal(body.success, status === "skipped");
  assert.equal(body.entitlementSkipReason, result.entitlementSkipReason ?? null);
  assert.deepEqual(body.warnings, result.warnings);
  assert.equal(body.remindersUncertain, result.remindersUncertain);
  assert.equal(body.retryAllowed, false);
  assert.equal(body.reconciliationRequired, label === "accepted with warning" || label === "uncertain");
  if (body.reconciliationRequired) assert.match(body.message, /reconcil|review/i);
});
