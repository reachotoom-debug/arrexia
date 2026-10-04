import assert from "node:assert/strict";
import Module, { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { TRIAL_EXPIRED_MESSAGE } from "@/lib/billing/entitlementErrors";

const requireForTest = createRequire(__filename);

const runtime = Module as any;
const originalLoad = runtime._load;
let entitlementState = "trial_expired";
let authorized = true;
const effects: string[] = [];
runtime._load = function (request: string, ...args: any[]) {
  if (request === "@/lib/auth/server") return { requireWorkspaceForApi: async () => authorized ? { ok: true, user: { id: "user" } } : { ok: false, error: "Unauthorized", status: 401 } };
  if (request === "./getWorkspaceEntitlement") return { getWorkspaceEntitlementState: async () => { effects.push("guard"); return { state: entitlementState, canMutate: entitlementState !== "trial_expired" }; } };
  if (request === "./usageMetering") return new Proxy({}, { get: (_, name) => () => { effects.push(`usage:${String(name)}`); throw new Error("Unexpected usage mutation"); } });
  if (request === "@/lib/supabase/server") return { supabaseServer: async () => ({ from: (table: string) => {
    effects.push(table);
    const chain: any = { select: () => chain, eq: () => chain, single: async () => ({ data: { id: "invoice", invoice_number: "1", status: "draft" } }), insert: async () => { effects.push("write"); return {}; } };
    return chain;
  } }) };
  if (request === "@/lib/invoices/send-email") return { sendInvoiceEmail: async () => { effects.push("email/communication/usage"); return { success: true, subject: "Invoice", providerMessageId: "message" }; } };
  if (request === "@/lib/invoices/promoteDraftInvoiceAfterSend") return { promoteDraftInvoiceToSentAfterSend: async () => { effects.push("status"); return { promoted: true }; }, revalidatePathsAfterInvoiceSent: () => effects.push("revalidate") };
  if (request === "@/lib/audit/log") return { logAuditEvent: async () => effects.push("audit") };
  if (request === "@/lib/email/sendEmail") return { validateSandboxRecipient: () => null };
  if (request === "next/cache") return { revalidatePath: () => {} };
  return originalLoad.call(this, request, ...args);
};
const { postSendInvoiceEmail } = requireForTest("@/lib/invoices/send-invoice-route");
const apiRoute = requireForTest("@/app/api/workspaces/[workspaceId]/invoices/[invoiceId]/send/route").POST;
const workspaceRoute = requireForTest("@/app/[workspaceId]/invoices/[invoiceId]/send/route").POST;

for (const [name, handler] of [["API", apiRoute], ["workspace", workspaceRoute]] as const) {
  test(`${name} invoice route returns canonical expiry without send, log, audit, status or usage mutations`, async () => {
    effects.length = 0; entitlementState = "trial_expired";
    const request = new Request("http://localhost/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ toEmail: "client@example.com" }) });
    const response = await handler(request, { params: Promise.resolve({ workspaceId: "workspace", invoiceId: "invoice" }) });
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { ok: false, success: false, code: "TRIAL_EXPIRED", error: TRIAL_EXPIRED_MESSAGE });
    assert.deepEqual(effects, ["guard"]);
  });
}

test("expired invoice send returns canonical 403 before all side effects", async () => {
  effects.length = 0; entitlementState = "trial_expired";
  const response = await postSendInvoiceEmail("workspace", "invoice", { toEmail: "client@example.com" });
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { ok: false, success: false, code: "TRIAL_EXPIRED", error: TRIAL_EXPIRED_MESSAGE });
  assert.deepEqual(effects, ["guard"]);
});
for (const state of ["active trial", "paid"]) test(`${state} invoice send preserves success and delivery mutations`, async () => {
  effects.length = 0; entitlementState = state === "paid" ? "paid" : "trial";
  const response = await postSendInvoiceEmail("workspace", "invoice", { toEmail: "client@example.com" });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).messageId, "message");
  assert.deepEqual(effects, ["guard", "invoices", "email/communication/usage", "invoice_delivery_logs", "write", "status", "revalidate", "audit"]);
});
test("membership rejection precedes entitlement lookup", async () => {
  effects.length = 0; authorized = false;
  const response = await postSendInvoiceEmail("workspace", "invoice", {});
  assert.equal(response.status, 401); assert.deepEqual(effects, []); authorized = true;
});
test("invoice UI displays the server error field", () => {
  assert.match(readFileSync("app/[workspaceId]/invoices/[invoiceId]/_components/SendInvoiceButton.tsx", "utf8"), /description: data\.error \|\| data\.message/);
});
