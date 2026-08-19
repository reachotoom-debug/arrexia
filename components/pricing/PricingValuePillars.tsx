import { BarChart3, MessageSquare, Target } from "lucide-react";

const PILLARS = [
  {
    icon: Target,
    title: "Recover cash sooner",
    text: "Prioritize overdue receivables and identify which accounts need action next.",
  },
  {
    icon: MessageSquare,
    title: "Reduce manual chasing",
    text: "Use automated reminders, AI-assisted communication, and email and WhatsApp collection workflows.",
  },
  {
    icon: BarChart3,
    title: "Run collections with control",
    text: "See overdue exposure, aging, risk, payment activity, and collection priorities in one place.",
  },
] as const;

export function PricingValuePillars() {
  return (
    <section className="space-y-8 lg:space-y-10">
      <div className="mx-auto max-w-3xl text-center">
        <h2 className="text-2xl font-semibold text-slate-900 sm:text-3xl lg:text-4xl">
          Built to pay for itself in recovered cash and saved collection time
        </h2>
        <p className="mt-4 text-base text-slate-600 sm:text-lg">
          Recover more cash with less manual effort — without replacing your accounting stack.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-3 lg:gap-8">
        {PILLARS.map((pillar) => {
          const Icon = pillar.icon;
          return (
            <div
              key={pillar.title}
              className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm lg:p-8"
            >
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                <Icon className="h-5 w-5" aria-hidden="true" />
              </div>
              <h3 className="text-lg font-semibold text-slate-900">{pillar.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600 sm:text-base">
                {pillar.text}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
