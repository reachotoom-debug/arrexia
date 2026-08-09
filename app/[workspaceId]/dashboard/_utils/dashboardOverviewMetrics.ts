import { addCalendarDays } from "@/lib/datetime/workspaceCalendar";
import { getWorkspaceCalendarDateNow } from "@/lib/datetime/workspaceCalendar";
import { resolvePaymentBusinessDate } from "@/lib/payments/paymentBusinessDate";

const ELIGIBLE_PAYMENT_STATUSES = new Set(["completed", "paid", null]);

export type PaymentRowForDashboard = {
  amount: number | string | null;
  net_amount?: number | string | null;
  payment_date: string | null;
  created_at: string | null;
  status: string | null;
};

function toNumber(value: number | string | null | undefined): number {
  if (value == null) return 0;
  if (typeof value === "number") return value;
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isEligiblePaymentStatus(status: string | null): boolean {
  return ELIGIBLE_PAYMENT_STATUSES.has(status);
}

export function sumPaymentsReceivedInLast30CalendarDays(
  payments: PaymentRowForDashboard[],
  workspaceTimeZone: string | null | undefined,
  now: Date = new Date()
): { amount: number; count: number; windowStart: string; windowEnd: string } {
  const windowEnd =
    getWorkspaceCalendarDateNow(workspaceTimeZone, now) ?? now.toISOString().slice(0, 10);
  const windowStart = addCalendarDays(windowEnd, -29) ?? windowEnd;

  let amount = 0;
  let count = 0;

  for (const payment of payments) {
    if (!isEligiblePaymentStatus(payment.status)) {
      continue;
    }

    const businessDate = resolvePaymentBusinessDate({
      paymentDate: payment.payment_date,
      createdAt: payment.created_at,
      workspaceTimeZone,
    });

    if (!businessDate || businessDate < windowStart || businessDate > windowEnd) {
      continue;
    }

    amount += toNumber(payment.net_amount ?? payment.amount);
    count += 1;
  }

  return { amount, count, windowStart, windowEnd };
}

/** Avg issue-to-due days on fully paid invoices (not finance DSO). */
export function calculateAveragePaymentTermsDays(
  invoices: Array<{
    outstanding: number;
    issueDate: string | null;
    dueDate: string | null;
  }>,
  windowStart: Date
): number | null {
  const fullyPaid = invoices.filter(
    (inv) => inv.outstanding <= 0 && inv.issueDate && new Date(inv.issueDate) >= windowStart
  );

  if (fullyPaid.length === 0) {
    return null;
  }

  const daysToPay: number[] = [];
  for (const inv of fullyPaid) {
    const issue = new Date(inv.issueDate!);
    const due = inv.dueDate ? new Date(inv.dueDate) : issue;
    const days = Math.max(
      Math.round((due.getTime() - issue.getTime()) / (1000 * 60 * 60 * 24)),
      0
    );
    daysToPay.push(days);
  }

  if (daysToPay.length === 0) {
    return null;
  }

  return Math.round(daysToPay.reduce((sum, days) => sum + days, 0) / daysToPay.length);
}
