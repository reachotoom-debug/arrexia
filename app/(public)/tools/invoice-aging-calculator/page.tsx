import Link from "next/link";
import { JsonLd } from "@/components/seo/JsonLd";
import { InvoiceAgingCalculator } from "@/components/tools/InvoiceAgingCalculator";
import { PageBreadcrumb } from "@/components/public/PageBreadcrumb";
import { PublicPageShell } from "@/components/public/PublicPageShell";
import { Button } from "@/components/ui/button";
import { trialHref } from "@/lib/billing/plans";
import { buildPublicPageMetadata } from "@/lib/seo/metadata";
import { buildBreadcrumbSchema, buildWebApplicationSchema } from "@/lib/seo/structured-data";

export const metadata = buildPublicPageMetadata({
  title: "Invoice Aging Calculator | Arrexia",
  description:
    "Analyze accounts receivable aging by bucket, calculate total overdue invoices, overdue percentage, and collection risk with this free invoice aging calculator.",
  path: "/tools/invoice-aging-calculator",
});

const EXPLAINER_SECTIONS = [
  {
    title: "What is invoice aging?",
    body: "Invoice aging groups outstanding receivables by how long they have been open. It shows how much is current, due soon, or overdue—and where collection risk is building.",
  },
  {
    title: "Why aging buckets matter",
    body: "The longer an invoice stays unpaid, the harder it becomes to collect. Aging buckets help finance teams prioritize follow-up, spot cash flow risk early, and focus on the balances that need action now.",
  },
  {
    title: "How to use this calculator",
    body: "Enter the outstanding balance for each aging bucket from your AR report or spreadsheet. The calculator totals receivables, overdue amounts, overdue percentage, and highlights your highest-risk bucket.",
  },
  {
    title: "Improve collections with Arrexia",
    body: "Arrexia tracks invoice aging automatically, sends payment reminders, and surfaces overdue balances so your team can act before receivables become hard to recover.",
  },
] as const;

export default function InvoiceAgingCalculatorPage() {
  const structuredData = [
    buildBreadcrumbSchema([
      { name: "Home", path: "/" },
      { name: "Tools", path: "/tools" },
      { name: "Invoice Aging Calculator", path: "/tools/invoice-aging-calculator" },
    ]),
    buildWebApplicationSchema({
      name: "Arrexia Invoice Aging Calculator",
      description:
        "Calculate accounts receivable aging, total overdue invoices, overdue percentage, and collection risk by aging bucket.",
      path: "/tools/invoice-aging-calculator",
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
            { label: "Invoice Aging Calculator" },
          ]}
        />

        <div className="mt-8 max-w-3xl">
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
            Invoice Aging Calculator
          </h1>
          <p className="mt-4 text-lg leading-relaxed text-slate-600">
            Analyze your accounts receivable by aging bucket to understand overdue exposure,
            collection risk, and where to focus follow-up.
          </p>
        </div>

        <div className="mt-10">
          <InvoiceAgingCalculator />
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
            Track aging and reduce overdue invoices with Arrexia
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-slate-600">
            Automate reminders, monitor aging buckets, and improve collections without spreadsheet
            chasing.
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
