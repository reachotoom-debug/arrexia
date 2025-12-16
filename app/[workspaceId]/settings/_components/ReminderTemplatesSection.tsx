import { ReminderTemplatesTable } from "./ReminderTemplatesTable";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import type { Database } from "@/types/supabase";

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
    <Card>
      <CardHeader>
        <CardTitle>Reminder templates</CardTitle>
        <CardDescription>
          Customize the content FlowCollect sends when reminding clients about invoices.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ReminderTemplatesTable workspaceId={workspaceId} templates={templates} />
      </CardContent>
    </Card>
  );
}
