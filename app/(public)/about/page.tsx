import Link from "next/link";
import { PublicPageShell } from "@/components/public/PublicPageShell";
import { Button } from "@/components/ui/button";
import { trialHref } from "@/lib/billing/plans";
import { buildPageMetadata } from "@/lib/seo/metadata";

export const metadata = buildPageMetadata("about");

const VALUES = [
  {
    title: "Clarity",
    description: "See what is outstanding, overdue, and paid without digging through spreadsheets.",
  },
  {
    title: "Reliability",
    description: "Build follow-up workflows you can trust, with a platform designed for day-to-day operations.",
  },
  {
    title: "Practical automation",
    description: "Automate reminders and routine tasks without losing control of your client relationships.",
  },
  {
    title: "Customer-first product development",
    description: "Ship improvements based on real operational needs, not feature bloat.",
  },
] as const;

const DELIVERS_TODAY = [
  "Receivables visibility and aging dashboards",
  "Automated payment reminders and follow-up",
  "Collections workflows and risk insights",
  "Payment tracking and cash flow reporting",
] as const;

export default function AboutPage() {
  return (
    <PublicPageShell>
      <main>
        <section className="border-b border-slate-200 bg-gradient-to-b from-slate-50 to-white">
          <div className="mx-auto max-w-4xl px-4 py-16 text-center sm:px-6 sm:py-20">
            <p className="text-sm font-semibold uppercase tracking-wide text-blue-600">About Arrexia</p>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl lg:text-5xl">
              Cash Collection Operations for healthier cash flow.
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-slate-600">
              Arrexia helps businesses improve cash flow through better accounts receivable and
              collection operations — with clarity over overdue balances, payments, and follow-up.
            </p>
          </div>
        </section>

        <section className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
          <h2 className="text-2xl font-semibold text-slate-900">Our mission</h2>
          <p className="mt-4 text-base leading-relaxed text-slate-600">
            Late payments hurt cash flow. Arrexia helps teams automate collections follow-up, track
            receivables, and understand what is overdue. We focus on the work that happens after
            money is owed: visibility, payment tracking, reminders, and collection operations.
          </p>
        </section>

        <section className="border-y border-slate-200 bg-slate-50">
          <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
            <h2 className="text-2xl font-semibold text-slate-900">Why Arrexia</h2>
          <p className="mt-4 text-base leading-relaxed text-slate-600">
            Many tools stop at creating invoices. Arrexia is built for Cash Collection Operations:
            tracking receivables, automating payment follow-up, managing collections, and improving
            cash flow visibility.
          </p>
          </div>
        </section>

        <section className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
          <h2 className="text-2xl font-semibold text-slate-900">Founder Note</h2>
          <div className="mt-4 space-y-4 text-base leading-relaxed text-slate-600">
            <p>
              Arrexia was built by Mohammed Otoom, a founder, CEO, COO, and product strategist with
              more than three decades of experience building businesses, high-tech companies, and
              software products across SaaS, fintech, education, eCommerce, and enterprise technology.
            </p>
            <p>
              Throughout his career, he has helped companies transform ideas into commercial products,
              improve operational performance, and scale through disciplined execution.
            </p>
            <p>
              Arrexia reflects practical lessons from working with businesses that depend on timely
              cash collection and healthy receivables — not abstract theory.
            </p>
          </div>
        </section>

        <section className="border-y border-slate-200 bg-white">
          <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
            <h2 className="text-2xl font-semibold text-slate-900">What we value</h2>
            <ul className="mt-8 grid gap-6 sm:grid-cols-2">
              {VALUES.map((value) => (
                <li key={value.title} className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                  <h3 className="text-base font-semibold text-slate-900">{value.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600">{value.description}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
          <h2 className="text-2xl font-semibold text-slate-900">What Arrexia delivers today</h2>
          <p className="mt-4 text-base leading-relaxed text-slate-600">
            Arrexia is available now with core cash collection operations, including:
          </p>
          <ul className="mt-6 space-y-2">
            {DELIVERS_TODAY.map((item) => (
              <li key={item} className="flex items-start gap-3 text-slate-600">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-600" aria-hidden="true" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="border-t border-slate-200 bg-slate-50">
          <div className="mx-auto max-w-3xl px-4 py-16 text-center sm:px-6">
            <h2 className="text-2xl font-semibold text-slate-900">Ready to get started?</h2>
            <p className="mx-auto mt-3 max-w-xl text-base text-slate-600">
              Start your free trial and bring clarity to receivables, collections, and cash flow.
            </p>
            <div className="mt-8">
              <Link href={trialHref("starter")}>
                <Button size="lg" className="h-12 px-8 text-base">
                  Start free trial
                </Button>
              </Link>
            </div>
          </div>
        </section>
      </main>
    </PublicPageShell>
  );
}
