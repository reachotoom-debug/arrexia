import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import "./testSetup";

import { changeWorkspacePlan } from "@/lib/billing/changeWorkspacePlan";
import { computePaidPeriodEnd } from "@/lib/billing/billingPeriod";
import { getPlanStorageLimits, PLAN_DEFINITIONS } from "@/lib/billing/plans";
import { resolveWorkspaceEntitlement } from "@/lib/billing/resolveWorkspaceEntitlement";
import { CUSTOMER_PAID_ACTIVATION_BLOCKED_MESSAGE } from "@/lib/billing/planMutationPolicy";
import { setSupabaseAdminClientForTests } from "@/lib/supabase/admin";

import {
  createBillingMockAdmin,
  createBillingMockState,
  seedPlan,
  seedSubscription,
  seedWorkspace,
} from "./billingMutationMock";

const WORKSPACE_ID = "ws-annual-billing";
const ACTOR_ID = "user-founder";
const NOW = new Date("2026-07-26T12:00:00.000Z");
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

describe("annual billing lifecycle V1", () => {
  for (const targetPlan of ["starter", "pro", "business"] as const) {
    it(`founder admin activates ${targetPlan} monthly with calendar-month period`, async () => {
      const state = installMock();
      seedPlan(state, WORKSPACE_ID, "free");

      const result = await changeWorkspacePlan({
        workspaceId: WORKSPACE_ID,
        targetPlan,
        source: "founder_admin",
        actorUserId: ACTOR_ID,
        billingInterval: "monthly",
        now: NOW,
      });

      assert.equal(result.ok, true);
      const sub = state.subscriptions[0];
      assert.equal(sub?.status, "active");
      assert.equal(sub?.plan, targetPlan);
      assert.equal(sub?.billing_interval, "monthly");
      assert.equal(sub?.current_period_starts_at, NOW.toISOString());
      assert.equal(
        sub?.current_period_ends_at,
        computePaidPeriodEnd(NOW, "monthly").toISOString()
      );
    });

    it(`founder admin activates ${targetPlan} annual with calendar-year period`, async () => {
      const state = installMock();
      seedPlan(state, WORKSPACE_ID, "free");

      const result = await changeWorkspacePlan({
        workspaceId: WORKSPACE_ID,
        targetPlan,
        source: "founder_admin",
        actorUserId: ACTOR_ID,
        billingInterval: "annual",
        now: NOW,
      });

      assert.equal(result.ok, true);
      const sub = state.subscriptions[0];
      assert.equal(sub?.billing_interval, "annual");
      assert.equal(
        sub?.current_period_ends_at,
        computePaidPeriodEnd(NOW, "annual").toISOString()
      );
    });
  }

  it("defaults to monthly when billingInterval omitted", async () => {
    const state = installMock();
    seedPlan(state, WORKSPACE_ID, "free");

    const result = await changeWorkspacePlan({
      workspaceId: WORKSPACE_ID,
      targetPlan: "pro",
      source: "founder_admin",
      actorUserId: ACTOR_ID,
      now: NOW,
    });

    assert.equal(result.ok, true);
    assert.equal(state.subscriptions[0]?.billing_interval, "monthly");
  });

  it("expired trial → annual paid activation succeeds for founder admin", async () => {
    const state = installMock();
    seedPlan(state, WORKSPACE_ID, "free");
    seedSubscription(state, WORKSPACE_ID, {
      plan: "free",
      status: "trial",
      billing_interval: "monthly",
      trial_starts_at: "2026-07-01T00:00:00.000Z",
      trial_ends_at: PAST_TRIAL_END,
      current_period_starts_at: null,
      current_period_ends_at: null,
    });

    const result = await changeWorkspacePlan({
      workspaceId: WORKSPACE_ID,
      targetPlan: "pro",
      source: "founder_admin",
      actorUserId: ACTOR_ID,
      billingInterval: "annual",
      now: NOW,
    });

    assert.equal(result.ok, true);
    assert.equal(state.subscriptions[0]?.billing_interval, "annual");
    assert.equal(state.subscriptions[0]?.status, "active");
  });

  it("customer annual activation remains blocked", async () => {
    const state = installMock();
    seedPlan(state, WORKSPACE_ID, "free");

    const result = await changeWorkspacePlan({
      workspaceId: WORKSPACE_ID,
      targetPlan: "pro",
      source: "customer_settings",
      actorUserId: ACTOR_ID,
      billingInterval: "annual",
      now: NOW,
    });

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, "PAYMENT_PROVIDER_REQUIRED");
      assert.equal(result.error, CUSTOMER_PAID_ACTIVATION_BLOCKED_MESSAGE);
    }
    assert.equal(state.subscriptions.length, 0);
  });

  it("atomic RPC failure leaves billing tables unchanged", async () => {
    const state = installMock();
    seedPlan(state, WORKSPACE_ID, "free");
    state.atomicRpcShouldFail = true;

    const result = await changeWorkspacePlan({
      workspaceId: WORKSPACE_ID,
      targetPlan: "starter",
      source: "founder_admin",
      actorUserId: ACTOR_ID,
      billingInterval: "annual",
      now: NOW,
    });

    assert.equal(result.ok, false);
    assert.equal(state.subscriptions.length, 0);
    assert.equal(state.plans[0]?.plan, "free");
  });

  it("same plan + same interval is a no-op for founder admin", async () => {
    const state = installMock();
    seedPlan(state, WORKSPACE_ID, "pro");
    seedSubscription(state, WORKSPACE_ID, {
      plan: "pro",
      status: "active",
      billing_interval: "annual",
      trial_starts_at: null,
      trial_ends_at: null,
      current_period_starts_at: "2026-08-22T02:22:15.052Z",
      current_period_ends_at: "2027-08-22T02:22:15.052Z",
    });
    const subscriptionsBefore = state.subscriptions.length;

    const result = await changeWorkspacePlan({
      workspaceId: WORKSPACE_ID,
      targetPlan: "pro",
      source: "founder_admin",
      actorUserId: ACTOR_ID,
      billingInterval: "annual",
      now: NOW,
    });

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.transitionType, "no_op");
    }
    assert.equal(state.subscriptions.length, subscriptionsBefore);
    assert.equal(state.subscriptions[0]?.billing_interval, "annual");
    assert.equal(state.subscriptions[0]?.current_period_ends_at, "2027-08-22T02:22:15.052Z");
  });

  it("Pro Annual → Pro Monthly persists interval and recalculates monthly period", async () => {
    const state = installMock();
    seedPlan(state, WORKSPACE_ID, "pro");
    seedSubscription(state, WORKSPACE_ID, {
      plan: "pro",
      status: "active",
      billing_interval: "annual",
      trial_starts_at: null,
      trial_ends_at: null,
      current_period_starts_at: "2026-08-22T02:22:15.052Z",
      current_period_ends_at: "2027-08-22T02:22:15.052Z",
    });

    const result = await changeWorkspacePlan({
      workspaceId: WORKSPACE_ID,
      targetPlan: "pro",
      source: "founder_admin",
      actorUserId: ACTOR_ID,
      billingInterval: "monthly",
      now: NOW,
    });

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.transitionType, "admin_assignment");
      assert.equal(result.newStoredPlan, "pro");
    }
    const sub = state.subscriptions[0];
    assert.equal(sub?.plan, "pro");
    assert.equal(sub?.status, "active");
    assert.equal(sub?.billing_interval, "monthly");
    assert.equal(sub?.current_period_starts_at, NOW.toISOString());
    assert.equal(
      sub?.current_period_ends_at,
      computePaidPeriodEnd(NOW, "monthly").toISOString()
    );
  });

  it("Pro Monthly → Pro Annual persists interval and recalculates annual period", async () => {
    const state = installMock();
    seedPlan(state, WORKSPACE_ID, "pro");
    seedSubscription(state, WORKSPACE_ID, {
      plan: "pro",
      status: "active",
      billing_interval: "monthly",
      trial_starts_at: null,
      trial_ends_at: null,
      current_period_starts_at: NOW.toISOString(),
      current_period_ends_at: computePaidPeriodEnd(NOW, "monthly").toISOString(),
    });

    const result = await changeWorkspacePlan({
      workspaceId: WORKSPACE_ID,
      targetPlan: "pro",
      source: "founder_admin",
      actorUserId: ACTOR_ID,
      billingInterval: "annual",
      now: NOW,
    });

    assert.equal(result.ok, true);
    const sub = state.subscriptions[0];
    assert.equal(sub?.plan, "pro");
    assert.equal(sub?.billing_interval, "annual");
    assert.equal(sub?.current_period_starts_at, NOW.toISOString());
    assert.equal(
      sub?.current_period_ends_at,
      computePaidPeriodEnd(NOW, "annual").toISOString()
    );
  });

  it("customer interval-only change on current paid plan remains blocked", async () => {
    const state = installMock();
    seedPlan(state, WORKSPACE_ID, "pro");
    seedSubscription(state, WORKSPACE_ID, {
      plan: "pro",
      status: "active",
      billing_interval: "annual",
      trial_starts_at: null,
      trial_ends_at: null,
      current_period_starts_at: NOW.toISOString(),
      current_period_ends_at: computePaidPeriodEnd(NOW, "annual").toISOString(),
    });

    const result = await changeWorkspacePlan({
      workspaceId: WORKSPACE_ID,
      targetPlan: "pro",
      source: "customer_settings",
      actorUserId: ACTOR_ID,
      billingInterval: "monthly",
      now: NOW,
    });

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, "PAYMENT_PROVIDER_REQUIRED");
    }
    assert.equal(state.subscriptions[0]?.billing_interval, "annual");
  });

  it("monthly and annual share the same entitlement limits per plan", () => {
    for (const plan of ["starter", "pro", "business"] as const) {
      const limits = getPlanStorageLimits(plan);
      const monthlyEntitlement = resolveWorkspaceEntitlement({
        storedPlan: plan,
        subscription: {
          status: "active",
          plan,
          billingInterval: "monthly",
          trialStartsAt: null,
          trialEndsAt: null,
          trialConsumedAt: "2026-01-01T00:00:00.000Z",
          currentPeriodStartsAt: NOW.toISOString(),
          currentPeriodEndsAt: computePaidPeriodEnd(NOW, "monthly").toISOString(),
        },
        paidLimits: {
          clientLimit: limits.client_limit,
          invoiceLimitMonthly: limits.invoice_limit_monthly,
          workspaceMemberLimit: PLAN_DEFINITIONS[plan].workspaceMemberLimit,
        },
      });
      const annualEntitlement = resolveWorkspaceEntitlement({
        storedPlan: plan,
        subscription: {
          status: "active",
          plan,
          billingInterval: "annual",
          trialStartsAt: null,
          trialEndsAt: null,
          trialConsumedAt: "2026-01-01T00:00:00.000Z",
          currentPeriodStartsAt: NOW.toISOString(),
          currentPeriodEndsAt: computePaidPeriodEnd(NOW, "annual").toISOString(),
        },
        paidLimits: {
          clientLimit: limits.client_limit,
          invoiceLimitMonthly: limits.invoice_limit_monthly,
          workspaceMemberLimit: PLAN_DEFINITIONS[plan].workspaceMemberLimit,
        },
      });

      assert.equal(monthlyEntitlement.clientLimit, annualEntitlement.clientLimit);
      assert.equal(
        monthlyEntitlement.invoiceLimitMonthly,
        annualEntitlement.invoiceLimitMonthly
      );
      assert.equal(monthlyEntitlement.state, "paid");
      assert.equal(annualEntitlement.state, "paid");
    }
  });
});
