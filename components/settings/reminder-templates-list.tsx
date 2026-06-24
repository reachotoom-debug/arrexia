// @ts-nocheck
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/use-toast";
import { updateReminderTemplate, toggleReminderTemplate, toggleReminderRule } from "@/app/[workspaceId]/settings/actions";
import EditReminderTemplateModal from "./edit-reminder-template-modal";
import type { Database } from "@/types/supabase/index";

type ReminderTemplate = Database["public"]["Tables"]["reminder_templates"]["Row"];
type ReminderRule = Database["public"]["Tables"]["reminder_rules"]["Row"];

interface ReminderTemplatesListProps {
  workspaceId: string;
  templates: ReminderTemplate[];
  rules: (ReminderRule & { reminder_templates: ReminderTemplate | null })[];
}

// Helper function to format "When" text based on trigger_type and offset_days
function formatWhenText(triggerType: string, offsetDays: number): string {
  if (triggerType === "before_due") {
    return `${offsetDays} day${offsetDays !== 1 ? "s" : ""} before due`;
  } else if (triggerType === "on_due") {
    return "On due date";
  } else if (triggerType === "after_due") {
    return `${offsetDays} day${offsetDays !== 1 ? "s" : ""} after`;
  }
  // Fallback
  return `${offsetDays} days (${triggerType})`;
}

export default function ReminderTemplatesList({
  workspaceId,
  templates,
  rules,
}: ReminderTemplatesListProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [editingTemplate, setEditingTemplate] = useState<ReminderTemplate | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [togglingRuleId, setTogglingRuleId] = useState<string | null>(null);

  const handleToggle = async (template: ReminderTemplate) => {
    setTogglingId(template.id);
    try {
      await toggleReminderTemplate(workspaceId, template.id, !template.is_enabled);
      toast({
        title: "Template updated",
        description: `Template "${template.name}" has been ${!template.is_enabled ? "enabled" : "disabled"}.`,
      });
      router.refresh();
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to update template.",
        variant: "destructive",
      });
    } finally {
      setTogglingId(null);
    }
  };

  const handleEdit = (template: ReminderTemplate) => {
    setEditingTemplate(template);
  };

  const handleSave = async (templateId: string, updates: { name: string; subject: string; body: string }) => {
    try {
      await updateReminderTemplate(workspaceId, templateId, updates);
      toast({
        title: "Template saved",
        description: "Reminder template has been updated successfully.",
      });
      setEditingTemplate(null);
      router.refresh();
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to save template.",
        variant: "destructive",
      });
      throw error; // Re-throw so modal can stay open
    }
  };

  const handleToggleRule = async (rule: ReminderRule) => {
    setTogglingRuleId(rule.id);
    try {
      await toggleReminderRule(workspaceId, rule.id, !rule.is_enabled);
      toast({
        title: "Rule updated",
        description: `Reminder rule has been ${!rule.is_enabled ? "enabled" : "disabled"}.`,
      });
      router.refresh();
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to update rule.",
        variant: "destructive",
      });
    } finally {
      setTogglingRuleId(null);
    }
  };

  // Sort templates by sort_order
  const sortedTemplates = [...templates].sort((a, b) => a.sort_order - b.sort_order);
  
  // Sort rules by sort_order
  const sortedRules = [...rules].sort((a, b) => a.sort_order - b.sort_order);

  return (
    <>
      <div className="rounded-xl bg-white p-6 border border-slate-200">
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-slate-900">Reminder Templates</h2>
          <p className="mt-1 text-sm text-slate-600">
            Manage email templates used for sending payment reminders. Use variables like
            {" "}
            <code className="text-xs bg-slate-100 px-1 py-0.5 rounded">
              {`{{client_name}}`}
            </code>
            {" "}
            in your templates.
          </p>
        </div>

        {sortedTemplates.length === 0 ? (
          <div className="text-center py-8 text-sm text-slate-500">
            No reminder templates found for this workspace.
          </div>
        ) : (
          <div className="space-y-3">
            {sortedTemplates.map((template) => (
              <div
                key={template.id}
                className="flex items-center justify-between p-4 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3">
                    <h3 className="text-sm font-medium text-slate-900">
                      {template.name || "Reminder"}
                    </h3>
                    <span className="text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                      {template.code}
                    </span>
                    {!template.is_enabled && (
                      <span className="text-xs text-slate-400 bg-slate-50 px-2 py-0.5 rounded border border-slate-200">
                        Disabled
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-slate-600 line-clamp-1">
                    {template.subject}
                  </p>
                </div>

                <div className="flex items-center gap-3 ml-4">
                  {/* Toggle Switch */}
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={template.is_enabled}
                      onChange={() => handleToggle(template)}
                      disabled={togglingId === template.id}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-slate-900 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-slate-900 disabled:opacity-50 disabled:cursor-not-allowed"></div>
                  </label>

                  {/* Edit Button */}
                  <button
                    type="button"
                    onClick={() => handleEdit(template)}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                  >
                    Edit
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Reminder Rules Section */}
      <div className="rounded-xl bg-white p-6 border border-slate-200">
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-slate-900">Reminder Rules</h2>
          <p className="mt-1 text-sm text-slate-600">
            Configure when reminders are sent based on invoice due dates. Rules map templates to specific timing.
          </p>
        </div>

        {sortedRules.length === 0 ? (
          <div className="text-center py-8 text-sm text-slate-500">
            No reminder rules found for this workspace.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Template
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    When
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Enabled
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sortedRules.map((rule) => (
                  <tr
                    key={rule.id}
                    className="hover:bg-slate-50 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">
                        {rule.reminder_templates?.name || "Reminder"}
                      </div>
                      {!rule.is_enabled && (
                        <div className="text-xs text-slate-400 mt-0.5">Disabled</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {formatWhenText(rule.trigger_type, rule.offset_days)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={rule.is_enabled}
                          onChange={() => handleToggleRule(rule)}
                          disabled={togglingRuleId === rule.id}
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-slate-900 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-slate-900 disabled:opacity-50 disabled:cursor-not-allowed"></div>
                      </label>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editingTemplate && (
        <EditReminderTemplateModal
          template={editingTemplate}
          onSave={async (updates) => {
            await handleSave(editingTemplate.id, updates);
          }}
          onClose={() => setEditingTemplate(null)}
        />
      )}
    </>
  );
}

