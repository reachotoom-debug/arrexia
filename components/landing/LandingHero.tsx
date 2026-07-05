import Link from "next/link";
import { Check } from "lucide-react";
import { trialHref } from "@/lib/billing/plans";
import { Button } from "@/components/ui/button";
import { DashboardMockup } from "./DashboardMockup";

const TRUST_BULLETS = [
  "14-day free trial",
  "No credit card required",
  "Setup in minutes",
] as const;

export function LandingHero() {
  return (
    <section className="relative overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[520px] bg-gradient-to-b from-blue-50/80 via-white to-white"
      />
      <div className="relative mx-auto grid max-w-7xl gap-12 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:items-center lg:gap-16 lg:py-24">
        <div className="max-w-xl lg:max-w-none">
          <span className="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-4 py-1.5 text-sm font-semibold text-blue-700">
            Accounts receivable &amp; invoice tracking
          </span>

          <h1 className="mt-6 text-4xl font-semibold tracking-tight text-slate-900 sm:text-5xl lg:text-6xl lg:leading-[1.08]">
            Accounts receivable software to{" "}
            <span className="bg-gradient-to-r from-blue-600 via-cyan-600 to-violet-600 bg-clip-text text-transparent">
              get paid faster.
            </span>
          </h1>

          <p className="mt-6 text-lg leading-relaxed text-slate-600 sm:text-xl">
            Arrexia is invoice management software for tracking invoices, sending payment reminders,
            managing overdue balances, and improving cash flow—without complex accounting software.{" "}
            <Link href="/about" className="font-medium text-blue-600 hover:text-blue-700">
              Learn about Arrexia
            </Link>
            .
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link href={trialHref("starter")} className="w-full sm:w-auto">
              <Button size="lg" className="h-12 w-full px-8 text-base sm:w-auto">
                Start 14-day free trial
              </Button>
            </Link>
            <Link href="/pricing" className="w-full sm:w-auto">
              <Button variant="outline" size="lg" className="h-12 w-full px-8 text-base sm:w-auto">
                View pricing
              </Button>
            </Link>
          </div>

          <ul className="mt-6 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-x-5 sm:gap-y-2">
            {TRUST_BULLETS.map((item) => (
              <li key={item} className="flex items-center gap-2 text-sm text-slate-600">
                <Check className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
                {item}
              </li>
            ))}
          </ul>
        </div>

        <DashboardMockup />
      </div>
    </section>
  );
}
