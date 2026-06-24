import Link from "next/link";
import type { SettingsSectionId } from "../_lib/resolveSettingsSection";

const COPY: Record<
  SettingsSectionId,
  { title: string; description: string }
> = {
  workspace: {
    title: "Workspace",
    description: "Workspace name, timezone, and contact details used across the app.",
  },
  branding: {
    title: "Branding & invoice",
    description: "Default currency, logo and business details on invoices, payment instructions, and thank-you text.",
  },
  email: {
    title: "Email & sending",
    description: "How FlowCollect sends reminders and invoice emails.",
  },
  reminders: {
    title: "Reminders",
    description: "Automatic reminders, templates, and rules.",
  },
  billing: {
    title: "Payments & billing",
    description: "Workspace plan and billing preferences.",
  },
  account: {
    title: "Account",
    description: "Your personal profile and avatar in FlowCollect.",
  },
};

export function SettingsSectionChrome({
  workspaceId,
  section,
}: {
  workspaceId: string;
  section: SettingsSectionId;
}) {
  const { title, description } = COPY[section];

  return (
    <div className="mb-8 space-y-4">
      <Link
        href={`/${workspaceId}/settings`}
        className="inline-flex text-sm font-medium text-slate-500 transition-colors hover:text-slate-900"
      >
        ← All settings
      </Link>
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
        <p className="text-sm text-slate-500">{description}</p>
      </header>
    </div>
  );
}
