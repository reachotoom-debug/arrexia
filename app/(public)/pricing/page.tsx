import dynamic from "next/dynamic";
import Link from "next/link";
import { PricingHero } from "@/components/pricing/PricingHero";
import { PUBLIC_PRICING, trialHref } from "@/lib/billing/plans";
import { PublicNavbar } from "@/components/public/PublicNavbar";
import { Button } from "@/components/ui/button";
import { buildPageMetadata } from "@/lib/seo/metadata";

const LandingFooter = dynamic(() =>
  import("@/components/landing/LandingFooter").then((module) => ({
    default: module.LandingFooter,
  })),
);

const PricingWhy = dynamic(() =>
  import("@/components/pricing/PricingWhy").then((module) => ({
    default: module.PricingWhy,
  })),
);

const PricingPlansSection = dynamic(() =>
  import("@/components/pricing/PricingPlansSection").then((module) => ({
    default: module.PricingPlansSection,
  })),
);

const PricingROI = dynamic(() =>
  import("@/components/pricing/PricingROI").then((module) => ({
    default: module.PricingROI,
  })),
);

const PricingFAQ = dynamic(() =>
  import("@/components/pricing/PricingFAQ").then((module) => ({
    default: module.PricingFAQ,
  })),
);

export const metadata = buildPageMetadata("pricing");

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-white">
      <PublicNavbar />
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-16 px-4 py-14 sm:px-6 lg:gap-24 lg:py-24">
        <PricingHero trialHref={trialHref("starter")} />

        <PricingWhy />

        <PricingPlansSection />

        <PricingROI />

        <section className="space-y-10">
          <PricingFAQ />

          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm lg:p-12">
            <h2 className="text-2xl font-semibold text-slate-900 sm:text-3xl">
              Ready to get paid faster?
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-base text-slate-600 sm:text-lg">
              Start your {PUBLIC_PRICING.trialLabel}. No credit card required.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link href={trialHref("starter")}>
                <Button size="lg" className="h-12 px-8 text-base">
                  Start 14-Day Free Trial
                </Button>
              </Link>
              <Link href="/login">
                <Button variant="outline" size="lg" className="h-12 px-8 text-base">
                  Sign in
                </Button>
              </Link>
            </div>
          </div>
        </section>
      </div>
      <LandingFooter />
    </div>
  );
}
