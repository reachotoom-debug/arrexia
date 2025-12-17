import { requireWorkspace, requireUser } from "@/lib/auth/server";
import { loadWorkspaceSettings } from "@/lib/settings/loadSettings";
import { getCurrentProfile } from "@/lib/profile/server";
import { SettingsTabs } from "@/components/settings/settings-tabs";
import { BrandPreview } from "@/components/settings/BrandPreview";
import { WorkspaceProfileForm } from "./_components/WorkspaceProfileForm";
import { EmailSettingsForm } from "./_components/EmailSettingsForm";
import { RemindersSettingsSection } from "./_components/RemindersSettingsSection";
import { PaymentSettingsForm } from "./_components/PaymentSettingsForm";
import { AccountSettingsSection } from "./_components/AccountSettingsSection";
import { BillingPlans } from "./_components/BillingPlans";

interface SettingsPageProps {
  params: Promise<{ workspaceId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function SettingsPage({ params, searchParams }: SettingsPageProps) {
  const { workspaceId } = await params;
  await requireWorkspace(workspaceId);
  const resolvedSearchParams = await searchParams;
  const tabParam = Array.isArray(resolvedSearchParams?.tab)
    ? resolvedSearchParams.tab[0]
    : resolvedSearchParams?.tab;
  const initialTab =
    tabParam === "billing"
      ? "billing"
      : tabParam === "payments"
      ? "payments"
      : tabParam === "reminders"
      ? "reminders"
      : tabParam === "email"
      ? "email"
      : tabParam === "account"
      ? "account"
      : "workspace";

  // Load all settings, profile, and user in parallel
  const [settingsResult, profileResult, userResult] = await Promise.all([
    loadWorkspaceSettings(workspaceId),
    getCurrentProfile(),
    requireUser(),
  ]);

  const settings = settingsResult;
  const profile = profileResult.profile;
  const userId = userResult.user.id;

  return (
    <div className="max-w-5xl mx-auto py-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Manage workspace profile, email sending, reminders, and payment defaults.
        </p>
      </div>

      <BrandPreview
        workspaceLogoUrl={settings.workspace.logoUrl}
        fallbackWorkspaceName={settings.workspace.name}
        userAvatarUrl={profile?.avatar_url ?? null}
        userEmail={profile?.email ?? userResult.user.email ?? null}
      />

      <SettingsTabs
        initialTab={initialTab}
        workspaceContent={
          <WorkspaceProfileForm workspaceId={workspaceId} settings={settings} />
        }
        emailContent={
          <EmailSettingsForm workspaceId={workspaceId} settings={settings} />
        }
        remindersContent={
          <RemindersSettingsSection workspaceId={workspaceId} settings={settings} />
        }
        paymentsContent={
          <PaymentSettingsForm workspaceId={workspaceId} settings={settings} />
        }
        billingContent={<BillingPlans workspaceId={workspaceId} />}
        accountContent={
          <AccountSettingsSection
            profile={
              profile
                ? {
                    full_name: profile.full_name,
                    email: profile.email,
                    avatar_url: profile.avatar_url,
                  }
                : null
            }
          />
        }
      />
    </div>
  );
}
