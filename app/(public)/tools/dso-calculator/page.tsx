import Link from "next/link";
import { JsonLd } from "@/components/seo/JsonLd";
import { DsoCalculator } from "@/components/tools/DsoCalculator";
import { PageBreadcrumb } from "@/components/public/PageBreadcrumb";
import { PublicPageShell } from "@/components/public/PublicPageShell";
import { Button } from "@/components/ui/button";
import { trialHref } from "@/lib/billing/plans";
import { buildPageMetadata } from "@/lib/seo/metadata";
import { buildBreadcrumbSchema, buildWebApplicationSchema } from "@/lib/seo/structured-data";

export const metadata = buildPageMetadata("toolsDsoCalculator");

const EXPLAINER_SECTIONS = [
  {
    title: "What is DSO?",
    body: "Days Sales Outstanding (DSO) measures how long it takes, on average, to collect payment after a credit sale. It is a core accounts receivable metric for understanding collection speed.",
  },
  {
    title: "How is DSO calculated?",
    body: "DSO = (Average accounts receivable ÷ Net credit sales) × Number of days. Use the same period for all three inputs—for example, annual sales, average AR, and 365 days.",
  },
  {
    title: "Why DSO matters",
    body: "Higher DSO ties up cash in unpaid invoices. Tracking DSO over time helps finance teams spot collection slowdowns early and prioritize follow-up.",
  },
  {
    title: "How Arrexia helps reduce DSO",
    body: "Arrexia improves invoice tracking, automates payment reminders, and surfaces overdue balances so teams follow up consistently—without adding accounting complexity.",
  },
] as const;

export default function DsoCalculatorPage() {
  const structuredData = [
    buildBreadcrumbSchema([
      { name: "Home", path: "/" },
      { name: "Tools", path: "/tools" },
      { name: "DSO Calculator", path: "/tools/dso-calculator" },
    ]),
    buildWebApplicationSchema({
      name: "Arrexia DSO Calculator",
      description:
        "Calculate days sales outstanding (DSO) using net credit sales, average accounts receivable, and period length.",
      path: "/tools/dso-calculator",
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
            { label: "DSO Calculator" },
          ]}
        />

        <div className="mt-8 max-w-3xl">
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
            DSO Calculator
          </h1>
          <p className="mt-4 text-lg leading-relaxed text-slate-600">
            Calculate your Days Sales Outstanding (DSO) to measure how efficiently your business
            collects payments.
          </p>
        </div>

        <div className="mt-10">
          <DsoCalculator />
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
            Track invoices and reduce DSO with Arrexia
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-slate-600">
            Use invoice tracking, payment reminders, and overdue visibility to improve collections.
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
