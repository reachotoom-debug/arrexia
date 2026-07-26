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

  it("rejects enterprise, business, free, and arbitrary strings", () => {
    for (const rejected of ["enterprise", "business", "free", "internal", ""]) {
      assert.equal(parsePublicSignupTrialPlan(rejected), null);
      assert.equal(isPublicSignupTrialPlan(rejected), false);
    }
  });

  it("resolveBootstrapWorkspacePlan maps allowlisted plans only", () => {
    assert.equal(resolveBootstrapWorkspacePlan("starter"), "starter");
    assert.equal(resolveBootstrapWorkspacePlan("pro"), "pro");
    assert.equal(resolveBootstrapWorkspacePlan(null), "free");
    assert.equal(resolveBootstrapWorkspacePlan(parsePublicSignupTrialPlan("enterprise")), "free");
  });
});

describe("trialHref marketing CTAs", () => {
  it("preserves Starter intent", () => {
    assert.equal(marketingTrialHref("starter"), "/register?plan=starter");
  });

  it("preserves Pro intent", () => {
    assert.equal(marketingTrialHref("pro"), "/register?plan=pro");
  });

  it("generic and business CTAs omit plan param", () => {
    assert.equal(marketingTrialHref(), "/register");
    assert.equal(marketingTrialHref("business"), "/register");
  });
});
