import { instantToWorkspaceCalendarDate } from "@/lib/datetime/formatDateTime";
import { resolveWorkspaceEvaluationDate } from "@/lib/datetime/workspaceCalendar";
import { resolveCustomerFacingBusinessName } from "@/lib/branding/resolveCustomerFacingBusinessName";
import { supabaseServer } from "@/lib/supabase/server";
import { getEligibleReminders } from "@/lib/reminders/getEligibleReminders";
import { resolveClientWhatsAppPhone } from "@/lib/whatsapp/resolveClientWhatsAppPhone";
import { buildDailyActionCategories } from "./buildDailyActionCategories";
import { resolveCollectionActionExecution } from "./resolveCollectionActionExecution";
import { resolveRecommendedAction } from "./resolveRecommendedAction";
import type {
  ChaseableInvoiceRow,
  CollectionActionItem,
  DailyActionCenterData,
  ReminderActionContext,
} from "./types";

function mapInvoiceRow(
  raw: {
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
  },
  clientContactByClientId: Map<string, ClientContactRow>
): ChaseableInvoiceRow {
  const clientId = raw.client_id ?? null;
  const contact = clientId ? clientContactByClientId.get(clientId) : undefined;
  return {
    id: raw.id,
    invoiceNumber: raw.invoice_number ?? null,
    clientId,
    clientName: raw.client_name ?? null,
    clientEmail: contact?.email ?? null,
    clientPhone: resolveClientWhatsAppPhone(contact?.whatsappPhone),
    clientCountry: contact?.country ?? null,
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

function attachExecutionMetadata(
  actions: CollectionActionItem[],
  reminderActionsByInvoiceId: Record<string, ReminderActionContext>
): CollectionActionItem[] {
  return actions.map((action) => {
    const hasReminderDue = action.reasons.some((reason) => reason.type === "reminder_due");
    const reminderAction = reminderActionsByInvoiceId[action.id];
    const clientEmail = reminderAction?.clientEmail ?? action.clientEmail;

    const execution = resolveCollectionActionExecution({
      hasReminderDue,
      reminderAction,
      clientEmail,
    });

    return {
      ...action,
      clientEmail,
      execution,
      recommendedAction: resolveRecommendedAction({
        reasons: action.reasons,
        execution,
        isHighRisk: action.isHighRisk,
      }),
    };
  });
}

type ClientContactRow = {
  email: string | null;
  whatsappPhone: string | null;
  whatsapp: string | null;
  country: string | null;
};

async function loadClientContactsById(
  supabase: Awaited<ReturnType<typeof supabaseServer>>,
  workspaceId: string,
  clientIds: string[]
): Promise<Map<string, ClientContactRow>> {
  const map = new Map<string, ClientContactRow>();
  if (clientIds.length === 0) return map;

  const { data, error } = await supabase
    .from("clients")
    .select("id, email, whatsapp_phone, whatsapp, country")
    .eq("workspace_id", workspaceId)
    .in("id", clientIds);

  if (error) {
    console.error("[getDailyActionCenterData] clients contact load error", error);
    throw new Error("Failed to load client contact data");
  }

  for (const row of data ?? []) {
    map.set(row.id, {
      email: row.email ?? null,
      whatsappPhone: row.whatsapp_phone ?? null,
      whatsapp: row.whatsapp ?? null,
      country: row.country ?? null,
    });
  }

  return map;
}

export async function getDailyActionCenterData(
  workspaceId: string
): Promise<DailyActionCenterData> {
  const supabase = await supabaseServer();

  const [eligibleReminders, invoicesResult, settingsResult, sentInvoiceCountResult, workspaceResult] =
    await Promise.all([
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
      .select(
        "timezone, default_currency, branding_business_legal_name, business_name, workspace_display_name"
      )
      .eq("workspace_id", workspaceId)
      .maybeSingle(),
    supabase
      .from("invoices_view")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .eq("base_status", "sent")
      .is("archived_at", null),
    supabase.from("workspaces").select("name").eq("id", workspaceId).maybeSingle(),
  ]);

  if (invoicesResult.error) {
    console.error("[getDailyActionCenterData] invoices_view load error", invoicesResult.error);
    throw new Error("Failed to load daily action center data");
  }

  const workspaceTimeZone = settingsResult.data?.timezone ?? "UTC";
  const defaultCurrency = settingsResult.data?.default_currency ?? "USD";
  const businessName = resolveCustomerFacingBusinessName({
    brandingBusinessLegalName: settingsResult.data?.branding_business_legal_name,
    businessName: settingsResult.data?.business_name,
    workspaceDisplayName: settingsResult.data?.workspace_display_name,
    workspaceName: workspaceResult.data?.name,
  });
  const sentInvoiceCount = sentInvoiceCountResult.count ?? 0;
  const rawInvoices = invoicesResult.data ?? [];
  const clientIds = [
    ...new Set(
      rawInvoices
        .map((row) => row.client_id)
        .filter((clientId): clientId is string => Boolean(clientId))
    ),
  ];

  const clientContactByClientId = await loadClientContactsById(supabase, workspaceId, clientIds);
  const invoices = rawInvoices.map((row) => mapInvoiceRow(row, clientContactByClientId));
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
  const reminderActionsByInvoiceId = buildReminderActionsByInvoiceId(eligibleReminders);

  const evaluationDate = resolveWorkspaceEvaluationDate(new Date(), workspaceTimeZone);

  const { summary, collectionActions } = buildDailyActionCategories({
    invoices,
    reminderEligibleInvoiceIds,
    sentReminderDatesByInvoiceId,
    defaultCurrency,
    sentInvoiceCount,
    evaluationDate,
  });

  const collectionActionsWithExecution = attachExecutionMetadata(
    collectionActions,
    reminderActionsByInvoiceId
  );

  return {
    summary,
    collectionActions: collectionActionsWithExecution,
    reminderActionsByInvoiceId,
    eligibleReminders,
    businessName,
    workspaceTimeZone,
    evaluationDate,
  };
}

/** Reported DB round trips for R3C loader. */
export const DAILY_ACTION_CENTER_DB_ROUND_TRIPS = 9 as const;
