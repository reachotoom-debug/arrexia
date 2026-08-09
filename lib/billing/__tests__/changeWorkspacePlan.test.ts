import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { afterEach, describe, it } from "node:test";

import "./testSetup";

import { changeWorkspacePlan } from "@/lib/billing/changeWorkspacePlan";
import { getWorkspacePlan } from "@/lib/billing/getWorkspacePlan";
import { CUSTOMER_PAID_ACTIVATION_BLOCKED_MESSAGE } from "@/lib/billing/planMutationPolicy";
import { getPlanStorageLimits } from "@/lib/billing/plans";
import { setSupabaseAdminClientForTests } from "@/lib/supabase/admin";

import {
  createBillingMockAdmin,
  createBillingMockState,
  seedPlan,
  seedSubscription,
  seedWorkspace,
} from "./billingMutationMock";

const WORKSPACE_ID = "ws-billing-test";
const ACTOR_ID = "user-owner";
const NOW = new Date("2026-07-26T12:00:00.000Z");
const FUTURE_TRIAL_END = "2026-08-09T12:00:00.000Z";
const PAST_TRIAL_END = "2026-07-10T12:00:00.000Z";

function installMock(state = createBillingMockState()) {
  seedWorkspace(state, WORKSPACE_ID);
  const admin = createBillingMockAdmin(state);
  setSupabaseAdminClientForTests(admin);
  return state;
}

afterEach(() => {
  setSupabaseAdminClientForTests(null);
});

function expectCustomerPaidActivationBlocked(
  result: Awaited<ReturnType<typeof changeWorkspacePlan>>
) {
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.code, "PAYMENT_PROVIDER_REQUIRED");
    assert.equal(result.error, CUSTOMER_PAID_ACTIVATION_BLOCKED_MESSAGE);
  }
}

