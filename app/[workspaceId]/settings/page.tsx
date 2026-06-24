import { requireUser } from "@/lib/auth/server";
import { loadWorkspaceSettings } from "@/lib/settings/loadSettings";
import { getCurrentProfile } from "@/lib/profile/server";
import { BrandPreview } from "@/components/settings/BrandPreview";
import { WorkspaceProfileForm } from "./_components/WorkspaceProfileForm";
import { BrandingInvoiceSettingsForm } from "./_components/BrandingInvoiceSettingsForm";
import { EmailSettingsForm } from "./_components/EmailSettingsForm";
import { RemindersSettingsSection } from "./_components/RemindersSettingsSection";
import { AccountSettingsSection } from "./_components/AccountSettingsSection";
import { BillingPlans } from "./_components/BillingPlans";
import { SettingsOverview } from "./_components/SettingsOverview";
import { SettingsSectionChrome } from "./_components/SettingsSectionChrome";
import { resolveSettingsSection, type SettingsSectionId } from "./_lib/resolveSettingsSection";

interface SettingsPageProps {
  params: Promise<{ workspaceId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function SettingsPage({ params, searchParams }: SettingsPageProps) {
  const { workspaceId } = await params;
  const resolvedSearchParams = await searchParams;
  const view = resolveSettingsSection(resolvedSearchParams);

  const [settingsResult, profileResult, userResult] = await Promise.all([
    loadWorkspaceSettings(workspaceId),
    getCurrentProfile(),
    requireUser(),
  ]);

  const settings = settingsResult;
  const profile = profileResult.profile;

  if (view === "overview") {
    return <SettingsOverview workspaceId={workspaceId} />;
  }

  const section = view as SettingsSectionId;

  return (
    <>
      <SettingsSectionChrome workspaceId={workspaceId} section={section} />

      {section === "workspace" && (
        <div className="w-full max-w-5xl space-y-8">
          <BrandPreview
            workspaceLogoUrl={settings.workspace.logoUrl}
            fallbackWorkspaceName={settings.workspace.name}
            userAvatarUrl={profile?.avatar_url ?? null}
            userEmail={profile?.email ?? userResult.user.email ?? null}
          />
          <WorkspaceProfileForm workspaceId={workspaceId} settings={settings} />
        </div>
      )}
      {section === "branding" && (
        <BrandingInvoiceSettingsForm workspaceId={workspaceId} settings={settings} />
      )}
      {section === "email" && (
        <EmailSettingsForm workspaceId={workspaceId} settings={settings} />
      )}
      {section === "reminders" && (
        <RemindersSettingsSection workspaceId={workspaceId} settings={settings} />
      )}
      {section === "billing" && (
        <div className="w-full max-w-5xl">
          <BillingPlans workspaceId={workspaceId} />
        </div>
      )}
      {section === "account" && (
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
      )}
    </>
  );
}
