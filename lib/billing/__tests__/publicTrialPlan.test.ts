import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  isPublicSignupTrialPlan,
  parsePublicSignupTrialPlan,
  resolveBootstrapWorkspacePlan,
} from "@/lib/billing/publicTrialPlan";

// Re-import trialHref from plans for integration with marketing CTAs
import { trialHref as marketingTrialHref } from "@/lib/billing/plans";

describe("public signup trial plan allowlisting", () => {
  it("accepts starter and pro", () => {
    assert.equal(parsePublicSignupTrialPlan("starter"), "starter");
    assert.equal(parsePublicSignupTrialPlan("PRO"), "pro");
    assert.equal(isPublicSignupTrialPlan("starter"), true);
    assert.equal(isPublicSignupTrialPlan("pro"), true);
  });

  it("rejects enterprise, free, and arbitrary strings as marketing intent", () => {
    for (const rejected of ["enterprise", "free", "internal", ""]) {
      assert.equal(parsePublicSignupTrialPlan(rejected), null);
      assert.equal(isPublicSignupTrialPlan(rejected), false);
    }
  });

  it("accepts business as marketing intent only", () => {
    assert.equal(parsePublicSignupTrialPlan("business"), "business");
  });

  it("resolveBootstrapWorkspacePlan always returns free shell plan", () => {
    assert.equal(resolveBootstrapWorkspacePlan("starter"), "free");
    assert.equal(resolveBootstrapWorkspacePlan("pro"), "free");
    assert.equal(resolveBootstrapWorkspacePlan("business"), "free");
    assert.equal(resolveBootstrapWorkspacePlan(null), "free");
    assert.equal(resolveBootstrapWorkspacePlan(parsePublicSignupTrialPlan("enterprise")), "free");
  });
});

describe("trialHref marketing CTAs", () => {
  it("preserves marketing attribution params", () => {
    assert.equal(marketingTrialHref("starter"), "/register?plan=starter");
    assert.equal(marketingTrialHref("pro"), "/register?plan=pro");
    assert.equal(marketingTrialHref("business"), "/register?plan=business");
  });

  it("generic CTA omits plan param", () => {
    assert.equal(marketingTrialHref(), "/register");
  });
});
