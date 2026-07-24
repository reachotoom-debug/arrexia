/**
 * R2B — Suggested reminders orchestration over canonical R2A eligibility.
 * Pure evaluation lives here; Supabase I/O is isolated in getEligibleReminders().
 */

import { resolveWorkspaceEvaluationDate } from "@/lib/datetime/workspaceCalendar";
import {
  evaluateReminderEligibility,
  type ReminderEligibilityReason,
  type ReminderHistoryEntry,
} from "./eligibility";
import { formatRuleWhenText } from "./shared";
import {
  normalizeJoinedReminderTemplate,
  ruleHasUsableReminderTemplate,
  type ReminderTemplateEligibilityRow,
} from "./ruleTemplate";

export type EligibleReminderCandidate = {
  /** Stable row key: `${invoiceId}:${ruleId}` */
  id: string;
  invoiceId: string;
  invoiceNumber: string | null;
  clientId: string | null;
  clientName: string | null;
  clientEmail: string | null;
  dueDate: string;
  total: number;
  paid: number;
  outstanding: number;
  baseStatus: string | null;
  displayStatus: string | null;
  currency: string | null;
  isOverdue: boolean;
  ruleId: string;
  ruleName: string;
  templateId: string | null;
  triggerType: string;
  offsetDays: number;
  scheduledDate: string;
  daysFromDueDate: number | null;
  ruleLabel: string;
  eligibilityReason: ReminderEligibilityReason;
};

export type InvoiceCandidateRow = {
  id: string;
  invoice_number: string | null;
  client_id: string | null;
  client_name: string | null;
  client_is_active: boolean | null;
  client_archived_at: string | null;
  archived_at?: string | null;
  due_date: string;
  outstanding: number;
  paid: number;
  total: number;
  base_status: string | null;
  display_status: string | null;
  currency: string | null;
  is_overdue: boolean | null;
  overdue_days: number | null;
};

export type ReminderRuleCandidateRow = {
  id: string;
  name: string;
  trigger_type: string;
  offset_days: number;
  for_status: string | null;
  is_enabled: boolean;
  template_id: string | null;
  sort_order: number | null;
  created_at?: string | null;
  reminder_template?:
    | ReminderTemplateEligibilityRow
    | ReminderTemplateEligibilityRow[]
    | null;
};

export type ReminderHistoryCandidateRow = {
  invoice_id: string;
  rule_id: string | null;
  status: string;
  sent_at: string | null;
};

/** PostgREST nested-select shape for reminder_rules + reminder_templates join. */
export type SupabaseReminderRuleRow = {
  id: string;
  name: string;
  trigger_type: string;
  offset_days: number;
  for_status: string | null;
  is_enabled: boolean;
  template_id: string | null;
  sort_order: number | null;
  created_at?: string | null;
  reminder_templates?:
    | ReminderTemplateEligibilityRow
    | ReminderTemplateEligibilityRow[]
    | null;
};

/** Maps Supabase/PostgREST rule rows to the internal ReminderRuleCandidateRow contract. */
export function mapSupabaseReminderRulesToCandidates(
  rows: SupabaseReminderRuleRow[]
): ReminderRuleCandidateRow[] {
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    trigger_type: row.trigger_type,
    offset_days: row.offset_days,
    for_status: row.for_status,
    is_enabled: row.is_enabled,
    template_id: row.template_id,
    sort_order: row.sort_order,
    created_at: row.created_at,
    reminder_template: normalizeJoinedReminderTemplate(row.reminder_templates),
  }));
}

function compareRules(a: ReminderRuleCandidateRow, b: ReminderRuleCandidateRow): number {
  const sortA = a.sort_order ?? Number.MAX_SAFE_INTEGER;
  const sortB = b.sort_order ?? Number.MAX_SAFE_INTEGER;
  if (sortA !== sortB) return sortA - sortB;
  const createdA = a.created_at ?? "";
  const createdB = b.created_at ?? "";
  if (createdA !== createdB) return createdA.localeCompare(createdB);
  return a.id.localeCompare(b.id);
}

function groupHistoryByInvoiceId(
  historyRows: ReminderHistoryCandidateRow[]
): Map<string, ReminderHistoryEntry[]> {
  const map = new Map<string, ReminderHistoryEntry[]>();
  for (const row of historyRows) {
    const entries = map.get(row.invoice_id) ?? [];
    entries.push({
      ruleId: row.rule_id,
      status: row.status,
      sentAt: row.sent_at,
    });
    map.set(row.invoice_id, entries);
  }
  return map;
}

