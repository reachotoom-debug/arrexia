import { ReminderTemplatesTable } from "./ReminderTemplatesTable";
import { SettingsCard } from "./SettingsCard";
import type { Database } from "@/types/supabase/index";

type ReminderTemplateRow = Database["public"]["Tables"]["reminder_templates"]["Row"];

interface ReminderTemplatesSectionProps {
  workspaceId: string;
  templates: ReminderTemplateRow[];
  workspaceTimeZone: string;
}

export function ReminderTemplatesSection({
  workspaceId,
  templates,
  workspaceTimeZone,
}: ReminderTemplatesSectionProps) {
  return (
    <SettingsCard
      title="Templates"
      description="Customize the content Arrexia sends when reminding clients about invoices."
    >
      <ReminderTemplatesTable
        workspaceId={workspaceId}
        templates={templates}
        workspaceTimeZone={workspaceTimeZone}
      />
    </SettingsCard>
  );
}