describe("changeWorkspacePlan", () => {
  it("Free → Starter blocked for customer_settings until payment provider", async () => {
    const state = installMock();
    seedPlan(state, WORKSPACE_ID, "free");

    const result = await changeWorkspacePlan({
      workspaceId: WORKSPACE_ID,
      targetPlan: "starter",
      source: "customer_settings",
      actorUserId: ACTOR_ID,
      now: NOW,
    });

    expectCustomerPaidActivationBlocked(result);
    assert.equal(state.subscriptions.length, 0);
  });

  it("founder admin Free → Starter succeeds and activates manual subscription", async () => {
    const state = installMock();
    seedPlan(state, WORKSPACE_ID, "free");

    const result = await changeWorkspacePlan({
      workspaceId: WORKSPACE_ID,
      targetPlan: "starter",
      source: "founder_admin",
      actorUserId: ACTOR_ID,
      allowAdminOverride: true,
      now: NOW,
    });

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.previousEffectivePlan, "free");
      assert.equal(result.newEffectivePlan, "starter");
      assert.equal(result.subscriptionStatus, "active");
    }
    assert.equal(state.subscriptions[0]?.status, "active");
    assert.equal(state.subscriptions[0]?.plan, "starter");
  });

  for (const targetPlan of ["starter", "pro", "business"] as const) {
    it(`active canonical free trial → ${targetPlan} blocked for customer_settings`, async () => {
      const state = installMock();
      seedPlan(state, WORKSPACE_ID, "free");
      seedSubscription(state, WORKSPACE_ID, {
        plan: "free",
        status: "trial",
        trial_starts_at: "2026-07-01T00:00:00.000Z",
        trial_ends_at: FUTURE_TRIAL_END,
        current_period_starts_at: null,
        current_period_ends_at: null,
      });

      const result = await changeWorkspacePlan({
        workspaceId: WORKSPACE_ID,
        targetPlan,
        source: "customer_settings",
        actorUserId: ACTOR_ID,
        now: NOW,
      });

      expectCustomerPaidActivationBlocked(result);
      assert.equal(state.subscriptions[0]?.status, "trial");
      assert.equal(state.subscriptions[0]?.plan, "free");
    });
  }

  it("Free → Pro blocked for customer_settings", async () => {
    const state = installMock();
    seedPlan(state, WORKSPACE_ID, "free");

    const result = await changeWorkspacePlan({
      workspaceId: WORKSPACE_ID,
      targetPlan: "pro",
      source: "customer_settings",
      actorUserId: ACTOR_ID,
      now: NOW,
    });

    expectCustomerPaidActivationBlocked(result);
  });

  it("expired Starter trial → Starter blocked for customer_settings", async () => {
    const state = installMock();
    seedPlan(state, WORKSPACE_ID, "starter");
    seedSubscription(state, WORKSPACE_ID, {
      plan: "starter",
      status: "trial",
      trial_starts_at: "2026-07-01T00:00:00.000Z",
      trial_ends_at: PAST_TRIAL_END,
      current_period_starts_at: null,
      current_period_ends_at: null,
    });

    const result = await changeWorkspacePlan({
      workspaceId: WORKSPACE_ID,
      targetPlan: "starter",
      source: "customer_settings",
      actorUserId: ACTOR_ID,
      now: NOW,
    });

    expectCustomerPaidActivationBlocked(result);
  });

  it("expired Starter trial → Pro blocked for customer_settings", async () => {
    const state = installMock();
    seedPlan(state, WORKSPACE_ID, "starter");
    seedSubscription(state, WORKSPACE_ID, {
      plan: "starter",
      status: "trial",
      trial_starts_at: "2026-07-01T00:00:00.000Z",
      trial_ends_at: PAST_TRIAL_END,
      current_period_starts_at: null,
      current_period_ends_at: null,
    });

    const result = await changeWorkspacePlan({
      workspaceId: WORKSPACE_ID,
      targetPlan: "pro",
      source: "customer_settings",
      actorUserId: ACTOR_ID,
      now: NOW,
    });

    expectCustomerPaidActivationBlocked(result);
  });

  it("expired Pro trial → Pro blocked for customer_settings", async () => {
    const state = installMock();
    seedPlan(state, WORKSPACE_ID, "pro");
    seedSubscription(state, WORKSPACE_ID, {
      plan: "pro",
      status: "trial",
      trial_starts_at: "2026-07-01T00:00:00.000Z",
      trial_ends_at: PAST_TRIAL_END,
      current_period_starts_at: null,
      current_period_ends_at: null,
    });

    const result = await changeWorkspacePlan({
      workspaceId: WORKSPACE_ID,
      targetPlan: "pro",
      source: "customer_settings",
      actorUserId: ACTOR_ID,
      now: NOW,
    });

    expectCustomerPaidActivationBlocked(result);
  });

  it("active Starter trial → Pro blocked for customer_settings", async () => {
    const state = installMock();
    seedPlan(state, WORKSPACE_ID, "starter");
    seedSubscription(state, WORKSPACE_ID, {
      plan: "starter",
      status: "trial",
      trial_starts_at: "2026-07-12T12:00:00.000Z",
      trial_ends_at: FUTURE_TRIAL_END,
      current_period_starts_at: null,
      current_period_ends_at: null,
    });

    const result = await changeWorkspacePlan({
      workspaceId: WORKSPACE_ID,
      targetPlan: "pro",
      source: "customer_settings",
      actorUserId: ACTOR_ID,
      now: NOW,
    });

    expectCustomerPaidActivationBlocked(result);
    assert.equal(state.subscriptions[0]?.trial_ends_at, FUTURE_TRIAL_END);
    assert.equal(state.subscriptions[0]?.status, "trial");
  });

  it("atomic RPC failure is not reached when customer paid activation is blocked", async () => {
    const state = installMock();
    state.atomicRpcShouldFail = true;
    seedPlan(state, WORKSPACE_ID, "free");

    const result = await changeWorkspacePlan({
      workspaceId: WORKSPACE_ID,
      targetPlan: "starter",
      source: "customer_settings",
      actorUserId: ACTOR_ID,
      now: NOW,
    });

    expectCustomerPaidActivationBlocked(result);
    assert.equal(state.plans[0]?.plan, "free");
    assert.equal(state.subscriptions.length, 0);
  });

  it("founder admin atomic RPC failure leaves both billing tables unchanged", async () => {
    const state = installMock();
    state.atomicRpcShouldFail = true;
    seedPlan(state, WORKSPACE_ID, "free");

    const result = await changeWorkspacePlan({
      workspaceId: WORKSPACE_ID,
      targetPlan: "starter",
      source: "founder_admin",
      actorUserId: ACTOR_ID,
      allowAdminOverride: true,
      now: NOW,
    });

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, "ATOMIC_MUTATION_FAILED");
    }
    assert.equal(state.plans[0]?.plan, "free");
    assert.equal(state.subscriptions.length, 0);
  });

  it("returns activation failure when effective plan does not match target", async () => {
    const state = installMock();
    state.atomicRpcSnapshotOnly = true;
    seedPlan(state, WORKSPACE_ID, "free");
    seedSubscription(state, WORKSPACE_ID, {
      plan: "starter",
      status: "trial",
      trial_starts_at: "2026-07-01T00:00:00.000Z",
      trial_ends_at: PAST_TRIAL_END,
      current_period_starts_at: null,
      current_period_ends_at: null,
    });

    const result = await changeWorkspacePlan({
      workspaceId: WORKSPACE_ID,
      targetPlan: "starter",
      source: "founder_admin",
      actorUserId: ACTOR_ID,
      allowAdminOverride: true,
      now: NOW,
    });

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, "ACTIVATION_FAILED");
    }
  });

  it("no-op current plan selection returns safely without writes", async () => {
    const state = installMock();
    seedPlan(state, WORKSPACE_ID, "starter");
    seedSubscription(state, WORKSPACE_ID, {
      plan: "starter",
      status: "active",
      trial_starts_at: null,
      trial_ends_at: null,
      current_period_starts_at: NOW.toISOString(),
      current_period_ends_at: FUTURE_TRIAL_END,
    });

    const result = await changeWorkspacePlan({
      workspaceId: WORKSPACE_ID,
      targetPlan: "starter",
      source: "customer_settings",
      actorUserId: ACTOR_ID,
      now: NOW,
    });

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.transitionType, "no_op");
      assert.equal(result.newEffectivePlan, "starter");
    }
  });

  it("blocks customer Pro → Starter", async () => {
    const state = installMock();
    seedPlan(state, WORKSPACE_ID, "pro");
    seedSubscription(state, WORKSPACE_ID, {
      plan: "pro",
      status: "active",
      trial_starts_at: null,
      trial_ends_at: null,
      current_period_starts_at: NOW.toISOString(),
      current_period_ends_at: FUTURE_TRIAL_END,
    });

    const result = await changeWorkspacePlan({
      workspaceId: WORKSPACE_ID,
      targetPlan: "starter",
      source: "customer_settings",
      actorUserId: ACTOR_ID,
      now: NOW,
    });

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, "DOWNGRADE_REQUIRES_SUPPORT");
    }
  });

  it("blocks customer Starter → Free", async () => {
    const state = installMock();
    seedPlan(state, WORKSPACE_ID, "starter");
    seedSubscription(state, WORKSPACE_ID, {
      plan: "starter",
      status: "active",
      trial_starts_at: null,
      trial_ends_at: null,
      current_period_starts_at: NOW.toISOString(),
      current_period_ends_at: FUTURE_TRIAL_END,
    });

    const result = await changeWorkspacePlan({
      workspaceId: WORKSPACE_ID,
      targetPlan: "free",
      source: "customer_settings",
      actorUserId: ACTOR_ID,
      now: NOW,
    });

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, "DOWNGRADE_REQUIRES_SUPPORT");
    }
  });

  it("founder admin override can downgrade Pro → Free", async () => {
    const state = installMock();
    seedPlan(state, WORKSPACE_ID, "pro");
    seedSubscription(state, WORKSPACE_ID, {
      plan: "pro",
      status: "active",
      trial_starts_at: null,
      trial_ends_at: null,
      current_period_starts_at: NOW.toISOString(),
      current_period_ends_at: FUTURE_TRIAL_END,
    });

    const result = await changeWorkspacePlan({
      workspaceId: WORKSPACE_ID,
      targetPlan: "free",
      source: "founder_admin",
      actorUserId: ACTOR_ID,
      allowAdminOverride: true,
      now: NOW,
    });

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.newStoredPlan, "free");
      assert.equal(result.newEffectivePlan, "free");
    }
  });

  it("getWorkspacePlan reflects new effective plan and limits after mutation", async () => {
    const state = installMock();
    seedPlan(state, WORKSPACE_ID, "free");

    const mutation = await changeWorkspacePlan({
      workspaceId: WORKSPACE_ID,
      targetPlan: "pro",
      source: "founder_admin",
      actorUserId: ACTOR_ID,
      allowAdminOverride: true,
      now: NOW,
    });
    assert.equal(mutation.ok, true);

    const plan = await getWorkspacePlan(WORKSPACE_ID);
    const proLimits = getPlanStorageLimits("pro");
    assert.equal(plan.plan, "pro");
    assert.equal(plan.clientLimit, proLimits.client_limit);
    assert.equal(plan.invoiceLimitMonthly, proLimits.invoice_limit_monthly);
  });

  it("expired trial no longer overrides a successfully activated manual plan", async () => {
    const state = installMock();
    seedPlan(state, WORKSPACE_ID, "starter");
    seedSubscription(state, WORKSPACE_ID, {
      plan: "starter",
      status: "trial",
      trial_starts_at: "2026-07-01T00:00:00.000Z",
      trial_ends_at: PAST_TRIAL_END,
      current_period_starts_at: null,
      current_period_ends_at: null,
    });

    const mutation = await changeWorkspacePlan({
      workspaceId: WORKSPACE_ID,
      targetPlan: "starter",
      source: "founder_admin",
      actorUserId: ACTOR_ID,
      allowAdminOverride: true,
      now: NOW,
    });
    assert.equal(mutation.ok, true);

    const plan = await getWorkspacePlan(WORKSPACE_ID);
    assert.equal(plan.plan, "starter");
    assert.equal(plan.storedPlan, "starter");
  });

  it("Free → Business blocked for customer_settings", async () => {
    const state = installMock();
    seedPlan(state, WORKSPACE_ID, "free");

    const result = await changeWorkspacePlan({
      workspaceId: WORKSPACE_ID,
      targetPlan: "business",
      source: "customer_settings",
      actorUserId: ACTOR_ID,
      now: NOW,
    });

    expectCustomerPaidActivationBlocked(result);
  });

  it("Starter → Business blocked for customer_settings", async () => {
    const state = installMock();
    seedPlan(state, WORKSPACE_ID, "starter");
    seedSubscription(state, WORKSPACE_ID, {
      plan: "starter",
      status: "active",
      trial_starts_at: null,
      trial_ends_at: null,
      current_period_starts_at: NOW.toISOString(),
      current_period_ends_at: FUTURE_TRIAL_END,
    });

    const result = await changeWorkspacePlan({
      workspaceId: WORKSPACE_ID,
      targetPlan: "business",
      source: "customer_settings",
      actorUserId: ACTOR_ID,
      now: NOW,
    });

    expectCustomerPaidActivationBlocked(result);
  });

  it("Pro → Business blocked for customer_settings", async () => {
    const state = installMock();
    seedPlan(state, WORKSPACE_ID, "pro");
    seedSubscription(state, WORKSPACE_ID, {
      plan: "pro",
      status: "active",
      trial_starts_at: null,
      trial_ends_at: null,
      current_period_starts_at: NOW.toISOString(),
      current_period_ends_at: FUTURE_TRIAL_END,
    });

    const result = await changeWorkspacePlan({
      workspaceId: WORKSPACE_ID,
      targetPlan: "business",
      source: "customer_settings",
      actorUserId: ACTOR_ID,
      now: NOW,
    });

    expectCustomerPaidActivationBlocked(result);
  });

  it("expired trial → Business blocked for customer_settings", async () => {
    const state = installMock();
    seedPlan(state, WORKSPACE_ID, "pro");
    seedSubscription(state, WORKSPACE_ID, {
      plan: "pro",
      status: "trial",
      trial_starts_at: "2026-07-01T00:00:00.000Z",
      trial_ends_at: PAST_TRIAL_END,
      current_period_starts_at: null,
      current_period_ends_at: null,
    });

    const result = await changeWorkspacePlan({
      workspaceId: WORKSPACE_ID,
      targetPlan: "business",
      source: "customer_settings",
      actorUserId: ACTOR_ID,
      now: NOW,
    });

    expectCustomerPaidActivationBlocked(result);
  });

  it("active Starter trial → Business blocked for customer_settings", async () => {
    const state = installMock();
    seedPlan(state, WORKSPACE_ID, "starter");
    seedSubscription(state, WORKSPACE_ID, {
      plan: "starter",
      status: "trial",
      trial_starts_at: "2026-07-12T12:00:00.000Z",
      trial_ends_at: FUTURE_TRIAL_END,
      current_period_starts_at: null,
      current_period_ends_at: null,
    });

    const result = await changeWorkspacePlan({
      workspaceId: WORKSPACE_ID,
      targetPlan: "business",
      source: "customer_settings",
      actorUserId: ACTOR_ID,
      now: NOW,
    });

    expectCustomerPaidActivationBlocked(result);
    assert.equal(state.subscriptions[0]?.trial_ends_at, FUTURE_TRIAL_END);
    assert.equal(state.subscriptions[0]?.status, "trial");
  });

  it("active Pro trial → Business blocked for customer_settings", async () => {
    const state = installMock();
    seedPlan(state, WORKSPACE_ID, "pro");
    seedSubscription(state, WORKSPACE_ID, {
      plan: "pro",
      status: "trial",
      trial_starts_at: "2026-07-12T12:00:00.000Z",
      trial_ends_at: FUTURE_TRIAL_END,
      current_period_starts_at: null,
      current_period_ends_at: null,
    });

    const result = await changeWorkspacePlan({
      workspaceId: WORKSPACE_ID,
      targetPlan: "business",
      source: "customer_settings",
      actorUserId: ACTOR_ID,
      now: NOW,
    });

    expectCustomerPaidActivationBlocked(result);
    assert.equal(state.subscriptions[0]?.trial_ends_at, FUTURE_TRIAL_END);
  });

  it("blocks customer Business → Pro", async () => {
    const state = installMock();
    seedPlan(state, WORKSPACE_ID, "business");
    seedSubscription(state, WORKSPACE_ID, {
      plan: "business",
      status: "active",
      trial_starts_at: null,
      trial_ends_at: null,
      current_period_starts_at: NOW.toISOString(),
      current_period_ends_at: FUTURE_TRIAL_END,
    });

    const result = await changeWorkspacePlan({
      workspaceId: WORKSPACE_ID,
      targetPlan: "pro",
      source: "customer_settings",
      actorUserId: ACTOR_ID,
      now: NOW,
    });

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, "DOWNGRADE_REQUIRES_SUPPORT");
    }
  });

  it("blocks customer Business → Starter", async () => {
    const state = installMock();
    seedPlan(state, WORKSPACE_ID, "business");
    seedSubscription(state, WORKSPACE_ID, {
      plan: "business",
      status: "active",
      trial_starts_at: null,
      trial_ends_at: null,
      current_period_starts_at: NOW.toISOString(),
      current_period_ends_at: FUTURE_TRIAL_END,
    });

    const result = await changeWorkspacePlan({
      workspaceId: WORKSPACE_ID,
      targetPlan: "starter",
      source: "customer_settings",
      actorUserId: ACTOR_ID,
      now: NOW,
    });

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, "DOWNGRADE_REQUIRES_SUPPORT");
    }
  });

  it("blocks customer Business → Free", async () => {
    const state = installMock();
    seedPlan(state, WORKSPACE_ID, "business");
    seedSubscription(state, WORKSPACE_ID, {
      plan: "business",
      status: "active",
      trial_starts_at: null,
      trial_ends_at: null,
      current_period_starts_at: NOW.toISOString(),
      current_period_ends_at: FUTURE_TRIAL_END,
    });

    const result = await changeWorkspacePlan({
      workspaceId: WORKSPACE_ID,
      targetPlan: "free",
      source: "customer_settings",
      actorUserId: ACTOR_ID,
      now: NOW,
    });

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, "DOWNGRADE_REQUIRES_SUPPORT");
    }
  });

  it("Business customer activation blocked before atomic RPC", async () => {
    const state = installMock();
    state.atomicRpcShouldFail = true;
    seedPlan(state, WORKSPACE_ID, "free");

    const result = await changeWorkspacePlan({
      workspaceId: WORKSPACE_ID,
      targetPlan: "business",
      source: "customer_settings",
      actorUserId: ACTOR_ID,
      now: NOW,
    });

    expectCustomerPaidActivationBlocked(result);
    assert.equal(state.plans[0]?.plan, "free");
  });

  it("founder admin can assign Business", async () => {
    const state = installMock();
    seedPlan(state, WORKSPACE_ID, "free");

    const result = await changeWorkspacePlan({
      workspaceId: WORKSPACE_ID,
      targetPlan: "business",
      source: "founder_admin",
      actorUserId: ACTOR_ID,
      allowAdminOverride: true,
      now: NOW,
    });

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.newStoredPlan, "business");
      assert.equal(result.newEffectivePlan, "business");
    }
  });

  it("founder admin can downgrade Business → Starter", async () => {
    const state = installMock();
    seedPlan(state, WORKSPACE_ID, "business");
    seedSubscription(state, WORKSPACE_ID, {
      plan: "business",
      status: "active",
      trial_starts_at: null,
      trial_ends_at: null,
      current_period_starts_at: NOW.toISOString(),
      current_period_ends_at: FUTURE_TRIAL_END,
    });

    const result = await changeWorkspacePlan({
      workspaceId: WORKSPACE_ID,
      targetPlan: "starter",
      source: "founder_admin",
      actorUserId: ACTOR_ID,
      allowAdminOverride: true,
      now: NOW,
    });

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.newEffectivePlan, "starter");
    }
  });

  it("rejects enterprise in mutation service validation", async () => {
    const result = await changeWorkspacePlan({
      workspaceId: WORKSPACE_ID,
      targetPlan: "enterprise" as "starter",
      source: "customer_settings",
      actorUserId: ACTOR_ID,
      now: NOW,
    });

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, "INVALID_PLAN");
    }
  });
});

