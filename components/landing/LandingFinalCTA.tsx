import Link from "next/link";
import { trialHref } from "@/lib/billing/plans";
import { Button } from "@/components/ui/button";

export function LandingFinalCTA() {
  return (
    <section className="py-20 sm:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="overflow-hidden rounded-3xl bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 px-6 py-14 text-center shadow-xl sm:px-12 sm:py-16">
          <h2 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            Ready to reduce overdue invoices?
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-slate-200">
            Start with Arrexia and build a healthier cash flow process. Stop leaving money on
            the table.
          </p>
          <p className="mx-auto mt-3 max-w-2xl text-sm text-slate-300">
            Explore{" "}
            <Link href="/pricing" className="text-slate-100 underline-offset-2 hover:text-white hover:underline">
              pricing
            </Link>
            , read our{" "}
            <Link href="/blog" className="text-slate-100 underline-offset-2 hover:text-white hover:underline">
              blog
            </Link>
            , try our{" "}
            <Link href="/tools" className="text-slate-100 underline-offset-2 hover:text-white hover:underline">
              free tools
            </Link>
            , or{" "}
            <Link href="/contact" className="text-slate-100 underline-offset-2 hover:text-white hover:underline">
              contact us
            </Link>
            .
          </p>
          <div className="mt-8 flex flex-col items-center gap-3">
            <Link href={trialHref("starter")}>
              <Button
                size="lg"
                className="h-12 bg-blue-600 px-8 text-base text-white shadow-lg shadow-blue-600/30 hover:bg-blue-500"
              >
                Start 14-day free trial
              </Button>
            </Link>
            <p className="text-sm text-slate-300">
              No credit card required. Cancel anytime.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
