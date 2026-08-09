import { getWorkspacePlan } from "@/lib/billing/getWorkspacePlan";
import { canManageReminderRulesForEntitlement } from "@/lib/billing/reminderRulesAccess";
import { loadEmailReadinessForWorkspace } from "@/lib/reminders/emailReadinessGate";
import { supabaseServer } from "@/lib/supabase/server";
import { loadWorkspaceTimeZone } from "@/lib/settings/loadSettings";
import { resolveSafeTimeZone } from "@/lib/datetime/formatDateTime";
import { RemindersSettingsTabs } from "./RemindersSettingsTabs";
import type { WorkspaceSettings } from "@/lib/settings/loadSettings";

interface RemindersSettingsSectionProps {
  workspaceId: string;
  settings: WorkspaceSettings;
}

export async function RemindersSettingsSection({
  workspaceId,
  settings,
}: RemindersSettingsSectionProps) {
  const supabase = await supabaseServer();

  const [planResult, templatesResult, rulesResult, emailReadiness, workspaceTimeZone] =
    await Promise.all([
      getWorkspacePlan(workspaceId),
      supabase
        .from("reminder_templates")
        .select("*")
        .eq("workspace_id", workspaceId)
        .order("updated_at", { ascending: false }),
      supabase
        .from("reminder_rules")
        .select("*, reminder_templates(name)")
        .eq("workspace_id", workspaceId)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true }),
      loadEmailReadinessForWorkspace(supabase, workspaceId),
      loadWorkspaceTimeZone(workspaceId),
    ]);

  const templates = templatesResult.data ?? [];
  const rules = rulesResult.data ?? [];

  return (
    <RemindersSettingsTabs
      workspaceId={workspaceId}
      settings={settings}
      templates={templates}
      rules={rules}
      canManageRules={canManageReminderRulesForEntitlement(planResult.entitlement)}
      emailReadyForAutomation={emailReadiness.ready}
      emailSkipReason={emailReadiness.ready ? null : emailReadiness.skipReason}
      workspaceTimeZone={resolveSafeTimeZone(workspaceTimeZone)}
    />
  );
}
