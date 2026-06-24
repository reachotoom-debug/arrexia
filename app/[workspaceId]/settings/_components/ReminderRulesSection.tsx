import { ReminderRuleForm } from "./ReminderRuleForm";
import { ReminderRuleToggle } from "./ReminderRuleToggle";
import { SettingsCard } from "./SettingsCard";
import { formatRuleWhenText } from "@/lib/reminders/shared";
import type { Database } from "@/types/supabase/index";

type ReminderRuleRow = Database["public"]["Tables"]["reminder_rules"]["Row"] & {
  reminder_templates: { name: string } | null;
};
type ReminderTemplateRow = Database["public"]["Tables"]["reminder_templates"]["Row"];

interface ReminderRulesSectionProps {
  workspaceId: string;
  rules: ReminderRuleRow[];
  templates: ReminderTemplateRow[];
}

function formatStatusLabel(forStatus: string): string {
  switch (forStatus) {
    case "sent":
      return "Sent only";
    case "partially_paid":
      return "Partially Paid";
    case "overdue":
      return "Overdue only";
    case "any":
      return "Any status";
    case "draft":
      return "Draft";
    default:
      return forStatus;
  }
}

function sortOffsetAscending(
  a: ReminderRuleRow,
  b: ReminderRuleRow
): number {
  const ka = effectiveSortOffset(a);
  const kb = effectiveSortOffset(b);
  if (ka !== kb) return ka - kb;
  return (a.name ?? "").localeCompare(b.name ?? "");
}

/** Signed offset for ordering: negative = before due, 0 = on due, positive = after due. */
function effectiveSortOffset(rule: ReminderRuleRow): number {
  const raw = rule.offset_days ?? 0;
  switch (rule.trigger_type) {
    case "relative_to_due_date":
      return raw;
    case "before_due":
      return raw === 0 ? 0 : -Math.abs(raw);
    case "on_due":
      return 0;
    case "after_due":
      return Math.abs(raw);
    default:
      return raw;
  }
}

export function ReminderRulesSection({
  workspaceId,
  rules,
  templates,
}: ReminderRulesSectionProps) {
  const sortedRules = [...rules].sort(sortOffsetAscending);

  return (
    <SettingsCard
      title="Rules"
      description="Define when to send each reminder."
    >
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-muted-foreground">
          Rules determine when reminders are sent based on invoice status and due date.
        </p>
        <ReminderRuleForm
          workspaceId={workspaceId}
          templates={templates}
          existingRules={rules}
        />
      </div>

      {sortedRules.length === 0 ? (
        <div className="text-center py-8 text-sm text-slate-500">
          <p>No reminder rules yet.</p>
          <p className="mt-1">Create your first rule to get started.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Name
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Trigger
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Applies To
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Template
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Enabled
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sortedRules.map((rule) => (
                <tr key={rule.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 text-sm font-medium text-slate-900">
                    {rule.name}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600">
                    {formatRuleWhenText(rule.trigger_type, Number(rule.offset_days ?? 0))}
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex rounded-full px-2 py-0.5 text-xs font-medium bg-slate-100 text-slate-700">
                      {formatStatusLabel(rule.for_status)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600">
                    {rule.reminder_templates?.name || "—"}
                  </td>
                  <td className="px-4 py-3">
                    <ReminderRuleToggle
                      workspaceId={workspaceId}
                      ruleId={rule.id}
                      enabled={rule.is_enabled ?? true}
                    />
                  </td>
                  <td className="px-4 py-3 text-right text-sm">
                    <ReminderRuleForm
                      workspaceId={workspaceId}
                      rule={rule}
                      templates={templates}
                      existingRules={rules}
                      iconOnly
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SettingsCard>
  );
}

