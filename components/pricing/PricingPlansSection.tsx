"use client";

import { useState } from "react";
import { PricingBillingToggle } from "./PricingBillingToggle";
import { PricingCard } from "./PricingCard";
import { PricingComparison } from "./PricingComparison";
import {
  BillingInterval,
  BUSINESS_FEATURES,
  getProPricing,
  getStarterPricing,
  PRO_FEATURES,
  STARTER_FEATURES,
  trialHref,
} from "./pricingPlans";
import { PLAN_DEFINITIONS } from "@/lib/billing/plans";

export function PricingPlansSection() {
  const [billingInterval, setBillingInterval] = useState<BillingInterval>("monthly");

  const starterPricing = getStarterPricing(billingInterval);
  const proPricing = getProPricing(billingInterval);

  return (
    <>
      <section id="pricing" className="scroll-mt-8 space-y-10 lg:space-y-12">
        <div className="text-center">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-blue-600">
            Pricing
          </p>
          <h2 className="mt-3 text-2xl font-semibold text-slate-900 sm:text-3xl lg:text-4xl">
            Plans built for cash recovery
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-base text-slate-600 sm:text-lg">
            Start with a 14-day free trial. Upgrade when FlowCollect starts saving
            you time and recovering overdue payments.
          </p>
        </div>

        <PricingBillingToggle value={billingInterval} onChange={setBillingInterval} />

        <div className="grid items-stretch gap-8 lg:grid-cols-3 lg:gap-6 xl:gap-8">
          <PricingCard
            name="Starter"
            price={starterPricing.price}
            period={starterPricing.period}
            equivalentSubtext={starterPricing.equivalentSubtext}
            savingsBadge={starterPricing.savingsBadge}
            subtitle="For freelancers & solo businesses"
            features={STARTER_FEATURES}
            ctaLabel="Start Free Trial"
            ctaHref={trialHref("starter")}
            showTrialMicrocopy
            footnote="Perfect for freelancers and small businesses."
          />

          <PricingCard
            name="Pro"
            price={proPricing.price}
            period={proPricing.period}
            equivalentSubtext={proPricing.equivalentSubtext}
            savingsBadge={proPricing.savingsBadge}
            subtitle="For growing agencies & SMBs"
            features={PRO_FEATURES}
            ctaLabel="Start Pro Trial"
            ctaHref={trialHref("pro")}
            highlight
            badgeLabel="Most Popular"
            secondaryBadge={billingInterval === "annual" ? "Best value" : undefined}
            showTrialMicrocopy
            footnote="Built for growing businesses managing real receivables."
          />

          <PricingCard
            name="Business"
            price={`$${PLAN_DEFINITIONS.business.monthlyPrice}`}
            period="/mo"
            subtitle="For larger teams"
            features={BUSINESS_FEATURES}
            ctaLabel="Coming soon"
            disabled
            footnote="Higher limits and team controls — coming soon."
          />
        </div>
      </section>

      <PricingComparison />
    </>
  );
}
