import Link from "next/link";
import {
  Bell,
  FileText,
  LayoutDashboard,
  Mail,
  Shield,
  Users,
  Wallet,
  History,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

const FEATURES: { title: string; description: string; icon: LucideIcon }[] = [
  {
    title: "Professional invoices",
    description: "Create polished invoices with clear payment terms and branded PDFs.",
    icon: FileText,
  },
  {
    title: "Smart reminders",
    description: "Automate follow-ups for due and overdue invoices before cash flow slips.",
    icon: Bell,
  },
  {
    title: "Payment tracking",
    description: "Record payments, reconcile balances, and see what is still outstanding.",
    icon: Wallet,
  },
  {
    title: "Collections dashboard",
    description: "Prioritize overdue accounts and work the queue that needs attention now.",
    icon: LayoutDashboard,
  },
  {
    title: "Risk insights",
    description: "Spot clients and invoices that need earlier follow-up or tighter terms.",
    icon: Shield,
  },
  {
    title: "Branded PDFs",
    description: "Send invoices that look professional and match your business identity.",
    icon: Mail,
  },
  {
    title: "Reminder history",
    description: "Keep a clear audit trail of every reminder sent and every follow-up.",
    icon: History,
  },
  {
    title: "Client management",
    description: "Organize clients, invoice history, and AR activity in one workspace.",
    icon: Users,
  },
];

export function LandingFeatures() {
  return (
    <section id="features" className="scroll-mt-24 py-20 sm:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
            Cash collection operations to get paid faster
          </h2>
          <p className="mt-4 text-lg text-slate-600">
            Accounts receivable automation, payment follow-up, and collections visibility — built
            for finance teams that need clarity without accounting complexity. See{" "}
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
