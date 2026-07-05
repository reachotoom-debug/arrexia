import Link from "next/link";
import { ExternalLink, Linkedin, Mail } from "lucide-react";
import { PublicPageShell } from "@/components/public/PublicPageShell";
import { Button } from "@/components/ui/button";
import { trialHref } from "@/lib/billing/plans";
import { buildPublicPageMetadata } from "@/lib/public/pageMetadata";

export const metadata = buildPublicPageMetadata({
  title: "Contact Arrexia | Support & Business Inquiries",
  description:
    "Reach the Arrexia team for support, product questions, and business inquiries. We usually respond within 1–2 business days.",
  path: "/contact",
});

const SUPPORT_EMAIL = "support@arrexia.app";

const FOUNDER_LINKEDIN = "https://www.linkedin.com/in/mohammed-otoom-84501561";
const FOUNDER_X = "https://x.com/Otoomai";

const CONTACT_CARDS = [
  {
    title: "Support",
    description: "Help with your workspace, imports, reminders, invoices, or setup.",
    email: SUPPORT_EMAIL,
    subject: "Support request",
  },
  {
    title: "Business inquiries",
    description: "Partnerships, press, or general business questions.",
    email: SUPPORT_EMAIL,
    subject: "Business inquiry",
  },
  {
    title: "Product questions",
    description: "Learn how Arrexia fits your invoicing and collections workflow.",
    email: SUPPORT_EMAIL,
    subject: "Product question",
  },
] as const;

export default function ContactPage() {
  return (
    <PublicPageShell>
      <main className="mx-auto max-w-4xl px-4 py-16 sm:px-6 sm:py-20">
        <div className="text-center">
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
            Contact Arrexia
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-slate-600">
            Questions, feedback, or business inquiries? We&apos;d love to hear from you.
          </p>
          <p className="mt-6">
            <a
              href={`mailto:${SUPPORT_EMAIL}`}
              className="text-lg font-semibold text-blue-600 hover:text-blue-700"
            >
              {SUPPORT_EMAIL}
            </a>
          </p>
          <p className="mt-3 text-sm text-slate-500">
            We usually respond within 1–2 business days.
          </p>
        </div>

        <div className="mt-12 grid gap-5 sm:grid-cols-3">
          {CONTACT_CARDS.map((card) => (
            <article
              key={card.title}
              className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                <Mail className="h-5 w-5" aria-hidden="true" />
              </div>
              <h2 className="mt-4 text-base font-semibold text-slate-900">{card.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{card.description}</p>
              <a
                href={`mailto:${card.email}?subject=${encodeURIComponent(card.subject)}`}
                className="mt-4 inline-block text-sm font-medium text-blue-600 hover:text-blue-700"
              >
                Email us
              </a>
            </article>
          ))}
        </div>

        <section className="mt-12 rounded-xl border border-slate-200 bg-slate-50 p-6 sm:p-8">
          <h2 className="text-lg font-semibold text-slate-900">Connect with the founder</h2>
          <p className="mt-2 text-sm text-slate-600">
            Follow Mohammed Otoom for product updates and founder perspective.
          </p>
          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <a
              href={FOUNDER_LINKEDIN}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:border-slate-300 hover:text-slate-900"
            >
              <Linkedin className="h-4 w-4" aria-hidden="true" />
              LinkedIn
              <ExternalLink className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
            </a>
            <a
              href={FOUNDER_X}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:border-slate-300 hover:text-slate-900"
            >
              <span className="text-sm font-semibold" aria-hidden="true">
                𝕏
              </span>
              @Otoomai
              <ExternalLink className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
            </a>
          </div>
        </section>

        <div className="mt-12 rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <h2 className="text-xl font-semibold text-slate-900">Ready to try Arrexia?</h2>
          <p className="mx-auto mt-2 max-w-lg text-sm text-slate-600">
            Start your free trial and bring clarity to invoices, reminders, and cash flow.
          </p>
          <div className="mt-6">
            <Link href={trialHref("starter")}>
              <Button size="lg" className="h-12 px-8 text-base">
                Start free trial
              </Button>
            </Link>
          </div>
        </div>
      </main>
    </PublicPageShell>
  );
}
