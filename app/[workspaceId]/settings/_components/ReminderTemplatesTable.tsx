"use client";

import { ReminderTemplateFormDialog } from "./ReminderTemplateFormDialog";
import { ReminderTemplateDeleteButton } from "./ReminderTemplateDeleteButton";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import type { Database } from "@/types/supabase/index";

type ReminderTemplateRow = Database["public"]["Tables"]["reminder_templates"]["Row"];

interface ReminderTemplatesTableProps {
  workspaceId: string;
  templates: ReminderTemplateRow[];
}

function formatDate(dateString: string | null): string {
  if (!dateString) return "—";
  const date = new Date(dateString);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
}

export function ReminderTemplatesTable({
  workspaceId,
  templates,
}: ReminderTemplatesTableProps) {
  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-muted-foreground">
          Templates control the subject and body of reminder emails. You can mark one template per channel as default.
        </p>
        <ReminderTemplateFormDialog mode="create" workspaceId={workspaceId} />
      </div>

      {templates.length === 0 ? (
        <div className="text-center py-8 text-sm text-slate-500">
          <p>No reminder templates yet.</p>
          <p className="mt-1">Create your first template to get started.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Channel</TableHead>
              <TableHead>Subject</TableHead>
              <TableHead>Updated</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {templates.map((template) => (
              <TableRow key={template.id}>
                <TableCell className="font-medium text-slate-900">
                  <div className="flex items-center gap-2">
                    {template.name}
                    {template.is_default && (
                      <Badge variant="default">Default</Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge
                    variant="default"
                    className={
                      template.channel === "whatsapp"
                        ? "bg-green-100 text-green-700"
                        : "bg-blue-100 text-blue-700"
                    }
                  >
                    {template.channel === "whatsapp" ? "WhatsApp" : "Email"}
                  </Badge>
                </TableCell>
                <TableCell className="text-slate-600">
                  <span className="truncate block max-w-xs" title={template.subject}>
                    {template.subject}
                  </span>
                </TableCell>
                <TableCell className="text-slate-500">
                  {formatDate(template.updated_at || template.created_at)}
                </TableCell>
                <TableCell>
                  <Badge
                    variant={template.is_enabled ? "default" : "secondary"}
                    className={
                      template.is_enabled
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-slate-100 text-slate-600"
                    }
                  >
                    {template.is_enabled ? "Enabled" : "Disabled"}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-2">
                    <ReminderTemplateFormDialog
                      mode="edit"
                      workspaceId={workspaceId}
                      iconOnly
                      template={{
                        id: template.id,
                        name: template.name,
                        description: template.description,
                        channel: (template.channel as "email" | "whatsapp") || "email",
                        subject: template.subject,
                        body: template.body,
                        isEnabled: template.is_enabled ?? true,
                        isDefault: template.is_default ?? false,
                      }}
                    />
                    <ReminderTemplateDeleteButton
                      workspaceId={workspaceId}
                      templateId={template.id}
                      templateName={template.name}
                    />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        </div>
      )}
    </>
  );
}
