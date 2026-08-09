import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { afterEach, describe, it } from "node:test";

import "./testSetup";

import { changeWorkspacePlan } from "@/lib/billing/changeWorkspacePlan";
import {
  assertCustomerPaidActivationBlocked,
  CUSTOMER_PAID_ACTIVATION_BLOCKED_MESSAGE,
} from "@/lib/billing/planMutationPolicy";
import { getBillingUiPlanLimits } from "@/lib/billing/plans";
import { getBillingPlanCardCta } from "@/lib/billing/billingPlanCardCta";
import { setSupabaseAdminClientForTests } from "@/lib/supabase/admin";

import {
  createBillingMockAdmin,
  createBillingMockState,
  seedPlan,
  seedSubscription,
  seedWorkspace,
} from "./billingMutationMock";

const WORKSPACE_ID = "ws-billing-v1";
const ACTOR_ID = "user-owner";
const NOW = new Date("2026-07-26T12:00:00.000Z");

function installMock(state = createBillingMockState()) {
  seedWorkspace(state, WORKSPACE_ID);
  const admin = createBillingMockAdmin(state);
  setSupabaseAdminClientForTests(admin);
  return state;
}

afterEach(() => {
  setSupabaseAdminClientForTests(null);
});

describe("billing V1 commercial safety", () => {
  it("customer paid activation policy blocks paid assignable plans", () => {
    const blocked = assertCustomerPaidActivationBlocked("starter", "upgrade");
    assert.equal(blocked.ok, false);
    if (!blocked.ok) {
      assert.equal(blocked.code, "PAYMENT_PROVIDER_REQUIRED");
    }
    assert.equal(assertCustomerPaidActivationBlocked("starter", "no_op").ok, true);
  });

  it("customer_settings cannot self-grant Starter from free", async () => {
    const state = installMock();
    seedPlan(state, WORKSPACE_ID, "free");

    const result = await changeWorkspacePlan({
      workspaceId: WORKSPACE_ID,
      targetPlan: "starter",
      source: "customer_settings",
      actorUserId: ACTOR_ID,
      now: NOW,
    });

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, "PAYMENT_PROVIDER_REQUIRED");
      assert.equal(result.error, CUSTOMER_PAID_ACTIVATION_BLOCKED_MESSAGE);
    }
    assert.equal(state.plans[0]?.plan, "free");
  });

  it("founder_admin can still assign paid plans", async () => {
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
      assert.equal(result.newEffectivePlan, "starter");
    }
  });

  it("billing CTA cannot submit paid entitlement changes", () => {
    const ctx = { entitlementState: "trial" as const, paidPlan: null };
    const cta = getBillingPlanCardCta(ctx, "starter");
    assert.equal(cta.canSubmit, false);
    assert.equal(cta.href, "/contact");
  });

  it("provider IDs never enter client presentation model", () => {
    const clientSrc = readFileSync(
      "app/[workspaceId]/settings/_components/BillingPlansClient.tsx",
      "utf8"
    );
    assert.doesNotMatch(clientSrc, /provider_customer_id/);
    assert.doesNotMatch(clientSrc, /provider_subscription_id/);
    assert.doesNotMatch(clientSrc, /setWorkspacePlanAction/);
  });

  it("member meter is not displayed as hard quota in billing UI limits", () => {
    const starterLimits = getBillingUiPlanLimits("starter");
    assert.equal(starterLimits.some((line) => /member/i.test(line)), false);
    const proLimits = getBillingUiPlanLimits("pro");
    assert.equal(proLimits.some((line) => /member/i.test(line)), false);
  });

  it("trial expired billing client communicates read-only state", () => {
    const src = readFileSync(
      "app/[workspaceId]/settings/_components/BillingPlansClient.tsx",
      "utf8"
    );
    assert.match(src, /Trial expired/);
    assert.match(src, /creating or changing collection data requires[\s\S]*paid plan/);
  });
});

describe("billing V1 plan card CTA safety", () => {
  it("paid upgrade CTA routes to contact instead of self-submit", () => {
    const ctx = { entitlementState: "paid" as const, paidPlan: "starter" as const };
    const cta = getBillingPlanCardCta(ctx, "pro");
    assert.equal(cta.canSubmit, false);
    assert.equal(cta.href, "/contact");
  });

  it("current paid plan remains disabled without href", () => {
    const ctx = { entitlementState: "paid" as const, paidPlan: "pro" as const };
    const cta = getBillingPlanCardCta(ctx, "pro");
    assert.equal(cta.label, "Current plan");
    assert.equal(cta.canSubmit, false);
    assert.equal(cta.href, undefined);
  });
});

describe("billing V1 no-op customer selection", () => {
  it("customer can no-op select current paid plan", async () => {
    const state = installMock();
    seedPlan(state, WORKSPACE_ID, "starter");
    seedSubscription(state, WORKSPACE_ID, {
      plan: "starter",
      status: "active",
      trial_starts_at: null,
      trial_ends_at: null,
      current_period_starts_at: NOW.toISOString(),
      current_period_ends_at: "2027-01-01T00:00:00.000Z",
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
    }
  });
});
