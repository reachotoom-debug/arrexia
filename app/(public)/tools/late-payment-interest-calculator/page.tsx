import Link from "next/link";
import { JsonLd } from "@/components/seo/JsonLd";
import {
  ESTIMATION_DISCLAIMER,
  LatePaymentInterestCalculator,
} from "@/components/tools/LatePaymentInterestCalculator";
import { PageBreadcrumb } from "@/components/public/PageBreadcrumb";
import { PublicPageShell } from "@/components/public/PublicPageShell";
import { Button } from "@/components/ui/button";
import { trialHref } from "@/lib/billing/plans";
import { buildPublicPageMetadata } from "@/lib/seo/metadata";
import { buildBreadcrumbSchema, buildWebApplicationSchema } from "@/lib/seo/structured-data";

export const metadata = buildPublicPageMetadata({
  title: "Late Payment Interest Calculator | Arrexia",
  description:
    "Estimate overdue invoice interest, late fees, and total amount due with this free late payment interest calculator for accounts receivable and collections follow-up.",
  path: "/tools/late-payment-interest-calculator",
});

const EXPLAINER_SECTIONS = [
  {
    title: "What is late payment interest?",
    body: "Late payment interest compensates a business when a customer pays after the due date. It is usually expressed as an annual percentage rate applied to the unpaid invoice balance for each day the invoice remains overdue.",
  },
  {
    title: "How overdue invoice interest is calculated",
    body: "A common approach is simple daily interest: invoice amount × annual rate × days overdue ÷ 365. Fixed late fees may be added separately when permitted by your contract.",
  },
  {
    title: "When to use late fees carefully",
    body: "Not every jurisdiction or contract allows interest and penalty fees. Disclose terms upfront, apply fees consistently, and confirm legal limits before invoicing late charges to protect customer relationships and compliance.",
  },
  {
    title: "Improve collections with Arrexia",
    body: "Arrexia tracks overdue invoices, automates payment reminders, and helps finance teams follow up before balances age—reducing the need to recover late payments through interest and fees.",
  },
] as const;

export default function LatePaymentInterestCalculatorPage() {
  const structuredData = [
    buildBreadcrumbSchema([
      { name: "Home", path: "/" },
      { name: "Tools", path: "/tools" },
      { name: "Late Payment Interest Calculator", path: "/tools/late-payment-interest-calculator" },
    ]),
    buildWebApplicationSchema({
      name: "Arrexia Late Payment Interest Calculator",
      description:
        "Estimate late payment interest, fixed late fees, days overdue, and total amount due on overdue invoices.",
      path: "/tools/late-payment-interest-calculator",
    }),
  ];

  return (
    <PublicPageShell>
      <JsonLd data={structuredData} />
      <main className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
        <PageBreadcrumb
          items={[
            { label: "Home", href: "/" },
            { label: "Tools", href: "/tools" },
            { label: "Late Payment Interest Calculator" },
          ]}
        />

        <div className="mt-8 max-w-3xl">
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
            Late Payment Interest Calculator
          </h1>
          <p className="mt-4 text-lg leading-relaxed text-slate-600">
            Estimate late payment interest and optional fixed fees on overdue invoices to support
            accounts receivable follow-up and collections planning.
          </p>
          <p className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-relaxed text-slate-600">
            {ESTIMATION_DISCLAIMER}
          </p>
        </div>

        <div className="mt-10">
          <LatePaymentInterestCalculator />
        </div>

        <section className="mt-14 grid gap-5 sm:grid-cols-2">
          {EXPLAINER_SECTIONS.map((section) => (
            <article
              key={section.title}
              className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
            >
              <h2 className="text-lg font-semibold text-slate-900">{section.title}</h2>
              <p className="mt-3 text-sm leading-relaxed text-slate-600">{section.body}</p>
            </article>
          ))}
        </section>

        <section className="mt-14 rounded-3xl border border-slate-200 bg-slate-50 p-8 text-center sm:p-10">
          <h2 className="text-2xl font-semibold tracking-tight text-slate-900">
            Reduce overdue invoices before late charges add up
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-slate-600">
            Use automated reminders, aging visibility, and consistent follow-up to improve
            collections with Arrexia.
          </p>
          <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
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
      </main>
    </PublicPageShell>
  );
}
