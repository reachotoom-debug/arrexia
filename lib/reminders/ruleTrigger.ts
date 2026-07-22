/**
 * Pure reminder rule trigger matching (no server dependencies).
 * Used by findApplicableRuleForInvoice and unit tests.
 */

export interface InvoiceTiming {
  daysUntilDue: number | null;
  daysOverdue: number | null;
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
