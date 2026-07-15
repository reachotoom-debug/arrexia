import Link from "next/link";
import { ToolCard } from "@/components/tools/ToolCard";
import { ToolsCtaSection, ToolsHeroVisual, ToolsTrustStrip } from "@/components/tools/ToolsSections";
import { PublicPageShell } from "@/components/public/PublicPageShell";
import { LIVE_TOOLS } from "@/lib/tools/catalog";
import { buildPageMetadata } from "@/lib/seo/metadata";

export const metadata = buildPageMetadata("tools");

export default function ToolsPage() {
  return (
    <PublicPageShell>
      <main className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20">
        <section className="mx-auto max-w-3xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-blue-600">Free Tools</p>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl lg:text-5xl lg:leading-tight">
            Free Cash Collection Tools
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-slate-600">
            Practical calculators to help finance teams analyze receivables, plan follow-up, and make
            better collection decisions.
          </p>
          <p className="mt-4 text-sm text-slate-600">
            Read practical guides on our{" "}
            <Link href="/blog" className="font-medium text-blue-600 hover:text-blue-700">
              blog
            </Link>
            .
          </p>
        </section>

        <ToolsHeroVisual />

        <section className="mt-16">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight text-slate-900">
                Cash collection calculators
              </h2>
              <p className="mt-2 text-sm text-slate-600">
                Live tools for DSO, aging, payment terms, and late payment interest.
              </p>
            </div>
          </div>

          <div className="mt-8 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {LIVE_TOOLS.map((tool) => (
              <ToolCard key={tool.id} tool={tool} />
            ))}
          </div>
        </section>

        <ToolsTrustStrip />
        <ToolsCtaSection />
      </main>
    </PublicPageShell>
  );
}
