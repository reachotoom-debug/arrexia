import Link from "next/link";
import { PricingFAQ } from "@/components/pricing/PricingFAQ";
import { PricingHero } from "@/components/pricing/PricingHero";
import { PricingPlansSection } from "@/components/pricing/PricingPlansSection";
import { PricingROI } from "@/components/pricing/PricingROI";
import { PricingWhy } from "@/components/pricing/PricingWhy";
import { trialHref } from "@/components/pricing/pricingPlans";
import { PublicNavbar } from "@/components/public/PublicNavbar";
import { Button } from "@/components/ui/button";

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
              Start your 14-day free trial. No credit card required.
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
    </div>
  );
}
