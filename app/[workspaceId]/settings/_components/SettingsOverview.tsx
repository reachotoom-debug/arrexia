import Link from "next/link";

type SettingsCardItem = {
  title: string;
  description: string;
  href: (workspaceId: string) => string;
};

const CARD_GROUPS: { group: string; cards: SettingsCardItem[] }[] = [
  {
    group: "Workspace",
    cards: [
      {
        title: "Workspace",
        description: "Workspace/company profile, timezone, contact details, address, and tax.",
        href: (w) => `/${w}/settings?section=workspace`,
      },
      {
        title: "Branding & invoice",
        description:
          "Invoice presentation settings: default currency, logo, legal display name, payment details, and thank-you text.",
        href: (w) => `/${w}/settings?section=branding`,
      },
    ],
  },
  {
    group: "Operations",
    cards: [
      {
        title: "Reminders",
        description: "Automatic reminders, templates, and rules.",
        href: (w) => `/${w}/settings?section=reminders`,
      },
      {
        title: "Email & sending",
        description: "Provider, from address, and SMTP.",
        href: (w) => `/${w}/settings?section=email`,
      },
      {
        title: "Import",
        description: "Import clients, invoices, and payments from CSV or TSV.",
        href: (w) => `/${w}/settings/import`,
      },
    ],
  },
  {
    group: "Billing",
    cards: [
      {
        title: "Payments & billing",
        description: "Your Arrexia subscription plan.",
        href: (w) => `/${w}/settings?section=billing`,
      },
    ],
  },
  {
    group: "Personal",
    cards: [
      {
        title: "Account",
        description: "Your profile name, email, and avatar in Arrexia.",
        href: (w) => `/${w}/settings?section=account`,
      },
    ],
  },
];

export function SettingsOverview({ workspaceId }: { workspaceId: string }) {
  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Settings</h1>
        <p className="text-sm text-slate-500">
          Manage workspace profile, invoices, billing, reminders, email, imports, and your account.
        </p>
      </header>

      <div className="space-y-8">
        {CARD_GROUPS.map((group) => (
          <section key={group.group} className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{group.group}</h2>
            <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {group.cards.map((card) => (
                <li key={card.title}>
                  <Link
                    href={card.href(workspaceId)}
                    className="group flex h-full flex-col rounded-xl border border-slate-200 bg-white p-6 shadow-sm transition-colors hover:border-blue-200 hover:bg-slate-50/80"
                  >
                    <span className="text-base font-semibold text-slate-900 group-hover:text-blue-700">
                      {card.title}
                    </span>
                    <span className="mt-2 text-sm leading-relaxed text-slate-600">{card.description}</span>
                    <span className="mt-4 text-sm font-medium text-blue-600 group-hover:underline">
                      Open →
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
