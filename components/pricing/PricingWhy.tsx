import { BarChart3, Briefcase, ShieldCheck, Zap } from "lucide-react";

const BENEFITS = [
  {
    icon: Zap,
    title: "Get Paid Faster",
    text: "Automate reminders and reduce late payments without chasing clients manually.",
  },
  {
    icon: BarChart3,
    title: "See Cashflow Clearly",
    text: "Track invoices, payments, aging, and overdue balances in one dashboard.",
  },
  {
    icon: ShieldCheck,
    title: "Collections Without Chaos",
    text: "Manage overdue accounts with collections workflows and reminder automation.",
  },
  {
    icon: Briefcase,
    title: "Built for Business, Not Busywork",
    text: "FlowCollect is designed for cash recovery — not just generating invoices.",
  },
] as const;

export function PricingWhy() {
  return (
    <section className="space-y-10 lg:space-y-12">
      <div className="text-center">
        <h2 className="text-2xl font-semibold text-slate-900 sm:text-3xl lg:text-4xl">
          Why businesses choose FlowCollect
        </h2>
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:gap-8">
        {BENEFITS.map((benefit) => {
          const Icon = benefit.icon;
          return (
            <div
              key={benefit.title}
              className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm lg:p-8"
            >
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                <Icon className="h-5 w-5" aria-hidden="true" />
              </div>
              <h3 className="text-lg font-semibold text-slate-900 lg:text-xl">
                {benefit.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600 sm:text-base">
                {benefit.text}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
