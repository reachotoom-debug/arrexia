import { supabaseServer } from "@/lib/supabase/server";
import { getEligibleReminders } from "@/lib/reminders/getEligibleReminders";
import { buildDailyActionCategories } from "./buildDailyActionCategories";
import type {
  ChaseableInvoiceRow,
  DailyActionCenterData,
  SuggestedReminderRow,
} from "./types";

function mapInvoiceRow(raw: {
  id: string;
  invoice_number: string | null;
  client_id: string | null;
  client_name: string | null;
  due_date: string | null;
  outstanding: number | null;
  currency: string | null;
  display_status: string | null;
  base_status: string | null;
  is_overdue: boolean | null;
  overdue_days: number | null;
  risk_level: string | null;
  client_is_active: boolean | null;
  client_archived_at: string | null;
  archived_at: string | null;
}): ChaseableInvoiceRow {
  return {
    id: raw.id,
    invoiceNumber: raw.invoice_number ?? null,
    clientId: raw.client_id ?? null,
    clientName: raw.client_name ?? null,
    dueDate: raw.due_date ?? null,
    outstanding: Number(raw.outstanding ?? 0),
    currency: raw.currency ?? null,
    displayStatus: raw.display_status ?? null,
    baseStatus: raw.base_status ?? null,
    isOverdue: Boolean(raw.is_overdue),
    overdueDays: Number(raw.overdue_days ?? 0),
    riskLevel:
      raw.risk_level === "high" || raw.risk_level === "medium" || raw.risk_level === "low"
        ? raw.risk_level
        : null,
    clientIsActive: Boolean(raw.client_is_active),
    clientArchivedAt: raw.client_archived_at ?? null,
    archivedAt: raw.archived_at ?? null,
  };
}

export function mapEligibleRemindersToSuggestedRows(
  candidates: Awaited<ReturnType<typeof getEligibleReminders>>
): SuggestedReminderRow[] {
  return candidates.map((c) => ({
    id: c.id,
    invoice_id: c.invoiceId,
    invoice_number: c.invoiceNumber,
    status: c.displayStatus,
    due_date: c.dueDate,
    outstanding: c.outstanding,
    currency: c.currency,
    client:
      c.clientId && (c.clientName || c.clientEmail)
        ? {
            id: c.clientId,
            name: c.clientName,
            email: c.clientEmail,
          }
        : null,
    days_from_due: c.daysFromDueDate,
    tag: c.ruleLabel,
    is_overdue: c.isOverdue,
    client_name: c.clientName,
    client_email: c.clientEmail,
    rule_id: c.ruleId,
    rule_name: c.ruleName,
    rule_label: c.ruleLabel,
    template_id: c.templateId,
    scheduled_date: c.scheduledDate,
  }));
}

export async function getDailyActionCenterData(
  workspaceId: string
): Promise<DailyActionCenterData> {
  const supabase = await supabaseServer();

  const [eligibleReminders, invoicesResult] = await Promise.all([
    getEligibleReminders(workspaceId),
    supabase
      .from("invoices_view")
      .select(
        `
          id,
          invoice_number,
          client_id,
          client_name,
          due_date,
          outstanding,
          currency,
          display_status,
          base_status,
          is_overdue,
          overdue_days,
          risk_level,
          client_is_active,
          client_archived_at,
          archived_at
        `
      )
      .eq("workspace_id", workspaceId)
      .gt("outstanding", 0)
      .is("archived_at", null),
  ]);

  if (invoicesResult.error) {
    console.error("[getDailyActionCenterData] invoices_view load error", invoicesResult.error);
    throw new Error("Failed to load daily action center data");
  }

  const invoices = (invoicesResult.data ?? []).map(mapInvoiceRow);
  const reminderEligibleInvoiceIds = new Set(
    eligibleReminders.map((candidate) => candidate.invoiceId)
  );

  const { summary, needsAction, highRisk } = buildDailyActionCategories({
    invoices,
    reminderEligibleInvoiceIds,
    remindersDueRowCount: eligibleReminders.length,
  });

  return {
    summary,
    needsAction,
    reminders: eligibleReminders,
    highRisk,
  };
}
