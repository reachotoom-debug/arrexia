import { supabaseServer } from "@/lib/supabase/server";
import { ReminderSettingsForm } from "./ReminderSettingsForm";
import { ReminderTemplatesSection } from "./ReminderTemplatesSection";
import { ReminderRulesSection } from "./ReminderRulesSection";
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

  // Load templates and rules for this workspace
  const [templatesResult, rulesResult] = await Promise.all([
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
    <div className="space-y-6">
      {/* Workspace Reminder Settings */}
      <ReminderSettingsForm workspaceId={workspaceId} settings={settings} />

      {/* Reminder Templates Section */}
      <ReminderTemplatesSection
        workspaceId={workspaceId}
        templates={templates}
      />

      {/* Reminder Rules Section */}
      <ReminderRulesSection
        workspaceId={workspaceId}
        rules={rules}
        templates={templates}
      />
    </div>
  );
}