describe("changeWorkspacePlan atomic integration contracts", () => {
  it("uses executeAtomicWorkspacePlanChange instead of split writes", () => {
    const changeSrc = readFileSync("lib/billing/changeWorkspacePlan.ts", "utf8");
    const atomicSrc = readFileSync("lib/billing/atomicChangeWorkspacePlan.ts", "utf8");
    assert.match(changeSrc, /executeAtomicWorkspacePlanChange\(/);
    assert.doesNotMatch(changeSrc, /setWorkspacePlan\(/);
    assert.doesNotMatch(changeSrc, /syncWorkspaceSubscription\(/);
    assert.match(atomicSrc, /rpc_change_workspace_plan_atomic/);
  });
});

describe("setWorkspacePlanAction authorization contracts", () => {
  it("requires workspace membership via requireWorkspaceForApi", () => {
    const src = readFileSync("app/[workspaceId]/settings/actions.ts", "utf8");
    assert.match(src, /requireWorkspaceForApi\(workspaceId\)/);
    assert.match(src, /changeWorkspacePlan\(/);
    assert.doesNotMatch(src, /setWorkspacePlan\(/);
  });

  it("requires workspace owner role for plan changes", () => {
    const src = readFileSync("app/[workspaceId]/settings/actions.ts", "utf8");
    assert.match(src, /membership\.role !== "owner"/);
    assert.match(src, /Only workspace owners can change the plan/);
  });

  it("rejects enterprise at the action boundary", () => {
    const src = readFileSync("app/[workspaceId]/settings/actions.ts", "utf8");
    assert.match(src, /plan === "enterprise"/);
    assert.match(src, /Enterprise plans require Contact Sales/);
    assert.doesNotMatch(src, /plan === "business" \|\| plan === "enterprise"/);
  });

  it("returns success only from changeWorkspacePlan result", () => {
    const src = readFileSync("app/[workspaceId]/settings/actions.ts", "utf8");
    assert.match(src, /if \(!result\.ok\)/);
    assert.match(src, /message: result\.message/);
    assert.match(src, /effectivePlan: result\.newEffectivePlan/);
  });
});

describe("admin plan action contracts", () => {
  it("routes founder admin plan changes through changeWorkspacePlan", () => {
    const src = readFileSync("app/admin/actions.ts", "utf8");
    assert.match(src, /source: "founder_admin"/);
    assert.match(src, /effectivePlan: result\.newEffectivePlan/);
    assert.doesNotMatch(src, /async function syncWorkspaceSubscriptionPlan/);
  });

  it("audit logs Business transitions with effective plan metadata", () => {
    const src = readFileSync("app/admin/actions.ts", "utf8");
    assert.match(src, /newEffectivePlan: result\.newEffectivePlan/);
    assert.match(src, /previousEffectivePlan: result\.previousEffectivePlan/);
  });

  it("includes Business in admin plan selector options", () => {
    const src = readFileSync("app/admin/_components/ChangeWorkspacePlanForm.tsx", "utf8");
    assert.match(src, /"business"/);
  });
});
