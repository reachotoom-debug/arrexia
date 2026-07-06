import Link from "next/link";
import { Button } from "@/components/ui/button";

type PricingHeroProps = {
  trialHref: string;
};

export function PricingHero({ trialHref }: PricingHeroProps) {
  return (
    <section className="relative text-center">
      <div className="mx-auto max-w-4xl space-y-6 lg:space-y-8">
        <span className="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-4 py-1.5 text-sm font-semibold tracking-wide text-blue-800">
          Cash Solved.
        </span>

        <div className="space-y-5">
          <h1 className="text-4xl font-semibold tracking-tight text-slate-900 sm:text-5xl lg:text-6xl lg:leading-[1.1]">
            Stop Chasing Unpaid Invoices.
          </h1>
          <p className="mx-auto max-w-3xl text-lg leading-relaxed text-slate-600 sm:text-xl lg:text-2xl lg:leading-relaxed">
            Arrexia helps freelancers, agencies, and businesses recover overdue
            invoices, automate reminders, track payments, and improve cash flow — all
            in one place.
          </p>
        </div>

        <p className="text-base font-medium text-slate-800 sm:text-lg">
          More than invoicing. Arrexia is cash collection automation.
        </p>

        <div className="flex flex-col items-center gap-4 pt-2">
          <div className="flex w-full flex-col items-center justify-center gap-3 sm:w-auto sm:flex-row">
            <Link href={trialHref} className="w-full sm:w-auto">
              <Button size="lg" className="h-12 w-full px-8 text-base sm:w-auto">
                Start 14-Day Free Trial
              </Button>
            </Link>
            <Link href="#pricing" className="w-full sm:w-auto">
              <Button variant="outline" size="lg" className="h-12 w-full px-8 text-base sm:w-auto">
                View Pricing
              </Button>
            </Link>
          </div>
          <p className="text-sm text-slate-600">No credit card required</p>
          <p className="max-w-xl text-sm text-slate-600 sm:text-base">
            Recover overdue invoices. Automate reminders. Get paid faster.
          </p>
        </div>
      </div>
    </section>
  );
}
