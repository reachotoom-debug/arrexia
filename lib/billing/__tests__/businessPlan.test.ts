import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  getBillingPlanCardCta,
  isSelfServiceBillingPlan,
} from "@/lib/billing/billingPlanCardCta";
import {
  ASSIGNABLE_WORKSPACE_PLANS,
  getPlanDefinition,
  getPlanStorageLimits,
  isWorkspacePlan,
} from "@/lib/billing/plans";
import { canManageReminderRules } from "@/lib/billing/reminderRulesAccess";
import { resolveEffectiveWorkspacePlan } from "@/lib/billing/resolveEffectiveWorkspacePlan";
import type { WorkspaceSubscriptionSnapshot } from "@/lib/billing/workspaceSubscription";

const NOW = new Date("2026-07-26T12:00:00.000Z");

function activeSubscription(plan: "starter" | "pro" | "business"): WorkspaceSubscriptionSnapshot {
  return {
    status: "active",
    plan,
    trialStartsAt: null,
    trialEndsAt: null,
    trialConsumedAt: null,
    currentPeriodStartsAt: NOW.toISOString(),
    currentPeriodEndsAt: "2027-01-01T00:00:00.000Z",
  };
}

describe("Business plan catalog", () => {
  it("accepts business in workspace plan validation", () => {
    assert.equal(isWorkspacePlan("business"), true);
    assert.equal(ASSIGNABLE_WORKSPACE_PLANS.includes("business"), true);
  });

  it("resolves active Business subscription as effective Business", () => {
    const result = resolveEffectiveWorkspacePlan(
      "business",
      activeSubscription("business"),
      NOW
    );
    assert.equal(result.effectivePlan, "business");
    assert.equal(result.entitlementSource, "paid_subscription");
  });

  it("does not fall back to Pro or Free for stored Business", () => {
    const result = resolveEffectiveWorkspacePlan("business", null, NOW);
    assert.equal(result.effectivePlan, "business");
    assert.notEqual(result.effectivePlan, "pro");
    assert.notEqual(result.effectivePlan, "free");
  });

  it("uses null limits as unlimited semantics from the catalog", () => {
    const limits = getPlanStorageLimits("business");
    assert.equal(limits.client_limit, null);
    assert.equal(limits.invoice_limit_monthly, null);
    assert.equal(getPlanDefinition("business").workspaceMemberLimit, null);
    assert.equal(getPlanDefinition("business").monthlyPrice, 199);
  });
});

describe("billing plan card CTA matrix", () => {
  it("Free shows Upgrade to Starter and Pro", () => {
    assert.equal(getBillingPlanCardCta("free", "starter").label, "Upgrade to Starter");
    assert.equal(getBillingPlanCardCta("free", "pro").label, "Upgrade to Pro");
  });

  it("Starter shows Current plan on Starter and Upgrade to Pro", () => {
    assert.equal(getBillingPlanCardCta("starter", "starter").label, "Current plan");
    assert.equal(getBillingPlanCardCta("starter", "pro").label, "Upgrade to Pro");
  });

  it("Pro shows disabled Select plan for Starter and Current plan on Pro", () => {
    assert.equal(getBillingPlanCardCta("pro", "starter").label, "Select plan");
    assert.equal(getBillingPlanCardCta("pro", "pro").label, "Current plan");
  });

  it("Free shows Upgrade to Business", () => {
    const cta = getBillingPlanCardCta("free", "business");
    assert.equal(cta.label, "Upgrade to Business");
    assert.equal(cta.canSubmit, true);
  });

  it("Starter shows Upgrade to Business", () => {
    const cta = getBillingPlanCardCta("starter", "business");
    assert.equal(cta.label, "Upgrade to Business");
    assert.equal(cta.canSubmit, true);
  });

  it("Pro shows Upgrade to Business", () => {
    const cta = getBillingPlanCardCta("pro", "business");
    assert.equal(cta.label, "Upgrade to Business");
    assert.equal(cta.canSubmit, true);
  });

  it("Business shows Current plan on Business card", () => {
    const cta = getBillingPlanCardCta("business", "business");
    assert.equal(cta.label, "Current plan");
    assert.equal(cta.canSubmit, false);
  });

  it("Business → Pro control is disabled with support message", () => {
    const cta = getBillingPlanCardCta("business", "pro");
    assert.equal(cta.label, "Select plan");
    assert.equal(cta.canSubmit, false);
    assert.match(cta.disabledReason ?? "", /support/i);
  });

  it("Business → Starter control is disabled", () => {
    const cta = getBillingPlanCardCta("business", "starter");
    assert.equal(cta.canSubmit, false);
    assert.equal(cta.label, "Select plan");
  });

  it("disabled downgrade never submits", () => {
    const cta = getBillingPlanCardCta("business", "starter");
    assert.equal(cta.canSubmit, false);
  });

  it("downgrade CTAs use Select plan label", () => {
    assert.equal(getBillingPlanCardCta("business", "starter").label, "Select plan");
    assert.equal(getBillingPlanCardCta("pro", "starter").label, "Select plan");
  });

  it("billing UI plans are self-service tiers only", () => {
    assert.equal(isSelfServiceBillingPlan("business"), true);
    assert.equal(isSelfServiceBillingPlan("enterprise"), false);
  });
});

describe("Business entitlements", () => {
  it("treats null Business client limit as unlimited in enforcement semantics", () => {
    const limits = getPlanStorageLimits("business");
    assert.equal(limits.client_limit, null);
    const wouldBlock = limits.client_limit !== null && 999999 >= (limits.client_limit ?? 0);
    assert.equal(wouldBlock, false);
  });

  it("treats null Business invoice limit as unlimited in enforcement semantics", () => {
    const limits = getPlanStorageLimits("business");
    assert.equal(limits.invoice_limit_monthly, null);
    const overLimit = limits.invoice_limit_monthly !== null;
    assert.equal(overLimit, false);
  });

  it("grants paid-plan reminder rule access to Business", () => {
    assert.equal(canManageReminderRules("business"), true);
  });
});

describe("BillingPlansClient CTA wiring", () => {
  it("uses explicit upgrade labels and per-card CTA helper", () => {
    const src = readFileSync(
      "app/[workspaceId]/settings/_components/BillingPlansClient.tsx",
      "utf8"
    );
    assert.match(src, /getBillingPlanCardCta/);
    assert.match(src, /pendingPlanId/);
    assert.match(src, /cta\.canSubmit/);
    assert.doesNotMatch(src, /Select plan/);
  });
});
