"use client";

import { useState } from "react";
import { PricingBillingToggle } from "./PricingBillingToggle";
import { PricingCard } from "./PricingCard";
import {
  BillingInterval,
  BUSINESS_CAPACITY,
  BUSINESS_FEATURES,
  getBusinessPricing,
  getEnterpriseContactHref,
  getProPricing,
  getStarterPricing,
  getPublicTeaserPriceDisplay,
  PRO_CAPACITY,
  PRO_FEATURES,
  STARTER_CAPACITY,
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
          normalValueSubtext={starterPricing.normalValueSubtext}
          equivalentSubtext={starterPricing.equivalentSubtext}
          savingsBadge={starterPricing.savingsBadge}
          subtitle="Build a consistent collections process"
          capacityItems={STARTER_CAPACITY}
          features={STARTER_FEATURES}
          ctaLabel="Start Free Trial"
          ctaHref={trialHref("starter")}
          showTrialMicrocopy
          footnote="For smaller businesses replacing spreadsheets and ad-hoc payment chasing."
        />

        <PricingCard
          name="Pro"
          price={proPricing.price}
          period={proPricing.period}
          normalValueSubtext={proPricing.normalValueSubtext}
          equivalentSubtext={proPricing.equivalentSubtext}
          savingsBadge={proPricing.savingsBadge}
          subtitle="Run collections proactively"
          capacityItems={PRO_CAPACITY}
          features={PRO_FEATURES}
          ctaLabel="Start Free Trial"
          ctaHref={trialHref("pro")}
          highlight
          badgeLabel="Most Popular"
          secondaryBadge={billingInterval === "annual" ? "Best value" : undefined}
          showTrialMicrocopy
          footnote="For growing finance teams managing larger receivables portfolios and stronger workflows."
        />

        <PricingCard
          name="Business"
          price={businessPricing.price}
          period={businessPricing.period}
          normalValueSubtext={businessPricing.normalValueSubtext}
          equivalentSubtext={businessPricing.equivalentSubtext}
          savingsBadge={businessPricing.savingsBadge}
          subtitle="Scale high-volume AR operations"
          capacityItems={BUSINESS_CAPACITY}
          features={BUSINESS_FEATURES}
          ctaLabel="Start Free Trial"
          ctaHref={trialHref("business")}
          showTrialMicrocopy
          footnote="For organizations with substantial receivables volume and unlimited capacity needs."
        />

        <PricingCard
          name="Enterprise"
          price={getPublicTeaserPriceDisplay("enterprise").price}
          period={null}
          subtitle="Custom collections at scale"
          features={[
            { label: "Custom usage limits" },
            { label: "Dedicated onboarding" },
            { label: "Security review support" },
            { label: "Priority support" },
          ]}
          ctaLabel="Contact Sales"
          ctaHref={getEnterpriseContactHref()}
          footnote="For larger organizations with complex security, volume, and onboarding requirements."
        />
      </div>
    </>
  );
}
