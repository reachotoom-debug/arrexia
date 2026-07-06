import Link from "next/link";
import { JsonLd } from "@/components/seo/JsonLd";
import { PaymentTermsCalculator } from "@/components/tools/PaymentTermsCalculator";
import { PageBreadcrumb } from "@/components/public/PageBreadcrumb";
import { PublicPageShell } from "@/components/public/PublicPageShell";
import { Button } from "@/components/ui/button";
import { trialHref } from "@/lib/billing/plans";
import { buildPublicPageMetadata } from "@/lib/seo/metadata";
import { buildBreadcrumbSchema, buildWebApplicationSchema } from "@/lib/seo/structured-data";

export const metadata = buildPublicPageMetadata({
  title: "Payment Terms Calculator | Arrexia",
  description:
    "Calculate invoice due dates from payment terms like Net 30, Net 45, and Net 60. See whether an invoice is upcoming, due today, or overdue for accounts receivable follow-up.",
  path: "/tools/payment-terms-calculator",
});

const EXPLAINER_SECTIONS = [
  {
    title: "What are payment terms?",
    body: "Payment terms define when an invoice must be paid. Common formats include due on receipt and Net terms such as Net 30, which means payment is due 30 days after the invoice date.",
  },
  {
    title: "Common Net payment terms",
    body: "Net 7 gives customers one week to pay. Net 15 and Net 30 are widely used for small business invoices. Net 45 and Net 60 extend the payment window but delay cash collection and increase receivables exposure.",
  },
  {
    title: "How to choose payment terms",
    body: "Balance customer expectations with your cash flow needs. Shorter terms improve liquidity; longer terms may help close deals but require stronger follow-up. Match terms to client reliability, invoice size, and industry norms.",
  },
  {
    title: "Automate due dates with Arrexia",
    body: "Arrexia applies payment terms to every invoice, calculates due dates automatically, and sends reminders before and after the due date so your team stays on top of accounts receivable.",
  },
] as const;

export default function PaymentTermsCalculatorPage() {
  const structuredData = [
    buildBreadcrumbSchema([
      { name: "Home", path: "/" },
      { name: "Tools", path: "/tools" },
      { name: "Payment Terms Calculator", path: "/tools/payment-terms-calculator" },
    ]),
    buildWebApplicationSchema({
      name: "Arrexia Payment Terms Calculator",
      description:
        "Calculate invoice due dates from payment terms such as Net 30, Net 45, and Net 60, and determine whether an invoice is upcoming, due today, or overdue.",
      path: "/tools/payment-terms-calculator",
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
            { label: "Payment Terms Calculator" },
          ]}
        />

        <div className="mt-8 max-w-3xl">
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
            Payment Terms Calculator
          </h1>
          <p className="mt-4 text-lg leading-relaxed text-slate-600">
            Calculate invoice due dates from common payment terms and see whether an invoice is
            upcoming, due today, or overdue.
          </p>
        </div>

        <div className="mt-10">
          <PaymentTermsCalculator />
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
            Apply payment terms and reminders automatically with Arrexia
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-slate-600">
            Set default terms per client, calculate due dates on every invoice, and improve
            collections without manual spreadsheet tracking.
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
