/**
 * Canonical workspace-calendar overdue calculation for reminder rendering (R2B.4).
 */

import { instantToWorkspaceCalendarDate } from "@/lib/datetime/formatDateTime";
import { resolveScheduledDateForRuleSend } from "./ruleOccurrenceGuard";
import { differenceCalendarDays } from "./ruleTrigger";

const CALENDAR_DATE_PREFIX_RE = /^(\d{4}-\d{2}-\d{2})/;

export function normalizeCalendarDateString(
  value: string | null | undefined
): string | null {
  if (!value) return null;
  const match = value.trim().match(CALENDAR_DATE_PREFIX_RE);
  return match ? match[1] : null;
}

/** Calendar overdue days: max(0, referenceDate - dueDate) in YYYY-MM-DD semantics. */
export function computeReminderDaysOverdue(params: {
  dueDate: string | null | undefined;
  referenceDate: string | null | undefined;
}): number {
  const due = normalizeCalendarDateString(params.dueDate);
  const reference = normalizeCalendarDateString(params.referenceDate);
  if (!due || !reference) return 0;

  const diff = differenceCalendarDays(reference, due);
  if (diff === null || diff <= 0) return 0;
  return diff;
}

export function resolveReminderOverdueReferenceDate(params: {
  ruleId?: string | null;
  scheduledDate?: string | null;
  dueDate?: string | null;
  triggerType?: string | null;
  offsetDays?: number | null;
  workspaceTimeZone?: string | null;
  evaluationInstant?: Date;
}): string | null {
  if (params.ruleId) {
    const explicit = normalizeCalendarDateString(params.scheduledDate ?? undefined);
    if (explicit) return explicit;

    if (params.dueDate && params.triggerType != null) {
      return resolveScheduledDateForRuleSend({
        dueDate: params.dueDate,
        triggerType: params.triggerType,
        offsetDays: Number(params.offsetDays ?? 0),
        explicitScheduledDate: null,
      });
    }

    return null;
  }

  const instant = params.evaluationInstant ?? new Date();
  return instantToWorkspaceCalendarDate(instant, params.workspaceTimeZone ?? "UTC");
}
