import { formatPublicTrialMicrocopy, PUBLIC_PRICING } from "@/lib/billing/plans";
import { PricingComparison } from "./PricingComparison";
import { PricingPlansClient } from "./PricingPlansClient";
import { PricingValuePillars } from "./PricingValuePillars";

export function PricingPlansSection() {
  return (
    <>
      <section id="pricing" className="scroll-mt-8 space-y-10 lg:space-y-12">
        <div className="text-center">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-blue-700">
            Pricing
          </p>
          <h2 className="mt-3 text-2xl font-semibold text-slate-900 sm:text-3xl lg:text-4xl">
            Collections capacity that matches your stage
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-base text-slate-600 sm:text-lg">
            {formatPublicTrialMicrocopy()}. {PUBLIC_PRICING.trialSameOnEveryPlanNote}{" "}
            {PUBLIC_PRICING.paidLimitsNote}
          </p>
        </div>

        <PricingPlansClient />
      </section>

      <PricingValuePillars />

      <PricingComparison />
    </>
  );
}
