import Link from "next/link";
import { JsonLd } from "@/components/seo/JsonLd";
import { DsoCalculator } from "@/components/tools/DsoCalculator";
import { PublicPageShell } from "@/components/public/PublicPageShell";
import { buildPageMetadata } from "@/lib/seo/metadata";
import { buildBreadcrumbSchema, buildWebApplicationSchema } from "@/lib/seo/structured-data";

export const metadata = buildPageMetadata("toolsDsoCalculator");

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
        "Free days sales outstanding calculator for net credit sales, average accounts receivable, and period length.",
      path: "/tools/dso-calculator",
    }),
  ];

  return (
    <PublicPageShell>
      <JsonLd data={structuredData} />
      <main className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <div className="max-w-3xl">
          <p className="text-sm font-medium text-blue-600">
            <Link href="/tools" className="hover:text-blue-700">
              ← Back to tools
            </Link>
          </p>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
            DSO Calculator
          </h1>
          <p className="mt-4 text-lg leading-relaxed text-slate-600">
            Calculate days sales outstanding (DSO) to understand how quickly your business collects
            payment on credit sales. Lower DSO generally means faster collections; higher DSO suggests
            slower cash conversion.
          </p>
        </div>

        <div className="mt-10">
          <DsoCalculator />
        </div>
      </main>
    </PublicPageShell>
  );
}
