import Link from "next/link";
import { Check } from "lucide-react";
import { trialHref } from "@/lib/billing/plans";
import { Button } from "@/components/ui/button";

const PLANS = [
  {
    name: "Starter",
    price: "$39",
    suffix: "/month",
    copy: "Everything you need to get organized and get paid.",
    features: [
      "Up to 25 clients",
      "Up to 50 invoices/month",
      "Manual reminders",
      "Basic risk score",
    ],
    cta: { label: "Start free trial", href: trialHref("starter"), disabled: false },
    highlighted: false,
    badge: null,
  },
  {
    name: "Pro",
    price: "$89",
    suffix: "/month",
    copy: "For growing businesses that want smarter collections.",
    features: [
      "Everything in Starter",
      "Up to 250 clients",
      "Up to 500 invoices/month",
      "Automated reminders",
      "Advanced risk analysis",
    ],
    cta: { label: "Start Pro trial", href: trialHref("pro"), disabled: false },
    highlighted: true,
    badge: "Most Popular",
  },
  {
    name: "Business",
    price: "Coming soon",
    suffix: "",
    copy: "Advanced features for larger teams and scale.",
    features: [
      "Team permissions",
      "Custom domain",
      "API access",
      "Priority support",
    ],
    cta: { label: "Notify me", href: "#", disabled: true },
    highlighted: false,
    badge: null,
  },
] as const;

export function LandingPricingTeaser() {
  return (
    <section className="py-20 sm:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
            Simple launch pricing
          </h2>
          <p className="mt-4 text-lg text-slate-600">
            Powerful. Affordable. Built to pay for itself.
          </p>
        </div>

        <div className="mt-14 grid gap-5 overflow-visible md:grid-cols-2 lg:grid-cols-3">
          {PLANS.map((plan) => (
            <article
              key={plan.name}
              className={`relative flex flex-col rounded-xl border bg-white p-6 shadow-sm ${
                plan.highlighted ? "border-blue-500 ring-2 ring-blue-100" : "border-slate-200"
              }`}
            >
              {plan.badge ? (
                <div className="mb-4 flex justify-center">
                  <span className="rounded-full bg-blue-600 px-3 py-1 text-xs font-semibold text-white shadow-sm">
                    {plan.badge}
                  </span>
                </div>
              ) : null}
              {plan.highlighted ? (
                <div className="absolute inset-x-0 top-0 h-1 rounded-t-xl bg-gradient-to-r from-blue-600 to-cyan-500" />
              ) : null}

              <h3 className="text-lg font-semibold text-slate-900">{plan.name}</h3>
              <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">
                {plan.price}
                {plan.suffix ? (
                  <span className="text-base font-medium text-slate-600">{plan.suffix}</span>
                ) : null}
              </p>
              <p className="mt-3 text-sm text-slate-600">{plan.copy}</p>

              <ul className="mt-5 flex-1 space-y-2">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2 text-sm text-slate-700">
                    <Check
                      className="mt-0.5 h-4 w-4 shrink-0 text-blue-700"
                      aria-hidden="true"
                    />
                    {feature}
                  </li>
                ))}
              </ul>

              <div className="mt-6">
                {plan.cta.disabled ? (
                  <Button variant="outline" className="w-full" disabled aria-disabled="true">
                    {plan.cta.label}
                  </Button>
                ) : (
                  <Link href={plan.cta.href} className="block">
                    <Button className="w-full">{plan.cta.label}</Button>
                  </Link>
                )}
              </div>
            </article>
          ))}
        </div>

        <div className="mt-10 text-center">
          <Link href="/pricing">
            <Button variant="outline" size="lg" className="h-12 px-8">
              Compare plans
            </Button>
          </Link>
        </div>
      </div>
    </section>
  );
}
