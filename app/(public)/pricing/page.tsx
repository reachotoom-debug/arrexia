import Link from "next/link";
import { PricingCard } from "@/components/pricing/PricingCard";
import { PricingComparison } from "@/components/pricing/PricingComparison";
import { PricingFAQ } from "@/components/pricing/PricingFAQ";
import { Button } from "@/components/ui/button";

const PLAN_COPY = {
  free: {
    price: "$0/mo",
    description: "For getting started and staying organized.",
    limits: [
      { label: "Invoices / month", value: "5" },
      { label: "Clients", value: "5" },
    ],
    features: [
      { label: "Dashboard + overdue tracking" },
      { label: "Record payments" },
      { label: "Manual email reminders" },
      { label: "CSV import/export (basic)" },
    ],
    footnote: "Your data stays accessible.",
  },
  starter: {
    price: "$15/mo",
    description: "Most popular for teams ready to automate follow-ups.",
    limits: [
      { label: "Invoices / month", value: "100" },
      { label: "Clients", value: "Unlimited" },
    ],
    features: [
      { label: "Automatic email reminders" },
      { label: "Reminder templates" },
      { label: "Invoice PDF + email sending" },
      { label: "Collections mode (basic)" },
    ],
  },
  pro: {
    price: "$29/mo",
    description: "For teams needing control, history, and cockpit visibility.",
    limits: [
      { label: "Invoices / month", value: "Unlimited" },
      { label: "Clients", value: "Unlimited" },
    ],
    features: [
      { label: "Advanced reminders & rules" },
      { label: "Collections cockpit (risk-based)" },
      { label: "Reminder history & audit trail" },
      {
        label: "Coming soon: WhatsApp reminders + payment links",
        comingSoon: true,
      },
    ],
  },
} as const;

const SIGNUP_PATH = "/signup";

export default async function PricingPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const planHref = (plan: "free" | "starter" | "pro") => {
    return `/register?next=${encodeURIComponent(`/start?plan=${plan}`)}`;
  };

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-12 px-6 py-12">
      <header className="space-y-4 text-center">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-slate-500">
          Pricing
        </p>
        <h1 className="text-3xl font-semibold text-slate-900">
          Get Paid Faster. Without the Chasing.
        </h1>
        <p className="text-base text-slate-600">
          Track invoices, spot overdue payments, and send reminders — all in one place.
        </p>
        <p className="text-sm text-slate-600">
          Start free. Upgrade only when FlowCollect starts saving you time.
        </p>
        <div className="flex items-center justify-center gap-3">
          <Link href={planHref("free")}>
            <Button>Start Free</Button>
          </Link>
          <Link href="/login">
            <Button variant="outline">Sign in</Button>
          </Link>
        </div>
      </header>

      <section className="grid gap-6 md:grid-cols-3">
        <PricingCard
          name="Free"
          price={PLAN_COPY.free.price}
          description={PLAN_COPY.free.description}
          limits={PLAN_COPY.free.limits}
          features={PLAN_COPY.free.features}
          ctaLabel="Start free"
          ctaHref={planHref("free")}
          footnote={PLAN_COPY.free.footnote}
        />

        <PricingCard
          name="Starter"
          price={PLAN_COPY.starter.price}
          description={PLAN_COPY.starter.description}
          limits={PLAN_COPY.starter.limits}
          features={PLAN_COPY.starter.features}
          ctaLabel="Start Starter"
          ctaHref={planHref("starter")}
          highlight
        />

        <PricingCard
          name="Pro"
          price={PLAN_COPY.pro.price}
          description={PLAN_COPY.pro.description}
          limits={PLAN_COPY.pro.limits}
          features={PLAN_COPY.pro.features}
          ctaLabel="Start Pro"
          ctaHref={planHref("pro")}
        />
      </section>

      <PricingComparison />

      <div className="grid gap-4 md:grid-cols-2">
        <PricingFAQ />
        <CardCta startHref={planHref("free")} />
      </div>
    </div>
  );
}

function CardCta({
  startHref,
}: {
  startHref: string;
}) {
  return (
    <div className="flex h-full flex-col justify-between rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="space-y-3">
        <h2 className="text-xl font-semibold text-slate-900">Ready when you are</h2>
        <p className="text-sm text-slate-600">
          No aggressive blocks. Explore features, keep your data, and upgrade when billing is live.
        </p>
      </div>
      <div className="mt-6 flex flex-wrap gap-3">
        <Link href={startHref}>
          <Button>Start Free</Button>
        </Link>
        <Link href="/login">
          <Button variant="outline">Sign in</Button>
        </Link>
      </div>
    </div>
  );
}
