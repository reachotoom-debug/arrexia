/**
 * Core reminder engine helpers
 * Handles timing calculations, rule matching, and suggested reminders
 */

import { supabaseServer } from "@/lib/supabase/server";
import type { Database } from "@/types/supabase";

type InvoiceRow = Database["public"]["Tables"]["invoices"]["Row"];
type ReminderRuleRow = Database["public"]["Tables"]["reminder_rules"]["Row"];
type ReminderTemplateRow = Database["public"]["Tables"]["reminder_templates"]["Row"];

export interface InvoiceTiming {
  daysUntilDue: number | null;
  daysOverdue: number | null;
}

/**
 * Compute days until due and days overdue for an invoice
 */
export function computeInvoiceTiming(
  invoice: { due_date: string | null },
  today: Date = new Date()
): InvoiceTiming {
  const due = invoice.due_date ? new Date(invoice.due_date) : null;
  if (!due) {
    return { daysUntilDue: null, daysOverdue: null };
  }

  const ms = today.getTime() - due.getTime();
  const daysDiff = Math.floor(ms / (1000 * 60 * 60 * 24));

  // If negative → still before due date
  const daysOverdue = daysDiff > 0 ? daysDiff : 0;
  const daysUntilDue = daysDiff < 0 ? Math.abs(daysDiff) : 0;

  return { daysUntilDue, daysOverdue };
}

/**
 * Format "When" text for a rule based on trigger_type and offset_days
 */
export function formatRuleWhenText(triggerType: string, offsetDays: number): string {
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

/**
 * Find the applicable rule for an invoice based on timing and enabled rules
 */
export async function findApplicableRuleForInvoice(
  supabase: ReturnType<typeof supabaseServer>,
  workspaceId: string,
  invoice: {
    id: string;
    due_date: string | null;
    outstanding_amount: number;
    status?: string;
  },
  today: Date = new Date()
): Promise<{ rule: ReminderRuleRow; template: ReminderTemplateRow } | null> {
  // Only consider invoices with outstanding amount > 0
  if (!invoice.outstanding_amount || invoice.outstanding_amount <= 0) {
    return null;
  }

  const timing = computeInvoiceTiming(invoice, today);

  // Load enabled rules with joined template
  const { data: rules, error: rulesError } = await supabase
    .from("reminder_rules")
    .select(
      `
      id,
      workspace_id,
      template_id,
      trigger_type,
      offset_days,
      for_status,
      is_enabled,
      sort_order,
      reminder_templates (
        id,
        code,
        name,
        subject,
        body,
        is_enabled
      )
    `
    )
    .eq("workspace_id", workspaceId)
    .eq("is_enabled", true);

  if (rulesError || !rules) {
    console.error("[findApplicableRuleForInvoice] rulesError", rulesError);
    return null;
  }

  // Filter rules to only those with enabled templates
  type RuleWithTemplate = ReminderRuleRow & {
    reminder_templates: ReminderTemplateRow | null;
  };
  const validRules = (rules as RuleWithTemplate[]).filter((r) => {
    const template = r.reminder_templates;
    return template && template.is_enabled;
  });

  // Find matching rule based on trigger_type and timing
  for (const ruleData of validRules) {
    const rule = ruleData as ReminderRuleRow & {
      reminder_templates: ReminderTemplateRow | null;
    };

    if (!rule.reminder_templates) continue;

    let matches = false;

    if (rule.trigger_type === "before_due") {
      matches = timing.daysUntilDue === rule.offset_days;
    } else if (rule.trigger_type === "on_due") {
      matches = timing.daysUntilDue === 0;
    } else if (rule.trigger_type === "after_due") {
      matches = timing.daysOverdue === rule.offset_days;
    }

    if (!matches) continue;

    // Check if we've already sent a reminder with this rule for this invoice today
    const todayStr = today.toISOString().split("T")[0];
    const { data: existingReminders } = await supabase
      .from("reminders")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("invoice_id", invoice.id)
      .eq("rule_id", rule.id)
      .eq("status", "sent")
      .gte("sent_at", `${todayStr}T00:00:00.000Z`)
      .lte("sent_at", `${todayStr}T23:59:59.999Z`)
      .limit(1);

    // If already sent today, skip this rule
    if (existingReminders && existingReminders.length > 0) {
      continue;
    }

    return {
      rule: rule as ReminderRuleRow,
      template: rule.reminder_templates,
    };
  }

  return null;
}

export interface SuggestedReminder {
  invoiceId: string;
  clientId: string;
  workspaceId: string;
  clientName: string;
  clientEmail: string | null;
  invoiceNumber: string;
  amountDue: number;
  dueDate: string | null;
  daysOverdue: number;
  daysUntilDue: number | null;
  ruleId: string | null;
  ruleLabel: string | null;
  templateId: string | null;
  templateName: string | null;
}

/**
 * Get suggested reminders for a workspace based on enabled rules
 */
export async function getSuggestedRemindersForWorkspace(
  workspaceId: string,
  today: Date = new Date()
): Promise<SuggestedReminder[]> {
  const supabase = await supabaseServer();
  const isoToday = today.toISOString().split("T")[0];

  // Load invoices with outstanding > 0 and due_date not null
  // We'll filter by rule matching later, so load all invoices with outstanding amounts
  const { data: invoices, error: invoicesError } = await supabase
    .from("invoices")
    .select("id, workspace_id, client_id, invoice_number, due_date, outstanding_amount, status")
    .eq("workspace_id", workspaceId)
    .gt("outstanding_amount", 0)
    .not("due_date", "is", null);

  if (invoicesError) {
    console.error("[getSuggestedRemindersForWorkspace] invoicesError", invoicesError);
    return [];
  }

  if (!invoices || invoices.length === 0) {
    return [];
  }

  // Load clients for display
  const { data: clients } = await supabase
    .from("clients")
    .select("id, name, email")
    .eq("workspace_id", workspaceId);

  const clientMap = new Map<string, { name: string; email: string | null }>();
  for (const c of clients ?? []) {
    clientMap.set(c.id, { name: c.name, email: c.email ?? null });
  }

  const results: SuggestedReminder[] = [];

  for (const inv of invoices) {
    const timing = computeInvoiceTiming(inv, today);

    // Find applicable rule for this invoice
    const match = await findApplicableRuleForInvoice(supabase, workspaceId, inv, today);
    if (!match) continue;

    const client = clientMap.get(inv.client_id) ?? {
      name: "Unknown client",
      email: null,
    };

    results.push({
      invoiceId: inv.id,
      clientId: inv.client_id,
      workspaceId: inv.workspace_id,
      clientName: client.name,
      clientEmail: client.email,
      invoiceNumber: inv.invoice_number,
      amountDue: inv.outstanding_amount,
      dueDate: inv.due_date,
      daysOverdue: timing.daysOverdue ?? 0,
      daysUntilDue: timing.daysUntilDue,
      ruleId: match.rule.id,
      ruleLabel: formatRuleWhenText(match.rule.trigger_type, match.rule.offset_days),
      templateId: match.template.id,
      templateName: match.template.name,
    });
  }

  return results;
}

