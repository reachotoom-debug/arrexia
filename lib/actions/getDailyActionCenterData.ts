import { instantToWorkspaceCalendarDate } from "@/lib/datetime/formatDateTime";
import { supabaseServer } from "@/lib/supabase/server";
import { getEligibleReminders } from "@/lib/reminders/getEligibleReminders";
import { buildDailyActionCategories } from "./buildDailyActionCategories";
import type {
  ChaseableInvoiceRow,
  DailyActionCenterData,
  ReminderActionContext,
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
    clientEmail: null,
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

function buildSentReminderDatesByInvoice(
  rows: Array<{ invoice_id: string; sent_at: string }>,
  workspaceTimeZone: string
): Map<string, string[]> {
  const map = new Map<string, string[]>();

  for (const row of rows) {
    const calendarDate = instantToWorkspaceCalendarDate(row.sent_at, workspaceTimeZone);
    if (!calendarDate) continue;

    const dates = map.get(row.invoice_id) ?? [];
    dates.push(calendarDate);
    map.set(row.invoice_id, dates);
  }

  return map;
}

function buildReminderActionsByInvoiceId(
  eligibleReminders: Awaited<ReturnType<typeof getEligibleReminders>>
): Record<string, ReminderActionContext> {
  const map: Record<string, ReminderActionContext> = {};

  for (const candidate of eligibleReminders) {
    if (map[candidate.invoiceId]) continue;
    map[candidate.invoiceId] = {
      invoiceId: candidate.invoiceId,
      invoiceNumber: candidate.invoiceNumber,
      clientName: candidate.clientName,
      clientEmail: candidate.clientEmail,
      ruleId: candidate.ruleId,
      templateId: candidate.templateId,
      scheduledDate: candidate.scheduledDate,
    };
  }

  return map;
}

export async function getDailyActionCenterData(
  workspaceId: string
): Promise<DailyActionCenterData> {
  const supabase = await supabaseServer();

  const [eligibleReminders, invoicesResult, settingsResult] = await Promise.all([
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
    supabase
      .from("settings")
      .select("timezone, default_currency")
      .eq("workspace_id", workspaceId)
      .maybeSingle(),
  ]);

  if (invoicesResult.error) {
    console.error("[getDailyActionCenterData] invoices_view load error", invoicesResult.error);
    throw new Error("Failed to load daily action center data");
  }

  const workspaceTimeZone = settingsResult.data?.timezone ?? "UTC";
  const defaultCurrency = settingsResult.data?.default_currency ?? "USD";
  const invoices = (invoicesResult.data ?? []).map(mapInvoiceRow);
  const invoiceIds = invoices.map((invoice) => invoice.id);

  let sentReminderDatesByInvoiceId = new Map<string, string[]>();
  if (invoiceIds.length > 0) {
    const { data: sentReminders, error: sentRemindersError } = await supabase
      .from("reminders")
      .select("invoice_id, sent_at")
      .eq("workspace_id", workspaceId)
      .eq("status", "sent")
      .not("sent_at", "is", null)
      .in("invoice_id", invoiceIds);

    if (sentRemindersError) {
      console.error(
        "[getDailyActionCenterData] sent reminders load error",
        sentRemindersError
      );
      throw new Error("Failed to load collection activity data");
    }

    sentReminderDatesByInvoiceId = buildSentReminderDatesByInvoice(
      (sentReminders ?? []) as Array<{ invoice_id: string; sent_at: string }>,
      workspaceTimeZone
    );
  }

  const reminderEligibleInvoiceIds = new Set(
    eligibleReminders.map((candidate) => candidate.invoiceId)
  );

  const { summary, collectionActions } = buildDailyActionCategories({
    invoices,
    reminderEligibleInvoiceIds,
    sentReminderDatesByInvoiceId,
    defaultCurrency,
  });

  return {
    summary,
    collectionActions,
    reminderActionsByInvoiceId: buildReminderActionsByInvoiceId(eligibleReminders),
    eligibleReminders,
  };
}

/** Reported DB round trips for R3B loader (see implementation report). */
export const DAILY_ACTION_CENTER_DB_ROUND_TRIPS = 6 as const;
