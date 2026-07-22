/**
 * Pure reminder rule trigger matching (no server dependencies).
 * Used by findApplicableRuleForInvoice, eligibility domain, and unit tests.
 */

export interface InvoiceTiming {
  daysUntilDue: number | null;
  daysOverdue: number | null;
}

const CALENDAR_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})/;

export function parseCalendarDateString(
  value: string
): { year: number; month: number; day: number } | null {
  const match = value.trim().match(CALENDAR_DATE_RE);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return null;
  }

  return { year, month, day };
}

/** Calendar-day difference: leftDate - rightDate (YYYY-MM-DD, timezone-neutral). */
export function differenceCalendarDays(
  leftDate: string,
  rightDate: string
): number | null {
  const left = parseCalendarDateString(leftDate);
  const right = parseCalendarDateString(rightDate);
  if (!left || !right) return null;

  const leftUtc = Date.UTC(left.year, left.month - 1, left.day);
  const rightUtc = Date.UTC(right.year, right.month - 1, right.day);
  return Math.round((leftUtc - rightUtc) / (1000 * 60 * 60 * 24));
}

export function addCalendarDays(dateStr: string, days: number): string | null {
  const parts = parseCalendarDateString(dateStr);
  if (!parts) return null;

  const utc = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  utc.setUTCDate(utc.getUTCDate() + days);
  return utc.toISOString().slice(0, 10);
}

export function computeInvoiceTimingFromCalendarDates(
  evaluationDate: string,
  dueDate: string
): InvoiceTiming {
  const daysDiff = differenceCalendarDays(evaluationDate, dueDate);
  if (daysDiff === null) {
    return { daysUntilDue: null, daysOverdue: null };
  }

  const daysOverdue = daysDiff > 0 ? daysDiff : 0;
  const daysUntilDue = daysDiff < 0 ? Math.abs(daysDiff) : 0;
  return { daysUntilDue, daysOverdue };
}

export function computeScheduledDateForRule(
  dueDate: string,
  triggerType: string,
  offsetDays: number
): string | null {
  if (triggerType === "before_due") {
    return addCalendarDays(dueDate, -offsetDays);
  }
  if (triggerType === "on_due") {
    return dueDate;
  }
  if (triggerType === "after_due") {
    return addCalendarDays(dueDate, offsetDays);
  }
  return null;
}

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

  const daysOverdue = daysDiff > 0 ? daysDiff : 0;
  const daysUntilDue = daysDiff < 0 ? Math.abs(daysDiff) : 0;

  return { daysUntilDue, daysOverdue };
}

export function matchesReminderRuleTriggerFromCalendarDates(
  evaluationDate: string,
  dueDate: string,
  triggerType: string,
  offsetDays: number
): boolean {
  const timing = computeInvoiceTimingFromCalendarDates(evaluationDate, dueDate);
  return matchesReminderRuleTrigger(timing, triggerType, offsetDays);
}

export function matchesReminderRuleTrigger(
  timing: InvoiceTiming,
  triggerType: string,
  offsetDays: number
): boolean {
  if (triggerType === "before_due") {
    return timing.daysUntilDue === offsetDays;
  }
  if (triggerType === "on_due") {
    return timing.daysUntilDue === 0;
  }
  if (triggerType === "after_due") {
    return timing.daysOverdue === offsetDays;
  }
  return false;
}
