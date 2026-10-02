import assert from "node:assert/strict";
import { describe, it } from "node:test";
import "./testSetup";
import { deliverBillingEmailNotification, formatVerifiedPaymentTotal, runPaidBillingEmailRecovery, enqueueAnnualBillingReminders } from "../billingEmailDelivery";

const request = { to: "fixture@example.invalid", subject: "Renewed", html: "<p>Renewed</p>", text: "Renewed", frozenFrom: "Arrexia <billing@example.invalid>" };
function fixture(prepared = true) {
  const row = { id: "notification", workspace_id: "workspace", claim_token: "lease-token", notification_kind: "renewal", paddle_environment: "production", resend_idempotency_key: "billing:production:txn_one", request_payload: prepared ? request : null };
  const finishes: Record<string, unknown>[] = [];
  let available = true;
  const admin = { rpc: async (name: string, params: Record<string, unknown>) => {
    if (name === "rpc_claim_paid_billing_email") return { data: available ? { state: "claimed", notification: row } : { state: "unavailable" }, error: null };
    if (name === "rpc_prepare_paid_billing_email") return { data: row.request_payload ?? params.p_request, error: null };
    if (name === "rpc_finish_paid_billing_email") { finishes.push(params); if(params.p_outcome === "sent") available = false; return { data: true, error: null }; }
    throw new Error("Unexpected RPC");
  } };
  return { admin: admin as never, rpc: admin.rpc, finishes, row };
}
describe("durable billing email delivery", () => {
  it("sends a claimed immutable payload with its stable provider key then deduplicates", async () => {
    const f = fixture(); const calls: unknown[] = [];
    const deps = { admin: f.admin, sendEmailFn: async (input: unknown) => { calls.push(input); return { success: true, messageId: "resend-one" }; } };
    assert.equal((await deliverBillingEmailNotification("notification", deps)).outcome, "sent");
    assert.equal((await deliverBillingEmailNotification("notification", deps)).outcome, "unavailable");
    assert.deepEqual(calls, [{ ...request, idempotencyKey: f.row.resend_idempotency_key }]);
    assert.equal(f.finishes[0].p_claim_token, "lease-token");
  });
  it("uncertain timeout retains the same request and key for recovery, never claims success", async () => {
    const f = fixture(); const calls: unknown[] = [];
    const deps = { admin: f.admin, sendEmailFn: async (input: unknown) => { calls.push(input); return { success: false, uncertain: true, error: "timeout" }; } };
    assert.equal((await deliverBillingEmailNotification("notification", deps)).outcome, "uncertain");
    await deliverBillingEmailNotification("notification", deps);
    assert.deepEqual(calls[0], calls[1]);
    assert.equal(f.finishes[0].p_outcome, "uncertain");
  });
  it("explicit non-acceptance remains failed and no-message-ID success is uncertain", async () => {
    for (const [result, expected] of [[{ success: false, error: "quota" }, "failed"], [{ success: true }, "uncertain"]] as const) {
      const f = fixture();
      assert.equal((await deliverBillingEmailNotification("notification", { admin: f.admin, sendEmailFn: async () => result })).outcome, expected);
    }
  });
  it("does not send if immutable request preparation loses its lease", async () => {
    const f = fixture(false); let sends = 0;
    const admin = { rpc: async (name: string, params: Record<string, unknown>) => name === "rpc_prepare_paid_billing_email" ? { data: null, error: { message: "claim lost" } } : f.rpc(name, params) } as never;
    assert.equal((await deliverBillingEmailNotification("notification", { admin, buildRequestFn: async () => request, sendEmailFn: async () => { sends++; return { success: true, messageId: "bad" }; } })).outcome, "unavailable");
    assert.equal(sends, 0);
  });
  it("provider acceptance with a lost completion fence stays uncertain", async () => {
    const f = fixture();
    const admin = { rpc: async (name: string, params: Record<string, unknown>) => name === "rpc_finish_paid_billing_email" ? { data: false, error: null } : f.rpc(name, params) } as never;
    const result = await deliverBillingEmailNotification("notification", { admin, sendEmailFn: async () => ({ success: true, messageId: "accepted" }) });
    assert.equal(result.outcome, "uncertain");
  });
  it("renders verified minor units without a catalog-price fallback", () => {
    assert.equal(formatVerifiedPaymentTotal({ total: "39000", currency_code: "USD" }), "$390.00");
    assert.equal(formatVerifiedPaymentTotal({ total: "0", currency_code: "USD" }), "$0.00");
    assert.equal(formatVerifiedPaymentTotal({ total: "39000" }), null);
    assert.equal(formatVerifiedPaymentTotal({ total: "NaN", currency_code: "USD" }), null);
  });
  it("bounds the recovery cohort and filters out manual-review notifications", async () => {
    const f = fixture(); const filters: unknown[][] = []; let limit = 0;
    const query = {
      select: (...args: unknown[]) => { filters.push(["select", ...args]); return query; },
      eq: (...args: unknown[]) => { filters.push(["eq", ...args]); return query; },
      in: (...args: unknown[]) => { filters.push(["in", ...args]); return query; },
      not: (...args: unknown[]) => { filters.push(["not", ...args]); return query; },
      lte: (...args: unknown[]) => { filters.push(["lte", ...args]); return query; },
      order: (...args: unknown[]) => { filters.push(["order", ...args]); return query; },
      limit: (n: number) => { limit = n; return Promise.resolve({ data: [{ id: "notification" }], error: null }); },
    };
    const admin = { rpc: f.rpc, from: () => query } as never;
    const result = await runPaidBillingEmailRecovery(1000, { admin, sendEmailFn: async () => ({ success: true, messageId: "fixture-message" }) });
    assert.deepEqual(result, { attempted: 1, sent: 1, uncertain: 0, failed: 0 });
    assert.equal(limit, 25);
    assert.ok(filters.some(filter => JSON.stringify(filter) === JSON.stringify(["eq", "paddle_environment", "production"])));
    assert.ok(filters.some(filter => JSON.stringify(filter) === JSON.stringify(["not", "available_at", "is", null])));
  });
  it("does not touch the paid queue or enqueue reminders in Sandbox", async () => {
    const original = process.env.NEXT_PUBLIC_PADDLE_ENV;
    process.env.NEXT_PUBLIC_PADDLE_ENV = "sandbox";
    const admin = { rpc: () => { throw new Error("Sandbox must not call Live RPC"); }, from: () => { throw new Error("Sandbox must not read Live queue"); } } as never;
    try {
      assert.equal((await deliverBillingEmailNotification("notification", { admin })).outcome, "unavailable");
      assert.deepEqual(await runPaidBillingEmailRecovery(25, { admin }), { attempted: 0, sent: 0, uncertain: 0, failed: 0 });
      assert.equal(await enqueueAnnualBillingReminders(25, admin), 0);
    } finally { process.env.NEXT_PUBLIC_PADDLE_ENV = original; }
  });
});
