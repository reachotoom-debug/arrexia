import { getWorkspacePlan } from "@/lib/billing/getWorkspacePlan";
import { canManageReminderRules } from "@/lib/billing/reminderRulesAccess";
import { supabaseServer } from "@/lib/supabase/server";
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

  const [planResult, templatesResult, rulesResult] = await Promise.all([
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
  ]);

  const templates = templatesResult.data ?? [];
  const rules = rulesResult.data ?? [];

  return (
    <RemindersSettingsTabs
      workspaceId={workspaceId}
      settings={settings}
      templates={templates}
      rules={rules}
      canManageRules={canManageReminderRules(planResult.plan)}
    />
  );
}
