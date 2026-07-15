"use client";

import { useState } from "react";
import { PricingBillingToggle } from "./PricingBillingToggle";
import { PricingCard } from "./PricingCard";
import {
  BillingInterval,
  BUSINESS_FEATURES,
  getBusinessPricing,
  getEnterpriseContactHref,
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
  const businessPricing = getBusinessPricing(billingInterval);

  return (
    <>
      <PricingBillingToggle value={billingInterval} onChange={setBillingInterval} />

      <div className="grid items-stretch gap-8 md:grid-cols-2 xl:grid-cols-4 xl:gap-6">
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
          footnote="Built for finance teams managing receivables at scale."
        />

        <PricingCard
          name="Business"
          price={businessPricing.price}
          period={businessPricing.period}
          equivalentSubtext={businessPricing.equivalentSubtext}
          savingsBadge={businessPricing.savingsBadge}
          subtitle="For larger teams"
          features={BUSINESS_FEATURES}
          ctaLabel="Start Business Trial"
          ctaHref={trialHref("business")}
          showTrialMicrocopy
          footnote="Higher limits and team controls for scaling collections."
        />

        <PricingCard
          name="Enterprise"
          price={getPublicTeaserPriceDisplay("enterprise").price}
          period={null}
          subtitle="For organizations with custom needs"
          features={[
            { label: "Custom usage limits" },
            { label: "Dedicated onboarding" },
            { label: "Security review support" },
            { label: "Priority support" },
          ]}
          ctaLabel="Contact Sales"
          ctaHref={getEnterpriseContactHref()}
          footnote="Custom terms, security, and volume pricing."
        />
      </div>
    </>
  );
}
