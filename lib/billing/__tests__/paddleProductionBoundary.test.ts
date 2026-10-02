import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import "./testSetup";
import { resolveWorkspaceEntitlement } from "../resolveWorkspaceEntitlement";
import { getWorkspaceEntitlementState } from "../getWorkspaceEntitlement";
import { createPaddleCustomerPortalSessionForWorkspace } from "../paddle/createPaddleCustomerPortalSession";
import { resolvePaddleCheckoutCustomer } from "../paddle/resolvePaddleCheckoutCustomer";
import { processPaddleWebhookEvent } from "../paddle/webhook/processPaddleWebhookEvent";
import { setSupabaseAdminClientForTests } from "@/lib/supabase/admin";
import { createBillingMockAdmin, createBillingMockState, seedWorkspace, seedPlan, seedSubscription } from "./billingMutationMock";
import type { WorkspaceSubscriptionSnapshot } from "../workspaceSubscription";
import type { EventEntity } from "@paddle/paddle-node-sdk";
import { deliverPaidSubscriptionActivatedEmail } from "../paidLifecycleDelivery";

const workspaceId = "00000000-0000-0000-0000-000000000001";
const savedEnvironment = process.env.NEXT_PUBLIC_PADDLE_ENV;
afterEach(() => {
  setSupabaseAdminClientForTests(null);
  if (savedEnvironment === undefined) delete process.env.NEXT_PUBLIC_PADDLE_ENV;
  else process.env.NEXT_PUBLIC_PADDLE_ENV = savedEnvironment;
});
function subscription(environment?: string): WorkspaceSubscriptionSnapshot {
  return { status: "active", plan: "business", paymentProvider: "paddle",
    providerCustomerId: "ctm_01m16x5zx5bf6zcmhmz94xqwa5", providerSubscriptionId: "sub_01m17skvvtbhfqk1380xtemyb8",
    trialStartsAt: null, trialEndsAt: null, trialConsumedAt: null,
    currentPeriodStartsAt: null, currentPeriodEndsAt: null,
    ...{ paddleEnvironment: environment } } as WorkspaceSubscriptionSnapshot;
}
describe("Production-first Paddle isolation", () => {
  for (const environment of ["sandbox", undefined]) {
    it(`does not reserve or send activation email for ${environment ?? "unclassified"} billing`, async () => {
      let reserved = 0; let sent = 0;
      const result = await deliverPaidSubscriptionActivatedEmail({workspaceId,
        providerSubscriptionId: subscription().providerSubscriptionId!, plan: "business", billingInterval: "monthly", periodEndsAt: null}, {
        admin: { from: () => { reserved++; throw new Error("must not reserve email"); } } as never,
        loadSubscriptionFn: async () => subscription(environment),
        sendEmailFn: async () => { sent++; return {success: true}; },
      });
      assert.deepEqual(result, {ok: true, sent: false, reason: "unverified_live_subscription"});
      assert.equal(reserved, 0); assert.equal(sent, 0);
    });
    it(`does not grant shared paid entitlement to ${environment ?? "unclassified"} Paddle`, () => {
      const result = resolveWorkspaceEntitlement({ storedPlan: "business", subscription: subscription(environment) });
      assert.notEqual(result.state, "paid");
      assert.equal(result.canMutate, false);
      assert.equal(result.plan, "free");
    });
    it(`cannot recover ${environment ?? "unclassified"} paid access through legacy workspace plan fallback`, async () => {
      const state = createBillingMockState();
      seedWorkspace(state, workspaceId); seedPlan(state, workspaceId, "business");
      seedSubscription(state, workspaceId, { status: "active", plan: "business", payment_provider: "paddle",
        trial_starts_at: null, trial_ends_at: null, current_period_starts_at: null, current_period_ends_at: null,
        ...{ paddle_environment: environment } });
      setSupabaseAdminClientForTests(createBillingMockAdmin(state));
      const result = await getWorkspaceEntitlementState(workspaceId);
      assert.notEqual(result.state, "paid"); assert.equal(result.canMutate, false);
    });
    it(`does not send ${environment ?? "unclassified"} identities to the Live portal`, async () => {
      process.env.NEXT_PUBLIC_PADDLE_ENV = "production";
      let calls = 0;
      const result = await createPaddleCustomerPortalSessionForWorkspace(workspaceId, {
        loadSubscriptionFn: async () => subscription(environment),
        getPaddleClientFn: () => { calls++; throw new Error("must not reach API"); },
      });
      assert.equal(result.ok, false); assert.equal(calls, 0);
      if (!result.ok) assert.equal(result.code, "paddle_environment_mismatch");
    });
    it(`blocks checkout for ${environment ?? "unclassified"} history before resolving a customer`, async () => {
      process.env.NEXT_PUBLIC_PADDLE_ENV = "production";
      const result = await resolvePaddleCheckoutCustomer(workspaceId, {
        loadSubscriptionFn: async () => ({ ...subscription(environment), providerLastEventAt: null,
          paymentProvider: "paddle", providerCustomerId: subscription().providerCustomerId!, providerSubscriptionId: subscription().providerSubscriptionId! }),
        resolveOwnerFn: async () => { throw new Error("quarantined history must not resolve a checkout customer"); },
      });
      assert.deepEqual(result, { ok: false, reason: "billing_history_requires_review" });
    });
  }
  it("preserves explicitly Live and legitimate manual paid entitlements", () => {
    assert.equal(resolveWorkspaceEntitlement({ storedPlan: "business", subscription: subscription("production") }).state, "paid");
    assert.equal(resolveWorkspaceEntitlement({ storedPlan: "business", subscription: { ...subscription(), paymentProvider: "manual" } }).state, "paid");
  });
  for (const provider of ["manual", "paddle"]) for (const status of ["active", "past_due"] as const) {
    it(`blocks a second checkout for ${provider} ${status} paid billing`, async () => {
      process.env.NEXT_PUBLIC_PADDLE_ENV = "production";
      const result = await resolvePaddleCheckoutCustomer(workspaceId, {
        loadSubscriptionFn: async () => ({ ...subscription("production"), status,
          paymentProvider: provider, providerLastEventAt: null,
          providerCustomerId: subscription().providerCustomerId!, providerSubscriptionId: subscription().providerSubscriptionId! }),
        resolveOwnerFn: async () => { throw new Error("existing paid billing cannot start another subscription"); },
      });
      assert.deepEqual(result, { ok: false, reason: "existing_paid_subscription" });
    });
  }
  for (const missing of ["customer", "chronology"] as const) {
    it(`refuses canceled Live replacement with missing ${missing}`, async () => {
      process.env.NEXT_PUBLIC_PADDLE_ENV = "production";
      const result = await resolvePaddleCheckoutCustomer(workspaceId, {
        loadSubscriptionFn: async () => ({ ...subscription("production"), status: "cancelled",
          paymentProvider: "paddle", providerLastEventAt: missing === "chronology" ? null : "2026-09-01T00:00:00Z",
          providerCustomerId: missing === "customer" ? null : subscription().providerCustomerId!,
          providerSubscriptionId: subscription().providerSubscriptionId! }),
        resolveOwnerFn: async () => { throw new Error("incomplete history must not start replacement checkout"); },
      });
      assert.deepEqual(result, { ok: false, reason: "billing_history_requires_review" });
    });
  }
  it("rejects Sandbox before claiming an event or touching the database", async () => {
    process.env.NEXT_PUBLIC_PADDLE_ENV = "sandbox";
    let calls = 0;
    setSupabaseAdminClientForTests({ rpc: async () => { calls++; throw new Error("database access forbidden"); } } as never);
    const result = await processPaddleWebhookEvent({eventId: "evt_sandbox", eventType: "subscription.updated", occurredAt: "2026-09-01"} as EventEntity);
    assert.equal(calls, 0); assert.equal(result.ok, false);
    assert.equal(result.reason, "production_billing_only");
  });
  it("refuses portal creation even when a Sandbox row matches the local Sandbox deployment", async () => {
    process.env.NEXT_PUBLIC_PADDLE_ENV = "sandbox";
    let calls = 0;
    const result = await createPaddleCustomerPortalSessionForWorkspace(workspaceId, {
      loadSubscriptionFn: async () => subscription("sandbox"),
      getPaddleClientFn: () => { calls++; throw new Error("must not reach Sandbox API"); },
    });
    assert.equal(calls, 0);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "paddle_environment_mismatch");
  });
});