/**
 * Pure in-memory evaluation: one candidate per eligible invoice × rule occurrence.
 * Rules are evaluated in deterministic sort_order (then created_at, then id).
 */
export function buildEligibleReminderCandidates(params: {
  workspaceId: string;
  evaluationDate: string;
  workspaceTimeZone: string;
  invoices: InvoiceCandidateRow[];
  rules: ReminderRuleCandidateRow[];
  historyRows: ReminderHistoryCandidateRow[];
  clientEmailsByClientId: Map<string, string | null>;
}): EligibleReminderCandidate[] {
  const {
    workspaceId,
    evaluationDate,
    workspaceTimeZone,
    invoices,
    rules,
    historyRows,
    clientEmailsByClientId,
  } = params;

  const enabledRules = rules
    .filter((rule) => rule.is_enabled)
    .filter((rule) => ruleHasUsableReminderTemplate(rule, workspaceId))
    .slice()
    .sort(compareRules);

  if (enabledRules.length === 0) {
    return [];
  }

  const historyByInvoiceId = groupHistoryByInvoiceId(historyRows);
  const results: EligibleReminderCandidate[] = [];

  for (const invoice of invoices) {
    if (!invoice.due_date || !(invoice.outstanding > 0)) {
      continue;
    }

    const history = historyByInvoiceId.get(invoice.id) ?? [];
    const clientEmail =
      invoice.client_id != null
        ? clientEmailsByClientId.get(invoice.client_id) ?? null
        : null;

    for (const rule of enabledRules) {
      const eligibility = evaluateReminderEligibility({
        evaluationDate,
        workspaceTimeZone,
        rule: {
          id: rule.id,
          isEnabled: rule.is_enabled,
          triggerType: rule.trigger_type,
          offsetDays: Number(rule.offset_days ?? 0),
          forStatus: rule.for_status,
        },
        invoice: {
          dueDate: invoice.due_date,
          outstanding: Number(invoice.outstanding),
          paid: Number(invoice.paid ?? 0),
          baseStatus: invoice.base_status,
          archivedAt: invoice.archived_at ?? null,
          clientArchivedAt: invoice.client_archived_at,
          clientIsActive: invoice.client_is_active,
        },
        history,
      });

      if (!eligibility.eligible || !eligibility.scheduledDate) {
        continue;
      }

      results.push({
        id: `${invoice.id}:${rule.id}`,
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoice_number,
        clientId: invoice.client_id,
        clientName: invoice.client_name,
        clientEmail,
        dueDate: invoice.due_date.slice(0, 10),
        total: Number(invoice.total ?? 0),
        paid: Number(invoice.paid ?? 0),
        outstanding: Number(invoice.outstanding),
        baseStatus: invoice.base_status,
        displayStatus: invoice.display_status,
        currency: invoice.currency,
        isOverdue: invoice.is_overdue ?? false,
        ruleId: rule.id,
        ruleName: rule.name,
        templateId: rule.template_id,
        triggerType: rule.trigger_type,
        offsetDays: Number(rule.offset_days ?? 0),
        scheduledDate: eligibility.scheduledDate,
        daysFromDueDate: eligibility.daysFromDueDate ?? null,
        ruleLabel: formatRuleWhenText(rule.trigger_type, Number(rule.offset_days ?? 0)),
        eligibilityReason: eligibility.reason,
      });
    }
  }

  return results.sort((a, b) => {
    const ruleA = enabledRules.find((r) => r.id === a.ruleId);
    const ruleB = enabledRules.find((r) => r.id === b.ruleId);
    const ruleCompare =
      ruleA && ruleB ? compareRules(ruleA, ruleB) : a.ruleId.localeCompare(b.ruleId);
    if (ruleCompare !== 0) return ruleCompare;
    const dueCompare = a.dueDate.localeCompare(b.dueDate);
    if (dueCompare !== 0) return dueCompare;
    return a.invoiceId.localeCompare(b.invoiceId);
  });
}

export type GetEligibleRemindersOptions = {
  /** Override "now" for deterministic evaluation (tests / callers). */
  evaluationInstant?: Date;
};

