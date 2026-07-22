/**
 * Pre-send rule occurrence duplicate guard (R2C).
 * Reuses canonical R2A history semantics without reimplementing eligibility.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { instantToWorkspaceCalendarDate } from "@/lib/datetime/formatDateTime";
import {
  sentHistoryBlocksRuleOccurrence,
  type ReminderHistoryEntry,
} from "./eligibility";
import { computeScheduledDateForRule } from "./ruleTrigger";

export async function loadRuleOccurrenceHistory(
  supabase: SupabaseClient,
  workspaceId: string,
  invoiceId: string
): Promise<ReminderHistoryEntry[]> {
  const { data, error } = await supabase
    .from("reminders")
    .select("rule_id, status, sent_at")
    .eq("workspace_id", workspaceId)
    .eq("invoice_id", invoiceId);

  if (error) {
    console.error("[loadRuleOccurrenceHistory] history load error", error);
    return [];
  }

  return (data ?? []).map((row) => ({
    ruleId: row.rule_id,
    status: row.status,
    sentAt: row.sent_at,
  }));
}

export function resolveScheduledDateForRuleSend(params: {
  dueDate: string | null | undefined;
  triggerType: string;
  offsetDays: number;
  explicitScheduledDate?: string | null;
}): string | null {
  if (params.explicitScheduledDate) {
    return params.explicitScheduledDate.slice(0, 10);
  }
  if (!params.dueDate) return null;
  return computeScheduledDateForRule(
    params.dueDate.slice(0, 10),
    params.triggerType,
    params.offsetDays
  );
}

export function ruleOccurrenceAlreadySent(params: {
  history: ReminderHistoryEntry[];
  ruleId: string;
  scheduledDate: string;
  workspaceTimeZone: string | null | undefined;
}): boolean {
  return sentHistoryBlocksRuleOccurrence(
    params.history,
    params.ruleId,
    params.scheduledDate,
    params.workspaceTimeZone
  );
}

export async function checkRuleOccurrenceDuplicateBeforeSend(params: {
  supabase: SupabaseClient;
  workspaceId: string;
  invoiceId: string;
  ruleId: string;
  triggerType: string;
  offsetDays: number;
  dueDate: string | null | undefined;
  scheduledDate?: string | null;
  workspaceTimeZone?: string | null;
}): Promise<{ blocked: boolean; scheduledDate: string | null }> {
  const scheduledDate = resolveScheduledDateForRuleSend({
    dueDate: params.dueDate,
    triggerType: params.triggerType,
    offsetDays: params.offsetDays,
    explicitScheduledDate: params.scheduledDate,
  });

  if (!scheduledDate) {
    return { blocked: false, scheduledDate: null };
  }

  const history = await loadRuleOccurrenceHistory(
    params.supabase,
    params.workspaceId,
    params.invoiceId
  );

  const blocked = ruleOccurrenceAlreadySent({
    history,
    ruleId: params.ruleId,
    scheduledDate,
    workspaceTimeZone: params.workspaceTimeZone ?? "UTC",
  });

  return { blocked, scheduledDate };
}
