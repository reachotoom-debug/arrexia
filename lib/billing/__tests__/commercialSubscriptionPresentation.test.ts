import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { getCommercialSubscriptionPresentation } from "@/lib/billing/commercialSubscriptionPresentation";

describe("commercialSubscriptionPresentation", () => {
  it("active trial label is not Free", () => {
    const presentation = getCommercialSubscriptionPresentation({
      entitlementState: "trial",
      paidPlan: null,
      trial: {
        status: "active",
        daysRemaining: 12,
        trialEndsAt: "2026-08-09T00:00:00.000Z",
        trialStartsAt: "2026-07-26T00:00:00.000Z",
      },
    });
    assert.notEqual(presentation.planLabel, "Free");
    assert.equal(presentation.planLabel, "Arrexia Free Trial");
  });

  it("active trial label is not Starter", () => {
    const presentation = getCommercialSubscriptionPresentation({
      entitlementState: "trial",
      paidPlan: null,
      trial: {
        status: "active",
        daysRemaining: 5,
        trialEndsAt: "2026-08-09T00:00:00.000Z",
        trialStartsAt: "2026-07-26T00:00:00.000Z",
      },
    });
    assert.notEqual(presentation.planLabel, "Starter");
    assert.notEqual(presentation.sidebarLabel, "Starter");
  });

  it("sidebar trial display includes days remaining", () => {
    const presentation = getCommercialSubscriptionPresentation({
      entitlementState: "trial",
      paidPlan: null,
      trial: {
        status: "active",
        daysRemaining: 12,
        trialEndsAt: "2026-08-09T00:00:00.000Z",
        trialStartsAt: "2026-07-26T00:00:00.000Z",
      },
    });
    assert.match(presentation.sidebarLabel, /Free trial · 12 days left/);
  });

  it("paid Starter displays Starter", () => {
    const presentation = getCommercialSubscriptionPresentation({
      entitlementState: "paid",
      paidPlan: "starter",
      trial: null,
    });
    assert.equal(presentation.planLabel, "Starter");
  });

  it("paid Pro displays Pro", () => {
    const presentation = getCommercialSubscriptionPresentation({
      entitlementState: "paid",
      paidPlan: "pro",
      trial: null,
    });
    assert.equal(presentation.planLabel, "Pro");
  });

  it("paid Business displays Business", () => {
    const presentation = getCommercialSubscriptionPresentation({
      entitlementState: "paid",
      paidPlan: "business",
      trial: null,
    });
    assert.equal(presentation.planLabel, "Business");
  });

  it("trial expired displays Trial expired", () => {
    const presentation = getCommercialSubscriptionPresentation({
      entitlementState: "trial_expired",
      paidPlan: null,
      trial: {
        status: "expired",
        daysRemaining: 0,
        trialEndsAt: "2026-07-10T00:00:00.000Z",
        trialStartsAt: "2026-06-26T00:00:00.000Z",
      },
    });
    assert.equal(presentation.planLabel, "Trial expired");
    assert.equal(presentation.sidebarLabel, "Trial expired");
  });

  it("legacy free remains distinct", () => {
    const presentation = getCommercialSubscriptionPresentation({
      entitlementState: "legacy_free",
      paidPlan: null,
      trial: null,
    });
    assert.equal(presentation.planLabel, "Free");
    assert.notEqual(presentation.planLabel, "Arrexia Free Trial");
  });
});
