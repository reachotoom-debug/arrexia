import Link from "next/link";
import {
  AlertTriangle,
  BarChart3,
  Bell,
  LayoutDashboard,
  ListChecks,
  MessageCircle,
  Sparkles,
  Wallet,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

const FEATURES: { title: string; description: string; icon: LucideIcon }[] = [
  {
    title: "Daily Action Center",
    description:
      "See what needs attention today with a prioritized list of collection actions across your receivables.",
    icon: ListChecks,
  },
  {
    title: "Collections prioritization",
    description:
      "Work overdue accounts in order of risk and outstanding balance — not spreadsheet guesswork.",
    icon: LayoutDashboard,
  },
  {
    title: "Arrexia AI",
    description:
      "Draft collection emails and messages grounded in invoice facts. You review and send — AI assists the decision.",
    icon: Sparkles,
  },
  {
    title: "Automated email reminders",
    description:
      "Schedule due and overdue reminder sequences so follow-up stays consistent without manual tracking.",
    icon: Bell,
  },
  {
    title: "WhatsApp click-to-send",
    description:
      "Open pre-filled WhatsApp messages for faster client follow-up when email is not enough.",
    icon: MessageCircle,
  },
  {
    title: "Overdue invoice management",
    description:
      "Track aging, status, and follow-up history for every overdue balance in one workspace.",
    icon: AlertTriangle,
  },
  {
    title: "Payment tracking",
    description:
      "Record payments, reconcile balances, and see what is still outstanding after each collection.",
    icon: Wallet,
  },
  {
    title: "Accounts receivable visibility",
    description:
      "Dashboards for receivables, cash flow, and collection performance — built for recovery, not bookkeeping.",
    icon: BarChart3,
  },
];

export function LandingFeatures() {
  return (
    <section id="features" className="scroll-mt-24 py-20 sm:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
            The capabilities behind stronger collections
          </h2>
          <p className="mt-4 text-lg text-slate-600">
            Automated reminders, AI-assisted drafting, WhatsApp follow-up, payment tracking, and
            receivables visibility — the tools that support every stage of recovery. See{" "}
            <Link href="/pricing" className="font-medium text-blue-700 hover:text-blue-800">
              pricing
            </Link>{" "}
            or read about{" "}
            <Link href="/security" className="font-medium text-blue-700 hover:text-blue-800">
              security
            </Link>
            .
          </p>
        </div>

        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((feature) => {
            const Icon = feature.icon;
            return (
              <article
                key={feature.title}
                className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-md"
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-blue-50 to-indigo-50 text-blue-600">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </div>
                <h3 className="mt-4 text-base font-semibold text-slate-900">{feature.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">
                  {feature.description}
                </p>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
