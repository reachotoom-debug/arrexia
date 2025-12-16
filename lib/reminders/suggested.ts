/**
 * Get suggested reminders for a workspace
 * Shows invoices that match enabled reminder rules
 */

import { supabaseServer } from "@/lib/supabase/server";
import { findApplicableRuleForInvoice } from "./engine";
import { formatRuleWhenText } from "./engine";
import type { SuggestedReminder } from "./engine";

// Date helper functions (since date-fns may not be installed)
function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function parseISO(dateString: string): Date {
  return new Date(dateString);
}

function differenceInCalendarDays(dateLeft: Date, dateRight: Date): number {
  const msPerDay = 1000 * 60 * 60 * 24;
  const left = startOfDay(dateLeft);
  const right = startOfDay(dateRight);
  return Math.round((left.getTime() - right.getTime()) / msPerDay);
}

/**
 * Get suggested reminders for a workspace
 * Returns invoices that match enabled rules and haven't been reminded today
 */
export async function getSuggestedRemindersForWorkspace(
  workspaceId: string
): Promise<SuggestedReminder[]> {
  const supabase = await supabaseServer();
  const today = startOfDay(new Date());

  // Load invoices with outstanding > 0, due_date not null, and relevant statuses
  const { data: invoices, error: invoicesError } = await supabase
    .from("invoices")
    .select(`
      id,
      workspace_id,
      client_id,
      invoice_number,
      status,
      due_date,
      outstanding_amount,
      currency,
      clients (
        id,
        name,
        email
      )
    `)
    .eq("workspace_id", workspaceId)
    .gt("outstanding_amount", 0)
    .not("due_date", "is", null)
    .in("status", ["sent", "overdue", "partially_paid"]);

  if (invoicesError) {
    console.error("[getSuggestedRemindersForWorkspace] invoicesError", invoicesError);
    return [];
  }

  if (!invoices || invoices.length === 0) {
    return [];
  }

  type InvoiceWithClient = {
    id: string;
    workspace_id: string;
    client_id: string;
    invoice_number: string;
    status: string | null;
    due_date: string | null;
    outstanding_amount: number;
    currency: string | null;
    clients: { id: string; name: string; email: string | null } | { id: string; name: string; email: string | null }[] | null;
  };
  // Compute daysFromDue for each invoice
  const rowsWithComputed = invoices.map((row: InvoiceWithClient) => {
    const dueDate = row.due_date ? parseISO(row.due_date) : null;
    const daysFromDue = dueDate ? differenceInCalendarDays(today, dueDate) : null;
    const isOverdue = daysFromDue !== null && daysFromDue > 0;

    return {
      ...row,
      daysFromDue,
      isOverdue,
    };
  });

  // Filter and match with rules
  const results: SuggestedReminder[] = [];

  for (const inv of rowsWithComputed) {
    if (!inv.due_date || inv.outstanding_amount <= 0) continue;

    // Find applicable rule for this invoice
    const match = await findApplicableRuleForInvoice(
      supabase,
      workspaceId,
      {
        id: inv.id,
        due_date: inv.due_date,
        outstanding_amount: inv.outstanding_amount,
        status: inv.status,
      },
      new Date()
    );

    if (!match) continue;

    const client = inv.clients
      ? Array.isArray(inv.clients)
        ? inv.clients[0]
        : inv.clients
      : null;

    results.push({
      invoiceId: inv.id,
      clientId: inv.client_id,
      workspaceId: inv.workspace_id,
      clientName: client?.name ?? "Unknown client",
      clientEmail: client?.email ?? null,
      invoiceNumber: inv.invoice_number,
      amountDue: inv.outstanding_amount,
      dueDate: inv.due_date,
      daysOverdue: inv.isOverdue ? (inv.daysFromDue ?? 0) : 0,
      daysUntilDue: !inv.isOverdue ? (inv.daysFromDue ? Math.abs(inv.daysFromDue) : null) : null,
      ruleId: match.rule.id,
      ruleLabel: formatRuleWhenText(match.rule.trigger_type, match.rule.offset_days),
      templateId: match.template.id,
      templateName: match.template.name,
    });
  }

  // Sort by daysFromDue descending (most overdue first)
  return results.sort((a, b) => {
    const aDays = a.daysOverdue > 0 ? a.daysOverdue : -(a.daysUntilDue ?? 0);
    const bDays = b.daysOverdue > 0 ? b.daysOverdue : -(b.daysUntilDue ?? 0);
    return bDays - aDays;
  });
}

