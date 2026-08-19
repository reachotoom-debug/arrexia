import Link from "next/link";
import { Button } from "@/components/ui/button";
import { formatPublicTrialMicrocopy, PUBLIC_PRICING } from "@/lib/billing/plans";

type PricingHeroProps = {
  trialHref: string;
};

export function PricingHero({ trialHref }: PricingHeroProps) {
  return (
    <section className="relative text-center">
      <div className="mx-auto max-w-4xl space-y-6 lg:space-y-8">
        <span className="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-4 py-1.5 text-sm font-semibold tracking-wide text-blue-800">
          AI-Powered Accounts Receivable &amp; Collections
        </span>

        <div className="space-y-5">
          <h1 className="text-4xl font-semibold tracking-tight text-slate-900 sm:text-5xl lg:text-6xl lg:leading-[1.1]">
            Turn overdue invoices into recovered cash.
          </h1>
          <p className="mx-auto max-w-3xl text-lg leading-relaxed text-slate-600 sm:text-xl lg:text-2xl lg:leading-relaxed">
            Choose the level of collections capacity your business needs. Arrexia helps your team
            prioritize overdue accounts, automate follow-up, and spend less time chasing payments
            manually.
          </p>
        </div>

        <p className="text-base font-medium text-slate-800 sm:text-lg">
          Arrexia starts where accounting software stops.
        </p>
        <p className="mx-auto max-w-2xl text-sm text-slate-600 sm:text-base">
          Your accounting software shows you what&apos;s overdue. Arrexia helps you decide what to do
          next.
        </p>

        <div className="flex flex-col items-center gap-4 pt-2">
          <div className="flex w-full flex-col items-center justify-center gap-3 sm:w-auto sm:flex-row">
            <Link href={trialHref} className="w-full sm:w-auto">
              <Button size="lg" className="h-12 w-full px-8 text-base sm:w-auto">
                Start Free Trial
              </Button>
            </Link>
            <Link href="#pricing" className="w-full sm:w-auto">
              <Button variant="outline" size="lg" className="h-12 w-full px-8 text-base sm:w-auto">
                View plans
              </Button>
            </Link>
          </div>
          <p className="text-sm text-slate-600">{formatPublicTrialMicrocopy()}</p>
          <p className="text-sm text-slate-600">{PUBLIC_PRICING.trialSameOnEveryPlanNote}</p>
        </div>
      </div>
    </section>
  );
}
