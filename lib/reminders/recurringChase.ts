/**
 * Recurring overdue chase — due-date-anchored recurrence after the final after_due stage.
 * scheduledDate(k) = dueDate + finalOffset + (k × intervalDays)
 * k = 0 → original final stage; k >= 1 → recurring chase.
 */

import { addCalendarDays, differenceCalendarDays } from "./ruleTrigger";

export const RECURRING_OVERDUE_ENABLED = true;
export const RECURRING_OVERDUE_INTERVAL_DAYS = 7;
/** Minimum calendar days between successful collection emails before recurring chase. */
export const RECURRING_CONTACT_COOLDOWN_DAYS = 7;

export type AfterDueRuleRef = {
  id: string;
  triggerType: string;
  offsetDays: number;
  sortOrder?: number | null;
  createdAt?: string | null;
};

export function findFinalAfterDueRule<T extends AfterDueRuleRef>(
  rules: T[]
): T | null {
  const afterDue = rules.filter((rule) => rule.triggerType === "after_due");
  if (afterDue.length === 0) return null;

  return afterDue.slice().sort((a, b) => {
    const offsetDiff = Number(b.offsetDays ?? 0) - Number(a.offsetDays ?? 0);
    if (offsetDiff !== 0) return offsetDiff;
    const sortA = a.sortOrder ?? Number.MIN_SAFE_INTEGER;
    const sortB = b.sortOrder ?? Number.MIN_SAFE_INTEGER;
    if (sortA !== sortB) return sortB - sortA;
    const createdA = a.createdAt ?? "";
    const createdB = b.createdAt ?? "";
    if (createdA !== createdB) return createdB.localeCompare(createdA);
    return b.id.localeCompare(a.id);
  })[0]!;
}

export function computeRecurringScheduledDate(params: {
  dueDate: string;
  finalOffsetDays: number;
  intervalDays: number;
  k: number;
}): string | null {
  const { dueDate, finalOffsetDays, intervalDays, k } = params;
  const anchor = addCalendarDays(dueDate, finalOffsetDays);
  if (!anchor) return null;
  return addCalendarDays(anchor, k * intervalDays);
}

/**
 * Latest recurring occurrence (k >= 1) with scheduledDate <= evaluationDate.
 * Returns null when still in the k = 0 final-stage window.
 */
export function computeLatestRecurringOccurrence(params: {
  dueDate: string;
  finalOffsetDays: number;
  intervalDays: number;
  evaluationDate: string;
}): { k: number; scheduledDate: string } | null {
  if (!RECURRING_OVERDUE_ENABLED) return null;

  const { dueDate, finalOffsetDays, intervalDays, evaluationDate } = params;
  const anchor = addCalendarDays(dueDate, finalOffsetDays);
  if (!anchor) return null;

  const daysAfterFinal = differenceCalendarDays(evaluationDate, anchor);
  if (daysAfterFinal === null || daysAfterFinal < intervalDays) {
    return null;
  }

  const k = Math.floor(daysAfterFinal / intervalDays);
  if (k < 1) return null;

  const scheduledDate = addCalendarDays(anchor, k * intervalDays);
  if (!scheduledDate || scheduledDate > evaluationDate) {
    return null;
  }

  return { k, scheduledDate };
}

export function isRecurringOccurrence(params: {
  scheduledDate: string;
  dueDate: string;
  finalOffsetDays: number;
  intervalDays: number;
}): boolean {
  const { scheduledDate, dueDate, finalOffsetDays, intervalDays } = params;
  const anchor = addCalendarDays(dueDate, finalOffsetDays);
  if (!anchor) return false;

  const daysFromAnchor = differenceCalendarDays(scheduledDate, anchor);
  if (daysFromAnchor === null || daysFromAnchor <= 0) return false;
  if (daysFromAnchor % intervalDays !== 0) return false;

  const k = daysFromAnchor / intervalDays;
  return k >= 1;
}
