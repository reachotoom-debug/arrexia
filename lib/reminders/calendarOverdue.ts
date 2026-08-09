/**
 * Canonical workspace-calendar overdue calculation for reminder rendering.
 * Email copy uses current overdue age at send/render time — not rule scheduled_at.
 */

import { instantToWorkspaceCalendarDate } from "@/lib/datetime/formatDateTime";
import { computeInvoiceOverdueDays } from "@/lib/invoices/workspaceInvoiceAging";

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

  return computeInvoiceOverdueDays({
    dueDate: due,
    workspaceToday: reference,
  });
}

/**
 * Workspace-local evaluation date for reminder email overdue-age copy.
 * scheduled_at identifies the logical reminder occurrence; overdue days in
 * customer-facing copy always reflect the invoice age at send/render time.
 */
export function resolveReminderOverdueReferenceDate(params: {
  workspaceTimeZone?: string | null;
  evaluationInstant?: Date;
}): string {
  const instant = params.evaluationInstant ?? new Date();
  return (
    instantToWorkspaceCalendarDate(instant, params.workspaceTimeZone ?? "UTC") ??
    instant.toISOString().slice(0, 10)
  );
}
