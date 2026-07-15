import Link from "next/link";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { trialHref } from "@/lib/billing/plans";

const TRUST_ITEMS = [
  "No credit card required",
  "Start your free trial in seconds",
  "Cancel anytime",
  "Secure & reliable",
] as const;

export function ToolsTrustStrip() {
  return (
    <section className="mt-10 rounded-2xl border border-slate-200 bg-slate-50 px-6 py-5">
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {TRUST_ITEMS.map((item) => (
          <li key={item} className="flex items-center gap-2 text-sm text-slate-600">
            <Check className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
            {item}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function ToolsCtaSection() {
  return (
    <section className="mt-16 overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-br from-slate-50 via-white to-blue-50 p-8 text-center shadow-sm sm:p-10">
      <h2 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
        Ready to get paid faster?
      </h2>
      <p className="mx-auto mt-3 max-w-2xl text-base leading-relaxed text-slate-600">
        Automate payment follow-up, track receivables, and reduce overdue balances.
      </p>
      <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
        <Link href={trialHref("starter")}>
          <Button size="lg" className="h-11 px-7">
            Start Free Trial
          </Button>
        </Link>
        <Link href="/pricing">
          <Button variant="outline" size="lg" className="h-11 px-7">
            View Pricing
          </Button>
        </Link>
      </div>
    </section>
  );
}

export function ToolsHeroVisual() {
  return (
    <div
      aria-hidden="true"
      className="relative mx-auto mt-10 max-w-4xl overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-br from-blue-50 via-white to-indigo-50 p-6 shadow-sm sm:p-8"
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">DSO</p>
          <p className="mt-2 text-2xl font-semibold text-blue-600">32.4</p>
          <p className="mt-1 text-xs text-slate-500">days</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Outstanding</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">$48.2k</p>
          <div className="mt-3 h-2 rounded-full bg-slate-100">
            <div className="h-2 w-2/3 rounded-full bg-blue-600" />
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Reminders</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">12</p>
          <p className="mt-1 text-xs text-slate-500">scheduled this week</p>
        </div>
      </div>
    </div>
  );
}
