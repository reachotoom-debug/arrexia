import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  formatPublicTrialMicrocopy,
  getPublicAnnualPricingDetails,
  getPublicPlanPricing,
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

  it("derives annual normal values, savings, and equivalents from frozen contract", () => {
    const starter = getPublicAnnualPricingDetails("starter");
    assert.equal(starter.annualCharge, 390);
    assert.equal(starter.normalAnnualValue, 468);
    assert.equal(starter.savingsAmount, 78);
    assert.equal(starter.monthlyEquivalentFormatted, "$32.50");

    const pro = getPublicAnnualPricingDetails("pro");
    assert.equal(pro.annualCharge, 890);
    assert.equal(pro.normalAnnualValue, 1068);
    assert.equal(pro.savingsAmount, 178);
    assert.equal(pro.monthlyEquivalentFormatted, "$74.17");

    const business = getPublicAnnualPricingDetails("business");
    assert.equal(business.annualCharge, 1990);
    assert.equal(business.normalAnnualValue, 2388);
    assert.equal(business.savingsAmount, 398);
    assert.equal(business.monthlyEquivalentFormatted, "$165.83");
  });

  it("annual plan pricing displays charge, normal value, savings, and equivalent", () => {
    const starter = getPublicPlanPricing("starter", "annual");
    assert.equal(starter.price, "$390");
    assert.equal(starter.period, "/year");
    assert.match(starter.normalValueSubtext ?? "", /\$468 normally/);
    assert.match(starter.savingsBadge ?? "", /Save \$78/);
    assert.match(starter.savingsBadge ?? "", /2 months free/);
    assert.match(starter.equivalentSubtext ?? "", /\$32\.50\/mo billed annually/);

    const pro = getPublicPlanPricing("pro", "annual");
    assert.equal(pro.price, "$890");
    assert.match(pro.normalValueSubtext ?? "", /\$1,068 normally/);
    assert.match(pro.savingsBadge ?? "", /Save \$178/);
    assert.match(pro.equivalentSubtext ?? "", /\$74\.17\/mo billed annually/);
  });

  it("communicates annual two months free on toggle label", () => {
    assert.match(PUBLIC_PRICING.annualToggleLabel, /2 months free/);
  });

  it("pricingPlans does not advertise workspace member limits", () => {
    const src = readFileSync("components/pricing/pricingPlans.ts", "utf8");
    assert.doesNotMatch(src, /workspace member/i);
  });

  it("BUSINESS_CAPACITY communicates unlimited clients and invoices", () => {
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
    assert.match(cardSrc, /Plan capacity/);

    const plansSrc = readFileSync("components/pricing/PricingPlansClient.tsx", "utf8");
    assert.match(plansSrc, /showTrialMicrocopy/);
    assert.doesNotMatch(plansSrc, /250 clients during your trial/i);
    assert.doesNotMatch(plansSrc, /500 invoices during your trial/i);
  });

  it("CTA hrefs preserve marketing attribution without plan-specific trial copy", () => {
    const plansSrc = readFileSync("components/pricing/PricingPlansClient.tsx", "utf8");
    assert.match(plansSrc, /trialHref\("starter"\)/);
    assert.match(plansSrc, /trialHref\("pro"\)/);
    assert.match(plansSrc, /trialHref\("business"\)/);
    assert.match(plansSrc, /Start Free Trial/);
    assert.match(plansSrc, /Contact Sales/);
  });

  it("pricing page includes business-value positioning without guaranteed ROI claims", () => {
    const heroSrc = readFileSync("components/pricing/PricingHero.tsx", "utf8");
    assert.match(heroSrc, /Turn overdue invoices into recovered cash/);
    assert.match(heroSrc, /accounting software stops/i);

    const pillarsSrc = readFileSync("components/pricing/PricingValuePillars.tsx", "utf8");
    assert.match(pillarsSrc, /Recover cash sooner/);
    assert.match(pillarsSrc, /Reduce manual chasing/);
    assert.match(pillarsSrc, /Run collections with control/);

    const roiSrc = readFileSync("components/pricing/PricingROI.tsx", "utf8");
    assert.doesNotMatch(roiSrc, /Recover a \$500 invoice/i);
    assert.doesNotMatch(roiSrc, /pays for itself/i);
    assert.doesNotMatch(roiSrc, /guaranteed/i);
  });
});
