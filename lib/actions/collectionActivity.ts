import { addCalendarDays } from "@/lib/reminders/ruleTrigger";

export const AGING_MILESTONE_DAYS = [7, 15, 30, 60, 90] as const;

export type AgingMilestoneDays = (typeof AGING_MILESTONE_DAYS)[number];

export function resolveLatestMilestone(overdueDays: number): AgingMilestoneDays | null {
  let latest: AgingMilestoneDays | null = null;
  for (const milestone of AGING_MILESTONE_DAYS) {
    if (overdueDays >= milestone) {
      latest = milestone;
    }
  }
  return latest;
}

export function computeMilestoneCrossDate(
  dueDate: string,
  milestoneDays: number
): string | null {
  return addCalendarDays(dueDate, milestoneDays);
}

/** First calendar day the invoice is overdue (due_date + 1). */
export function computeFirstOverdueDate(dueDate: string): string | null {
  return addCalendarDays(dueDate, 1);
}

export function hasSuccessfulReminderOnOrAfter(
  sentCalendarDates: readonly string[],
  thresholdDate: string
): boolean {
  return sentCalendarDates.some((sentDate) => sentDate >= thresholdDate);
}

export function shouldShowEarlyOverdueAction(params: {
  isOverdue: boolean;
  overdueDays: number;
  dueDate: string | null;
  sentCalendarDates: readonly string[];
}): boolean {
  const { isOverdue, overdueDays, dueDate, sentCalendarDates } = params;
  if (!isOverdue || overdueDays < 1 || overdueDays > 6 || !dueDate) {
    return false;
  }

  const firstOverdueDate = computeFirstOverdueDate(dueDate);
  if (!firstOverdueDate) return false;

  return !hasSuccessfulReminderOnOrAfter(sentCalendarDates, firstOverdueDate);
}

export function shouldShowAgingMilestoneAction(params: {
  isOverdue: boolean;
  overdueDays: number;
  dueDate: string | null;
  sentCalendarDates: readonly string[];
}): AgingMilestoneDays | null {
  const { isOverdue, overdueDays, dueDate, sentCalendarDates } = params;
  if (!isOverdue || !dueDate) return null;

  const milestone = resolveLatestMilestone(overdueDays);
  if (!milestone) return null;

  const crossDate = computeMilestoneCrossDate(dueDate, milestone);
  if (!crossDate) return null;

  if (hasSuccessfulReminderOnOrAfter(sentCalendarDates, crossDate)) {
    return null;
  }

  return milestone;
}

export function milestoneReasonLabel(milestoneDays: AgingMilestoneDays): string {
  switch (milestoneDays) {
    case 7:
      return "7-day follow-up";
    case 15:
      return "15-day follow-up";
    case 30:
      return "30-day escalation";
    case 60:
      return "60-day escalation";
    case 90:
      return "90-day escalation";
  }
}

export type RequiringAttentionTotal = {
  amount: number | null;
  currency: string;
  /** True when action rows use more than one currency code. */
  isMixedCurrency: boolean;
};

export function computeRequiringAttentionTotal(params: {
  outstandingAmounts: Array<{ outstanding: number; currency: string | null }>;
  defaultCurrency: string;
}): RequiringAttentionTotal {
  const { outstandingAmounts, defaultCurrency } = params;
  if (outstandingAmounts.length === 0) {
    return { amount: 0, currency: defaultCurrency, isMixedCurrency: false };
  }

  const normalizedCurrencies = outstandingAmounts.map(
    (row) => row.currency?.trim().toUpperCase() || defaultCurrency.toUpperCase()
  );
  const uniqueCurrencies = new Set(normalizedCurrencies);

  if (uniqueCurrencies.size === 1) {
    const currency = [...uniqueCurrencies][0]!;
    const amount = outstandingAmounts.reduce((sum, row) => sum + row.outstanding, 0);
    return { amount, currency, isMixedCurrency: false };
  }

  const defaultKey = defaultCurrency.toUpperCase();
  const defaultRows = outstandingAmounts.filter(
    (row, index) => normalizedCurrencies[index] === defaultKey
  );

  if (defaultRows.length === 0) {
    return { amount: null, currency: defaultCurrency, isMixedCurrency: true };
  }

  const amount = defaultRows.reduce((sum, row) => sum + row.outstanding, 0);
  return { amount, currency: defaultCurrency, isMixedCurrency: true };
}
