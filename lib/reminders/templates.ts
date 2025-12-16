import { supabaseServer } from "@/lib/supabase/server";
import type { Database } from "@/types/supabase";

type ReminderTemplateRow = Database["public"]["Tables"]["reminder_templates"]["Row"];

/**
 * Ensures that default reminder templates exist for a workspace.
 * If no templates exist, seeds 5 default templates.
 * Returns all templates for the workspace (existing or newly created).
 */
export async function ensureReminderTemplatesForWorkspace(
  workspaceId: string
): Promise<ReminderTemplateRow[]> {
  const supabase = await supabaseServer();

  // 1) Check if templates already exist
  const { data: existing, error: existingError } = await supabase
    .from("reminder_templates")
    .select("id, code, is_enabled, workspace_id")
    .eq("workspace_id", workspaceId);

  if (existingError) {
    console.error(
      "[ensureReminderTemplatesForWorkspace] existingError",
      existingError
    );
    throw existingError;
  }

  if (existing && existing.length > 0) {
    // Templates already exist, return them
    return existing as ReminderTemplateRow[];
  }

  // 2) Seed 5 default templates
  const defaults = [
    {
      code: "pre_due",
      name: "Reminder: upcoming due date",
      subject: "Upcoming payment due for invoice {{invoice_number}}",
      body:
        "Hi {{client_name}},\n\n" +
        "This is a friendly reminder that invoice {{invoice_number}} for {{amount_due}} is due on {{due_date}}.\n\n" +
        "Thank you.",
    },
    {
      code: "due_day",
      name: "Reminder: due today",
      subject: "Invoice {{invoice_number}} is due today",
      body:
        "Hi {{client_name}},\n\n" +
        "Invoice {{invoice_number}} for {{amount_due}} is due today ({{due_date}}).\n\n" +
        "Thank you.",
    },
    {
      code: "plus_3",
      name: "Reminder: 3 days overdue",
      subject: "Invoice {{invoice_number}} is 3 days overdue",
      body:
        "Hi {{client_name}},\n\n" +
        "Invoice {{invoice_number}} for {{amount_due}} is now 3 days overdue (due {{due_date}}).\n\n" +
        "Please arrange payment at your earliest convenience.",
    },
    {
      code: "plus_7",
      name: "Reminder: 7 days overdue",
      subject: "Invoice {{invoice_number}} is 7 days overdue",
      body:
        "Hi {{client_name}},\n\n" +
        "Invoice {{invoice_number}} for {{amount_due}} is now 7 days overdue (due {{due_date}}).\n\n" +
        "We appreciate your prompt attention to this payment.",
    },
    {
      code: "final",
      name: "Reminder: final notice",
      subject: "Final notice for invoice {{invoice_number}}",
      body:
        "Hi {{client_name}},\n\n" +
        "This is a final reminder that invoice {{invoice_number}} for {{amount_due}} is still unpaid, " +
        "{{days_overdue}} days after the due date ({{due_date}}).\n\n" +
        "Please contact us if you have any questions.",
    },
  ];

  const payload = defaults.map((t, index) => ({
    workspace_id: workspaceId,
    code: t.code,
    name: t.name,
    subject: t.subject,
    body: t.body,
    is_enabled: true,
    sort_order: index, // Add sort_order for consistent ordering
  }));

  const { data: inserted, error: insertError } = await supabase
    .from("reminder_templates")
    .insert(payload)
    .select("id, code, is_enabled, workspace_id, name, subject, body, sort_order");

  if (insertError) {
    console.error(
      "[ensureReminderTemplatesForWorkspace] insertError",
      insertError
    );
    throw insertError;
  }

  return (inserted || []) as ReminderTemplateRow[];
}

