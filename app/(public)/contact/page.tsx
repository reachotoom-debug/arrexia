import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, CreditCard, HelpCircle, Mail } from "lucide-react";
import { LandingFooter } from "@/components/landing/LandingFooter";
import { PublicNavbar } from "@/components/public/PublicNavbar";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Contact Arrexia",
  description:
    "Questions, feedback, or early access requests? Contact the Arrexia team at support@arrexia.app.",
};

const CONTACT_CARDS = [
  {
    title: "Product questions",
    description: "Learn how Arrexia fits your invoicing and collections workflow.",
    icon: HelpCircle,
    email: "support@arrexia.app",
    subject: "Product question",
  },
  {
    title: "Billing questions",
    description: "Ask about plans, trials, upgrades, or account billing.",
    icon: CreditCard,
    email: "support@arrexia.app",
    subject: "Billing question",
  },
  {
    title: "Support",
    description: "Get help with your workspace, imports, reminders, or setup.",
    icon: Mail,
    email: "support@arrexia.app",
    subject: "Support request",
  },
] as const;

export default function ContactPage() {
  return (
    <div className="min-h-screen bg-white text-slate-900">
      <PublicNavbar />
      <main className="mx-auto max-w-4xl px-4 py-16 sm:px-6 sm:py-20">
        <div className="text-center">
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
            Contact Arrexia
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-slate-600">
            Questions, feedback, or early access requests? We&apos;d love to hear from you.
          </p>
          <p className="mt-6">
            <a
              href="mailto:support@arrexia.app"
              className="text-lg font-semibold text-blue-600 hover:text-blue-700"
            >
              support@arrexia.app
            </a>
          </p>
        </div>

        <div className="mt-12 grid gap-5 sm:grid-cols-3">
          {CONTACT_CARDS.map((card) => {
            const Icon = card.icon;
            return (
              <article
                key={card.title}
                className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                  <Icon className="h-5 w-5" aria-hidden="true" />
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
            );
          })}
        </div>

        <div className="mt-12 text-center">
          <Link href="/">
            <Button variant="outline" size="lg" className="gap-2">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Back to Arrexia
            </Button>
          </Link>
        </div>
      </main>
      <LandingFooter />
    </div>
  );
}
