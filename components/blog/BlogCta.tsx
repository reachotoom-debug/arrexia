import Link from "next/link";
import { Button } from "@/components/ui/button";
import { trialHref } from "@/lib/billing/plans";

type BlogCtaProps = {
  variant?: "default" | "compact";
};

export function BlogCta({ variant = "default" }: BlogCtaProps) {
  if (variant === "compact") {
    return (
      <div className="mt-10 flex flex-col gap-3 sm:flex-row">
        <Link href={trialHref("starter")}>
          <Button className="w-full sm:w-auto">Start free trial</Button>
        </Link>
        <Link href="/pricing">
          <Button variant="outline" className="w-full sm:w-auto">
            View pricing
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <section className="mt-12 rounded-2xl border border-slate-200 bg-slate-50 p-8 text-center">
      <h2 className="text-xl font-semibold text-slate-900">
        Track invoices and follow up with confidence
      </h2>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-slate-600">
        Arrexia helps teams manage invoice tracking, payment reminders, and overdue balances in one
        workspace.
      </p>
      <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
        <Link href={trialHref("starter")}>
          <Button size="lg" className="h-11 px-6">
            Start free trial
          </Button>
        </Link>
        <Link href="/pricing">
          <Button variant="outline" size="lg" className="h-11 px-6">
            View pricing
          </Button>
        </Link>
      </div>
    </section>
  );
}
