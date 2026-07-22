import "server-only";

/**
 * Core reminder engine helpers
 * Handles timing calculations, rule matching, and suggested reminders
 */

import { formatRuleWhenText } from "./shared";
import {
  computeInvoiceTiming,
  matchesReminderRuleTrigger,
  type InvoiceTiming,
} from "./ruleTrigger";
import { supabaseServer } from "@/lib/supabase/server";
import { INVOICE_VIEW_BASE_FIELDS } from "@/lib/db/invoicesView";
import type { Database } from "@/types/supabase/index";

type InvoiceRow = Database["public"]["Tables"]["invoices"]["Row"];
type ReminderRuleRow = Database["public"]["Tables"]["reminder_rules"]["Row"];
type ReminderTemplateRow = Database["public"]["Tables"]["reminder_templates"]["Row"];

export type { InvoiceTiming };
export { computeInvoiceTiming, matchesReminderRuleTrigger };

/**
 * Resolve reminder type based on the difference between today and due date
 * 
 * Rules:
 * - today = due_date - 3 → "upcoming"
 * - today = due_date → "due"
 * - today = due_date + 3 → "overdue"
 * - today = due_date + 7 → "final"
 * - Else → null
 * 
 * @param dueDate - The invoice due date (Date object or date string)
 * @param today - The current date (defaults to new Date())
 * @returns Reminder type string or null if no match
 */
export function resolveReminderType(
  dueDate: Date | string | null,
  today: Date = new Date()
): "upcoming" | "due" | "overdue" | "final" | null {
  if (!dueDate) {
    return null;
  }

  const due = typeof dueDate === "string" ? new Date(dueDate) : dueDate;
  if (isNaN(due.getTime())) {
    return null;
  }

  // Normalize dates to midnight (UTC) to compare only date parts, ignoring time
  const todayNormalized = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
  const dueNormalized = new Date(Date.UTC(due.getFullYear(), due.getMonth(), due.getDate()));

  // Calculate difference in days (today - due_date)
  const msDiff = todayNormalized.getTime() - dueNormalized.getTime();
  const daysDiff = Math.floor(msDiff / (1000 * 60 * 60 * 24));

  // Match specific day differences
  if (daysDiff === -3) {
    return "upcoming";
  } else if (daysDiff === 0) {
    return "due";
  } else if (daysDiff === 3) {
    return "overdue";
  } else if (daysDiff === 7) {
    return "final";
  }

  return null;
}

/**
 * Find the applicable rule for an invoice based on timing and enabled rules
 */
export async function findApplicableRuleForInvoice(
  supabasePromise: ReturnType<typeof supabaseServer>,
  workspaceId: string,
  invoice: {
    id: string;
    due_date: string | null;
    outstanding: number; // From invoices_view.outstanding
    status?: string;
  },
  today: Date = new Date()
): Promise<{ rule: ReminderRuleRow; template: ReminderTemplateRow } | null> {
  // Only consider invoices with outstanding amount > 0
  if (!invoice.outstanding || invoice.outstanding <= 0) {
    return null;
  }

  const timing = computeInvoiceTiming(invoice, today);

  // Load enabled rules with joined template
  const supabase = await supabasePromise;
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
  type RuleWithTemplate = {
    id: string;
    workspace_id: string;
    template_id: string;
    trigger_type: string;
    offset_days: number;
    for_status: string;
    is_enabled: boolean | null;
    sort_order: number | null;
    reminder_templates: {
      id: string;
      code: string | null;
      name: string | null;
      subject: string | null;
      body: string | null;
      is_enabled: boolean | null;
    }[];
  };
  const validRules = (rules ?? []).filter(
    (r): r is RuleWithTemplate =>
      Array.isArray(r.reminder_templates) &&
      r.reminder_templates.length > 0 &&
      !!r.reminder_templates[0]?.is_enabled
  );

  // Find matching rule based on trigger_type and timing
  for (const ruleData of validRules) {
    const template = ruleData.reminder_templates[0];
    if (!template) continue;

    if (
      !matchesReminderRuleTrigger(
        timing,
        ruleData.trigger_type,
        ruleData.offset_days
      )
    ) {
      continue;
    }

    // Check if we've already sent a reminder with this rule for this invoice today
    const todayStr = today.toISOString().split("T")[0];
    const { data: existingReminders } = await supabase
      .from("reminders")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("invoice_id", invoice.id)
      .eq("rule_id", ruleData.id)
      .eq("status", "sent")
      .gte("sent_at", `${todayStr}T00:00:00.000Z`)
      .lte("sent_at", `${todayStr}T23:59:59.999Z`)
      .limit(1);

    // If already sent today, skip this rule
    if (existingReminders && existingReminders.length > 0) {
      continue;
    }

    return {
      rule: ruleData as unknown as ReminderRuleRow,
      template: template as unknown as ReminderTemplateRow,
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
  const supabasePromise = supabaseServer();
  const isoToday = today.toISOString().split("T")[0];

  // Load invoices with outstanding > 0 and due_date not null
  // We'll filter by rule matching later, so load all invoices with outstanding amounts
  // Always exclude archived invoices from reminder candidates
  // NOTE: Use invoices_view for outstanding field (outstanding_amount was dropped from invoices table)
  const supabase = await supabasePromise;
  const { data: invoices, error: invoicesError } = await supabase
    .from("invoices_view")
    .select("id, workspace_id, client_id, invoice_number, due_date, outstanding, display_status")
    .eq("workspace_id", workspaceId)
    // Reminders eligibility: only invoices with outstanding > 0 and not archived
    // This uses invoices_view as the single source of truth.
    .is("archived_at", null)
    .gt("outstanding", 0)
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
    // Reminders eligibility: clients must be active AND not archived
    // This rule must match all reminders queries globally.
    .eq("workspace_id", workspaceId)
    .eq("is_active", true)
    .is("archived_at", null);

  const clientMap = new Map<string, { name: string; email: string | null }>();
  for (const c of clients ?? []) {
    clientMap.set(c.id, { name: c.name, email: c.email ?? null });
  }

  const results: SuggestedReminder[] = [];

  for (const inv of invoices) {
    const timing = computeInvoiceTiming(inv, today);

    // Find applicable rule for this invoice
    const match = await findApplicableRuleForInvoice(supabasePromise, workspaceId, {
      id: inv.id,
      due_date: inv.due_date,
      outstanding: Number(inv.outstanding ?? 0),
      status: inv.display_status ?? undefined,
    }, today);
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
      amountDue: Number(inv.outstanding ?? 0),
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

