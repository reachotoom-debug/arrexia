"use client";

import { useState } from "react";
import { PricingBillingToggle } from "./PricingBillingToggle";
import { PricingCard } from "./PricingCard";
import {
  BillingInterval,
  BUSINESS_FEATURES,
  getProPricing,
  getStarterPricing,
  getPublicTeaserPriceDisplay,
  PRO_FEATURES,
  STARTER_FEATURES,
  trialHref,
} from "./pricingPlans";

export function PricingPlansClient() {
  const [billingInterval, setBillingInterval] = useState<BillingInterval>("monthly");

  const starterPricing = getStarterPricing(billingInterval);
  const proPricing = getProPricing(billingInterval);

  return (
    <>
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
          price={getPublicTeaserPriceDisplay("business").price}
          period="/mo"
          subtitle="For larger teams"
          features={BUSINESS_FEATURES}
          ctaLabel="Coming soon"
          disabled
          footnote="Higher limits and team controls — coming soon."
        />
      </div>
    </>
  );
}
