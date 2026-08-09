import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  assertCustomerPaidActivationBlocked,
  assertCustomerPlanChangeAllowed,
  classifyPlanTransition,
  needsSubscriptionRepair,
  resolveSubscriptionSyncMode,
} from "@/lib/billing/planMutationPolicy";
import { resolveEffectiveWorkspacePlan } from "@/lib/billing/resolveEffectiveWorkspacePlan";
import type { WorkspaceSubscriptionSnapshot } from "@/lib/billing/workspaceSubscription";

const NOW = new Date("2026-07-26T12:00:00.000Z");
const FUTURE_TRIAL_END = "2026-08-09T12:00:00.000Z";
const PAST_TRIAL_END = "2026-07-10T12:00:00.000Z";

function trialSubscription(
  plan: "starter" | "pro",
  trialEndsAt: string
): WorkspaceSubscriptionSnapshot {
  return {
    status: "trial",
    plan,
    trialStartsAt: "2026-07-12T12:00:00.000Z",
    trialEndsAt,
    trialConsumedAt: "2026-07-12T12:00:00.000Z",
    currentPeriodStartsAt: null,
    currentPeriodEndsAt: null,
  };
}

describe("planMutationPolicy", () => {
  it("classifies Free → Starter as upgrade for customer settings", () => {
    const resolution = resolveEffectiveWorkspacePlan("free", null, NOW);
    const transition = classifyPlanTransition(
      resolution.effectivePlan,
      "starter",
      resolution,
      "customer_settings",
      NOW
    );
    assert.equal(transition, "upgrade");
    assert.equal(assertCustomerPlanChangeAllowed("free", "starter", transition).ok, true);
  });

  it("classifies Free → Pro as upgrade", () => {
    const resolution = resolveEffectiveWorkspacePlan("free", null, NOW);
    const transition = classifyPlanTransition(
      resolution.effectivePlan,
      "pro",
      resolution,
      "customer_settings",
      NOW
    );
    assert.equal(transition, "upgrade");
  });

  it("classifies expired Starter trial → Starter as reactivation", () => {
    const resolution = resolveEffectiveWorkspacePlan(
      "starter",
      trialSubscription("starter", PAST_TRIAL_END),
      NOW
    );
    assert.equal(resolution.effectivePlan, "free");
    const transition = classifyPlanTransition(
      resolution.effectivePlan,
      "starter",
      resolution,
      "customer_settings",
      NOW
    );
    assert.equal(transition, "reactivation");
    assert.equal(assertCustomerPlanChangeAllowed("free", "starter", transition).ok, true);
  });

  it("classifies expired Starter trial → Pro as reactivation", () => {
    const resolution = resolveEffectiveWorkspacePlan(
      "starter",
      trialSubscription("starter", PAST_TRIAL_END),
      NOW
    );
    const transition = classifyPlanTransition(
      resolution.effectivePlan,
      "pro",
      resolution,
      "customer_settings",
      NOW
    );
    assert.equal(transition, "reactivation");
  });

  it("classifies expired Pro trial → Pro as reactivation", () => {
    const resolution = resolveEffectiveWorkspacePlan(
      "pro",
      trialSubscription("pro", PAST_TRIAL_END),
      NOW
    );
    const transition = classifyPlanTransition(
      resolution.effectivePlan,
      "pro",
      resolution,
      "customer_settings",
      NOW
    );
    assert.equal(transition, "reactivation");
  });

  it("classifies active Starter trial → Pro as upgrade with trial plan change sync", () => {
    const resolution = resolveEffectiveWorkspacePlan(
      "starter",
      trialSubscription("starter", FUTURE_TRIAL_END),
      NOW
    );
    const transition = classifyPlanTransition(
      resolution.effectivePlan,
      "pro",
      resolution,
      "customer_settings",
      NOW
    );
    assert.equal(transition, "upgrade");
    const syncMode = resolveSubscriptionSyncMode(
      "pro",
      transition,
      resolution,
      "customer_settings",
      NOW
    );
    assert.equal(syncMode, "activate_paid");
  });

  it("blocks customer Pro → Starter downgrade", () => {
    const resolution = resolveEffectiveWorkspacePlan(
      "pro",
      {
        status: "active",
        plan: "pro",
        trialStartsAt: null,
        trialEndsAt: null,
        trialConsumedAt: null,
        currentPeriodStartsAt: NOW.toISOString(),
        currentPeriodEndsAt: FUTURE_TRIAL_END,
      },
      NOW
    );
    const transition = classifyPlanTransition(
      resolution.effectivePlan,
      "starter",
      resolution,
      "customer_settings",
      NOW
    );
    assert.equal(transition, "downgrade");
    const policy = assertCustomerPlanChangeAllowed("pro", "starter", transition);
    assert.equal(policy.ok, false);
    if (!policy.ok) {
      assert.equal(policy.code, "DOWNGRADE_REQUIRES_SUPPORT");
    }
  });

  it("blocks customer Starter → Free downgrade", () => {
    const resolution = resolveEffectiveWorkspacePlan(
      "starter",
      {
        status: "active",
        plan: "starter",
        trialStartsAt: null,
        trialEndsAt: null,
        trialConsumedAt: null,
        currentPeriodStartsAt: NOW.toISOString(),
        currentPeriodEndsAt: FUTURE_TRIAL_END,
      },
      NOW
    );
    const policy = assertCustomerPlanChangeAllowed(
      resolution.effectivePlan,
      "free",
      "downgrade"
    );
    assert.equal(policy.ok, false);
  });

  it("allows customer upgrades to Business", () => {
    const resolution = resolveEffectiveWorkspacePlan("free", null, NOW);
    const transition = classifyPlanTransition(
      resolution.effectivePlan,
      "business",
      resolution,
      "customer_settings",
      NOW
    );
    const policy = assertCustomerPlanChangeAllowed(
      resolution.effectivePlan,
      "business",
      transition
    );
    assert.equal(transition, "upgrade");
    assert.equal(policy.ok, true);
  });

  it("blocks customer Business downgrades", () => {
    const resolution = resolveEffectiveWorkspacePlan(
      "business",
      {
        status: "active",
        plan: "business",
        trialStartsAt: null,
        trialEndsAt: null,
        trialConsumedAt: null,
        currentPeriodStartsAt: NOW.toISOString(),
        currentPeriodEndsAt: FUTURE_TRIAL_END,
      },
      NOW
    );
    const toPro = assertCustomerPlanChangeAllowed(
      resolution.effectivePlan,
      "pro",
      "downgrade"
    );
    assert.equal(toPro.ok, false);
    if (!toPro.ok) {
      assert.equal(toPro.code, "DOWNGRADE_REQUIRES_SUPPORT");
    }
  });

  it("rejects free target for customers", () => {
    const unsupported = assertCustomerPlanChangeAllowed("starter", "free", "downgrade");
    assert.equal(unsupported.ok, false);
  });

  it("blocks customer paid activation until payment provider integration", () => {
    const blocked = assertCustomerPaidActivationBlocked("starter", "upgrade");
    assert.equal(blocked.ok, false);
    if (!blocked.ok) {
      assert.equal(blocked.code, "PAYMENT_PROVIDER_REQUIRED");
    }
    assert.equal(assertCustomerPaidActivationBlocked("starter", "no_op").ok, true);
  });

  it("allows founder admin assignment regardless of downgrade direction", () => {
    const resolution = resolveEffectiveWorkspacePlan(
      "pro",
      {
        status: "active",
        plan: "pro",
        trialStartsAt: null,
        trialEndsAt: null,
        trialConsumedAt: null,
        currentPeriodStartsAt: NOW.toISOString(),
        currentPeriodEndsAt: FUTURE_TRIAL_END,
      },
      NOW
    );
    const transition = classifyPlanTransition(
      resolution.effectivePlan,
      "free",
      resolution,
      "founder_admin",
      NOW
    );
    assert.equal(transition, "admin_assignment");
    const syncMode = resolveSubscriptionSyncMode(
      "free",
      transition,
      resolution,
      "founder_admin",
      NOW
    );
    assert.equal(syncMode, "admin_free");
  });

  it("detects subscription repair when stored paid plan diverges from effective free", () => {
    const resolution = resolveEffectiveWorkspacePlan(
      "starter",
      trialSubscription("starter", PAST_TRIAL_END),
      NOW
    );
    assert.equal(
      needsSubscriptionRepair(resolution, "starter", NOW),
      true
    );
  });

  it("treats identical effective/stored paid selection as no-op when subscription is healthy", () => {
    const resolution = resolveEffectiveWorkspacePlan(
      "starter",
      {
        status: "active",
        plan: "starter",
        trialStartsAt: null,
        trialEndsAt: null,
        trialConsumedAt: null,
        currentPeriodStartsAt: NOW.toISOString(),
        currentPeriodEndsAt: FUTURE_TRIAL_END,
      },
      NOW
    );
    const transition = classifyPlanTransition(
      resolution.effectivePlan,
      "starter",
      resolution,
      "customer_settings",
      NOW
    );
    assert.equal(transition, "no_op");
    assert.equal(needsSubscriptionRepair(resolution, "starter", NOW), false);
  });
});
