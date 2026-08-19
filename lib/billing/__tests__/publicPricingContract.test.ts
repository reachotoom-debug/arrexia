import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  formatPublicTrialMicrocopy,
  getPublicTrialMicrocopyLines,
  PLAN_DEFINITIONS,
  PUBLIC_PRICING,
} from "@/lib/billing/plans";
import {
  TRIAL_CLIENT_LIMIT,
  TRIAL_DURATION_DAYS,
  TRIAL_INVOICE_LIMIT_TOTAL,
} from "@/lib/billing/trialConfig";

describe("public pricing commercial contract", () => {
  it("centralizes trial duration and allowances from trialConfig", () => {
    assert.equal(TRIAL_DURATION_DAYS, 14);
    assert.equal(TRIAL_CLIENT_LIMIT, 50);
    assert.equal(TRIAL_INVOICE_LIMIT_TOTAL, 75);

    assert.equal(PUBLIC_PRICING.trialHeadline, "14-day free trial");
    assert.match(PUBLIC_PRICING.trialClientAllowanceLabel, /50 clients/);
    assert.match(PUBLIC_PRICING.trialInvoiceAllowanceLabel, /75 invoices during your trial/);
    assert.equal(PUBLIC_PRICING.trialMicrocopy, "No credit card required");

    const microcopy = formatPublicTrialMicrocopy();
    assert.match(microcopy, /14-day free trial/);
    assert.match(microcopy, /50 clients/);
    assert.match(microcopy, /75 invoices during your trial/);
    assert.match(microcopy, /No credit card required/);

    const lines = getPublicTrialMicrocopyLines();
    assert.equal(lines.length, 3);
    assert.match(lines[1], /50 clients/);
    assert.match(lines[1], /75 invoices during your trial/);
  });

  it("keeps canonical paid prices unchanged", () => {
    assert.equal(PLAN_DEFINITIONS.starter.monthlyPrice, 39);
    assert.equal(PLAN_DEFINITIONS.starter.annualPrice, 390);
    assert.equal(PLAN_DEFINITIONS.pro.monthlyPrice, 89);
    assert.equal(PLAN_DEFINITIONS.pro.annualPrice, 890);
    assert.equal(PLAN_DEFINITIONS.business.monthlyPrice, 199);
    assert.equal(PLAN_DEFINITIONS.business.annualPrice, 1990);
  });

  it("pricingPlans does not advertise workspace member limits", () => {
    const src = readFileSync("components/pricing/pricingPlans.ts", "utf8");
    assert.doesNotMatch(src, /workspace member/i);
  });

  it("BUSINESS_FEATURES communicates unlimited clients and invoices", () => {
    const src = readFileSync("components/pricing/pricingPlans.ts", "utf8");
    assert.match(src, /Unlimited clients and invoices/);
    assert.doesNotMatch(src, /Higher client and invoice volume/i);
    assert.doesNotMatch(src, /Higher volume/i);
  });

  it("PricingComparison uses unlimited Business limits and omits workspace members", () => {
    const src = readFileSync("components/pricing/PricingComparison.tsx", "utf8");
    assert.match(src, /business: "Unlimited"/);
    assert.doesNotMatch(src, /Workspace members/);
    assert.doesNotMatch(src, /Higher limits/);
    assert.match(src, /14-day free trial/);
    assert.match(src, /paid plan/i);
  });

  it("LandingPricingTeaser states unified trial terms and Business unlimited wording", () => {
    const src = readFileSync("components/landing/LandingPricingTeaser.tsx", "utf8");
    assert.match(src, /formatPublicTrialMicrocopy/);
    assert.match(src, /trialSameOnEveryPlanNote/);
    assert.match(src, /Unlimited clients and invoices/);
    assert.match(src, /After activation:/);
    assert.doesNotMatch(src, /Higher volume limits/i);
  });

  it("PricingFAQ no longer describes an ongoing free plan", () => {
    const src = readFileSync("components/pricing/PricingFAQ.tsx", "utf8");
    assert.doesNotMatch(src, /free plan/i);
    assert.match(src, /14-day trial ends/);
    assert.match(src, /paid plan/i);
  });

  it("paid plan cards clarify trial vs post-activation limits", () => {
    const cardSrc = readFileSync("components/pricing/PricingCard.tsx", "utf8");
    assert.match(cardSrc, /getPublicTrialMicrocopyLines/);
    assert.match(cardSrc, /paidLimitsNote/);

    const plansSrc = readFileSync("components/pricing/PricingPlansClient.tsx", "utf8");
    assert.match(plansSrc, /showTrialMicrocopy/);
    assert.doesNotMatch(plansSrc, /250 clients during your trial/i);
    assert.doesNotMatch(plansSrc, /500 invoices during your trial/i);
  });

  it("CTA hrefs preserve marketing attribution without plan-specific trial copy", () => {
    const teaserSrc = readFileSync("components/landing/LandingPricingTeaser.tsx", "utf8");
    assert.match(teaserSrc, /trialHref\("starter"\)/);
    assert.match(teaserSrc, /trialHref\("pro"\)/);
    assert.match(teaserSrc, /trialHref\("business"\)/);
    assert.match(teaserSrc, /Start Free Trial/);
  });
});
