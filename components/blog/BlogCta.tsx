import Link from "next/link";
import { StartTrialLink } from "@/components/analytics/StartTrialLink";
import { Button } from "@/components/ui/button";
import { trialHref } from "@/lib/billing/plans";

type BlogCtaProps = {
  variant?: "default" | "compact";
};

export function BlogCta({ variant = "default" }: BlogCtaProps) {
  if (variant === "compact") {
    return (
      <div className="mt-10 flex flex-col gap-3 sm:flex-row">
        <StartTrialLink href={trialHref("starter")} source="blog_cta_compact" plan="starter">
          <Button className="w-full sm:w-auto">Start Free Trial</Button>
        </StartTrialLink>
        <Link href="/pricing">
          <Button variant="outline" className="w-full sm:w-auto">
            View Pricing
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <section className="mt-14 overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-br from-slate-50 via-white to-blue-50 p-8 text-center shadow-sm sm:p-10">
      <h2 className="text-2xl font-semibold tracking-tight text-slate-900">
        Simplify collections with Arrexia
      </h2>
      <p className="mx-auto mt-3 max-w-xl text-base leading-relaxed text-slate-600">
        Automate reminders, track payments, and reduce overdue invoices.
      </p>
      <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
        <StartTrialLink href={trialHref("starter")} source="blog_cta" plan="starter">
          <Button size="lg" className="h-11 px-7">
            Start Free Trial
          </Button>
        </StartTrialLink>
        <Link
          href="/pricing"
          className="text-sm font-semibold text-blue-600 hover:text-blue-700"
        >
          View Pricing
        </Link>
      </div>
    </section>
  );
}
