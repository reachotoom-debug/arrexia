import { ReminderTemplatesTable } from "./ReminderTemplatesTable";
import { SettingsCard } from "./SettingsCard";
import type { Database } from "@/types/supabase/index";

type ReminderTemplateRow = Database["public"]["Tables"]["reminder_templates"]["Row"];

interface ReminderTemplatesSectionProps {
  workspaceId: string;
  templates: ReminderTemplateRow[];
}

export function ReminderTemplatesSection({
  workspaceId,
  templates,
}: ReminderTemplatesSectionProps) {
  return (
    <SettingsCard
      title="Templates"
      description="Customize the content FlowCollect sends when reminding clients about invoices."
    >
      <ReminderTemplatesTable workspaceId={workspaceId} templates={templates} />
    </SettingsCard>
  );
}
