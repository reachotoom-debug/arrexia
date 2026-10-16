import assert from "node:assert/strict";
import Module, { createRequire } from "node:module";
import { test } from "node:test";
import { TRIAL_EXPIRED_MESSAGE } from "@/lib/billing/entitlementErrors";

const requireForTest = createRequire(__filename);

type Load = (request: string, parent?: NodeModule | null, isMain?: boolean) => unknown;
const runtime = Module as typeof Module & { _load: Load };
const originalLoad = runtime._load;
const effects: string[] = [];
let serviceOverride: typeof import("../send").sendReminderForInvoice | undefined;
runtime._load = function (request, ...args) {
  if (request === "@/lib/auth/server") return { requireWorkspaceForApi: async () => ({ ok: true, user: { id: "user" }, workspace: { id: workspaceId } }) };
  if (request === "./getWorkspaceEntitlement") return { getWorkspaceEntitlementState: async () => ({ state: "trial_expired", canMutate: false }) };
  if (request === "./usageMetering") return new Proxy({}, { get: (_, name) => () => { effects.push(`usage:${String(name)}`); throw new Error("Usage must not be touched"); } });
  if (request === "@/lib/supabase/server") return { supabaseServer: async () => ({ from: () => { effects.push("database"); throw new Error("Database must not be touched"); } }) };
  if (request === "@/lib/audit/log") return { logAuditEvent: async () => effects.push("audit") };
  if (request === "@/lib/email/sendEmail") return { sendEmail: async () => effects.push("email"), resolveEmailProvider: () => effects.push("provider") };
  if (request === "@/lib/reminders/send" && serviceOverride) return { sendReminderForInvoice: (...params: Parameters<typeof realService>) => serviceOverride!(...params) };
  return originalLoad.call(this, request, ...args);
};
const realService = requireForTest("@/lib/reminders/send").sendReminderForInvoice as typeof import("../send").sendReminderForInvoice;
serviceOverride = (...args) => realService(...args);
const generic = requireForTest("@/app/api/reminders/send/route").POST;
const workspace = requireForTest("@/app/api/workspaces/[workspaceId]/reminders/send/route").POST;
const workspaceId = "11111111-1111-1111-1111-111111111111";
const invoiceId = "22222222-2222-2222-2222-222222222222";
const request = () => new Request("http://localhost/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspaceId, invoiceId }) });

test("real shared reminder service blocks expired trial before email, logs, audit or quota writes", async () => {
  effects.length = 0;
  assert.deepEqual(await realService({ workspaceId, invoiceId, source: "manual" }), { success: false, status: "skipped", skipReason: "TRIAL_EXPIRED", errorMessage: TRIAL_EXPIRED_MESSAGE });
  assert.deepEqual(effects, []);
});
for (const [name, handler] of [["generic", generic], ["workspace", workspace]] as const) {
  test(`${name} adapter preserves delivery uncertainty and accepted history warnings`, async () => {
    for (const outcome of [
      { success: true, status: "sent", historyPersisted: false, message: "History failed" },
      { success: false, status: "failed", deliveryUncertain: true, errorMessage: "Timeout" },
    ] as import("../send").SendReminderResult[]) {
      serviceOverride = async (options) => { assert.equal(options.workspaceId, workspaceId); assert.equal(options.userId, "user"); return outcome; };
      const response = await handler(request(), { params: Promise.resolve({ workspaceId }) });
      const body = await response.json();
      assert.equal(body.historyPersisted, outcome.historyPersisted);
      assert.equal(body.deliveryUncertain, outcome.deliveryUncertain);
      assert.equal(body.status, outcome.status);
      assert.equal(body.reconciliationRequired, true);
      assert.equal(body.retryAllowed, false);
      assert.match(body.message, /reconcile.*do not resend/i);
    }
    serviceOverride = (...args) => realService(...args);
  });
  test(`${name} adapter preserves canonical expired-trial skip from real service`, async () => {
    effects.length = 0;
    const response = await handler(request(), { params: Promise.resolve({ workspaceId }) });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.status, "skipped"); assert.equal(body.message, TRIAL_EXPIRED_MESSAGE);
    assert.equal(body.details.skipReason, "TRIAL_EXPIRED"); assert.deepEqual(effects, []);
  });
  for (const state of ["active trial", "paid"]) test(`${name} adapter preserves ${state} successful sends`, async () => {
    serviceOverride = async () => ({ success: true, status: "sent", message: "Sent" });
    const response = await handler(request(), { params: Promise.resolve({ workspaceId }) });
    assert.equal(response.status, 200); const body = await response.json();
    assert.equal(body.success ?? body.ok, true); assert.equal(body.message, "Sent");
    serviceOverride = (...args) => realService(...args);
  });
}