/**
 * Loads workspace data and returns rule-eligible reminder occurrences for today
 * (workspace-local calendar date).
 */
export async function getEligibleReminders(
  workspaceId: string,
  options: GetEligibleRemindersOptions = {}
): Promise<EligibleReminderCandidate[]> {
  const { supabaseServer } = await import("@/lib/supabase/server");
  const supabase = await supabaseServer();
  const evaluationInstant = options.evaluationInstant ?? new Date();

  const { data: settingsRow } = await supabase
    .from("settings")
    .select("timezone")
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  const workspaceTimeZone = settingsRow?.timezone ?? "UTC";
  const evaluationDate = resolveWorkspaceEvaluationDate(
    evaluationInstant,
    workspaceTimeZone
  );

  const { data: rules, error: rulesError } = await supabase
    .from("reminder_rules")
    .select(
      `
        id,
        name,
        trigger_type,
        offset_days,
        for_status,
        is_enabled,
        template_id,
        sort_order,
        created_at,
        reminder_templates (
          id,
          workspace_id,
          is_enabled
        )
      `
    )
    .eq("workspace_id", workspaceId)
    .eq("is_enabled", true)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });

  if (rulesError) {
    console.error("[getEligibleReminders] rules load error", rulesError);
    return [];
  }

  if (!rules || rules.length === 0) {
    return [];
  }

  const { data: invoices, error: invoicesError } = await supabase
    .from("invoices_view")
    .select(
      `
        id,
        invoice_number,
        client_id,
        client_name,
        client_is_active,
        client_archived_at,
        due_date,
        outstanding,
        paid,
        total,
        base_status,
        display_status,
        currency,
        is_overdue,
        overdue_days,
        clients (
          id,
          email
        )
      `
    )
    .eq("workspace_id", workspaceId)
    .gt("outstanding", 0)
    .not("due_date", "is", null);

  if (invoicesError) {
    console.error("[getEligibleReminders] invoices load error", invoicesError);
    return [];
  }

  if (!invoices || invoices.length === 0) {
    return [];
  }

  const invoiceIds = invoices.map((inv) => inv.id);
  const clientEmailsByClientId = new Map<string, string | null>();

  for (const inv of invoices) {
    if (!inv.client_id) continue;
    const clientRelation = Array.isArray(inv.clients)
      ? inv.clients[0]
      : inv.clients;
    clientEmailsByClientId.set(
      inv.client_id,
      clientRelation?.email ?? null
    );
  }

  // Batch-load reminder history for duplicate evaluation (R2A).
  // Tenant isolation: MUST scope by workspace_id in addition to candidate invoice IDs
  // so another workspace's sent rows never suppress this workspace's eligibility.
  let historyRows: ReminderHistoryCandidateRow[] = [];
  if (invoiceIds.length > 0) {
    const { data, error: historyError } = await supabase
      .from("reminders")
      .select("invoice_id, rule_id, status, sent_at")
      .eq("workspace_id", workspaceId)
      .in("invoice_id", invoiceIds);

    if (historyError) {
      console.error("[getEligibleReminders] history load error", historyError);
      return [];
    }

    historyRows = (data ?? []) as ReminderHistoryCandidateRow[];
  }

  const invoiceCandidates: InvoiceCandidateRow[] = invoices.map((inv) => ({
    id: inv.id,
    invoice_number: inv.invoice_number ?? null,
    client_id: inv.client_id ?? null,
    client_name: inv.client_name ?? null,
    client_is_active: inv.client_is_active ?? null,
    client_archived_at: inv.client_archived_at ?? null,
    due_date: inv.due_date as string,
    outstanding: Number(inv.outstanding ?? 0),
    paid: Number(inv.paid ?? 0),
    total: Number(inv.total ?? 0),
    base_status: inv.base_status ?? null,
    display_status: inv.display_status ?? null,
    currency: inv.currency ?? null,
    is_overdue: inv.is_overdue ?? null,
    overdue_days: inv.overdue_days ?? null,
  }));

  return buildEligibleReminderCandidates({
    workspaceId,
    evaluationDate,
    workspaceTimeZone,
    invoices: invoiceCandidates,
    rules: mapSupabaseReminderRulesToCandidates(rules),
    historyRows,
    clientEmailsByClientId,
  });
}
