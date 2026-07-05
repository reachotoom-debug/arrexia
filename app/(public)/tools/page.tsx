import Link from "next/link";
import { Calculator, Clock3 } from "lucide-react";
import { PublicPageShell } from "@/components/public/PublicPageShell";
import { buildPageMetadata } from "@/lib/seo/metadata";

export const metadata = buildPageMetadata("tools");

const AVAILABLE_TOOLS = [
  {
    title: "DSO Calculator",
    description:
      "Calculate days sales outstanding using net credit sales, average accounts receivable, and your measurement period.",
    href: "/tools/dso-calculator",
    available: true,
  },
] as const;

const COMING_SOON_TOOLS = [
  "Invoice Aging Calculator",
  "Cash Flow Forecast Calculator",
  "Collection Risk Calculator",
] as const;

export default function ToolsPage() {
  return (
    <PublicPageShell>
      <main className="mx-auto max-w-5xl px-4 py-16 sm:px-6 sm:py-20">
        <div className="max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-wide text-blue-600">Free tools</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
            Free Accounts Receivable Tools
          </h1>
          <p className="mt-4 text-lg leading-relaxed text-slate-600">
            Arrexia provides simple tools to help businesses understand cash flow, overdue invoices,
            and collections performance—without spreadsheets or complex setup.
          </p>
          <p className="mt-4 text-sm text-slate-600">
            Read practical guides on our{" "}
            <Link href="/blog" className="font-medium text-blue-600 hover:text-blue-700">
              blog
            </Link>
            .
          </p>
        </div>

        <section className="mt-12">
          <h2 className="text-lg font-semibold text-slate-900">Available now</h2>
          <div className="mt-5 grid gap-5 md:grid-cols-2">
            {AVAILABLE_TOOLS.map((tool) => (
              <Link
                key={tool.href}
                href={tool.href}
                className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-md"
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                  <Calculator className="h-5 w-5" aria-hidden="true" />
                </div>
                <h3 className="mt-4 text-xl font-semibold text-slate-900">{tool.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{tool.description}</p>
                <span className="mt-4 inline-block text-sm font-medium text-blue-600">
                  Open tool →
                </span>
              </Link>
            ))}
          </div>
        </section>

        <section className="mt-12 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 sm:p-8">
          <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
            <Clock3 className="h-4 w-4" aria-hidden="true" />
            Coming soon
          </div>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {COMING_SOON_TOOLS.map((tool) => (
              <li
                key={tool}
                className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600"
              >
                {tool}
              </li>
            ))}
          </ul>
        </section>
      </main>
    </PublicPageShell>
  );
}
