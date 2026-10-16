import { resolvePaymentBusinessDate } from "@/lib/payments/paymentBusinessDate";

type MonthlyPayment = {
  amount: number | string | null;
  net_amount?: number | string | null;
  status: string | null;
  payment_date: string | null;
  created_at?: string | null;
};

export function formatYearMonth(key: string): string {
  const [year, month] = key.split("-").map(Number);
  if (!year || month < 1 || month > 12) throw new Error("Invalid year-month");
  return `${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][month - 1]} ${year}`;
}

export function buildPaymentMonthlySeries(payments: MonthlyPayment[], months: string[], workspaceTimeZone: string | null | undefined) {
  const buckets = new Map(months.map(month => [month, 0]));
  for (const payment of payments) {
    if (payment.status !== null && payment.status !== "completed" && payment.status !== "paid") continue;
    const date = resolvePaymentBusinessDate({ paymentDate: payment.payment_date, createdAt: payment.created_at, workspaceTimeZone });
    const month = date?.slice(0, 7);
    if (!month || !buckets.has(month)) continue;
    const amount = Number(payment.net_amount ?? payment.amount ?? 0);
    if (!Number.isFinite(amount)) throw new Error("Invalid payment amount");
    buckets.set(month, buckets.get(month)! + amount);
  }
  return Array.from(buckets, ([month, amount]) => ({ month, amount }));
}
