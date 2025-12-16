/**
 * Dashboard calculation utilities
 * Pure functions for computing dashboard metrics
 */

export interface InvoiceRow {
  id: string;
  display_status: string | null;
  base_status: string | null;
  outstanding: number | null;
  total_amount: number | null;
  overdue: boolean | null;
  overdue_days: number | null;
  risk_level: string | null;
  due_date: string | null;
}

export interface PaymentRow {
  amount: number | null;
  payment_date: string | null;
  status: string | null;
  invoice_id?: string | null;
}

export interface InvoiceWithPayment {
  id: string;
  issue_date: string | null;
  payments?: PaymentRow[];
}

/**
 * Calculate total outstanding for non-void invoices
 */
export function calculateTotalOutstanding(invoices: InvoiceRow[]): number {
  return invoices
    .filter((inv) => inv.base_status !== "void")
    .reduce((sum, inv) => sum + Number(inv.outstanding ?? 0), 0);
}

/**
 * Calculate total overdue amount
 */
export function calculateTotalOverdue(invoices: InvoiceRow[]): number {
  return invoices
    .filter((inv) => inv.display_status === "overdue")
    .reduce((sum, inv) => sum + Number(inv.outstanding ?? 0), 0);
}

/**
 * Count open (non-void, non-paid) invoices
 */
export function countOpenInvoices(invoices: InvoiceRow[]): number {
  return invoices.filter(
    (inv) =>
      inv.base_status !== "void" && inv.display_status !== "paid"
  ).length;
}

/**
 * Count overdue invoices
 */
export function countOverdueInvoices(invoices: InvoiceRow[]): number {
  return invoices.filter((inv) => inv.display_status === "overdue").length;
}

/**
 * Calculate average days to pay (DSO) for fully paid invoices in the last 90 days
 */
export function calculateAverageDaysToPay(
  invoices: InvoiceWithPayment[],
  payments: PaymentRow[]
): number {
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  // Filter fully paid invoices from last 90 days
  const paidInvoices = invoices.filter((inv) => {
    if (!inv.issue_date) return false;
    const issueDate = new Date(inv.issue_date);
    return issueDate >= ninetyDaysAgo;
  });

  // Get payments for these invoices
  const invoiceIds = new Set(paidInvoices.map((inv) => inv.id));
  const relevantPayments = payments.filter(
    (p) =>
      (p.status === "completed" || p.status === "paid") &&
      p.invoice_id &&
      invoiceIds.has(p.invoice_id)
  );

  // Group payments by invoice and calculate days to pay
  const daysToPay: number[] = [];
  
  for (const inv of paidInvoices) {
    const invoicePayments = relevantPayments.filter(
      (p) => p.invoice_id === inv.id
    );
    
    if (invoicePayments.length === 0) continue;
    
    // Use the latest payment date
    const latestPayment = invoicePayments.reduce((latest, p) => {
      if (!p.payment_date) return latest;
      const pDate = new Date(p.payment_date);
      const lDate = latest ? new Date(latest.payment_date!) : new Date(0);
      return pDate > lDate ? p : latest;
    }, null as PaymentRow | null);

    if (latestPayment?.payment_date && inv.issue_date) {
      const issueDate = new Date(inv.issue_date);
      const paymentDate = new Date(latestPayment.payment_date);
      const days = Math.floor(
        (paymentDate.getTime() - issueDate.getTime()) / (1000 * 60 * 60 * 24)
      );
      if (days >= 0) {
        daysToPay.push(days);
      }
    }
  }

  if (daysToPay.length === 0) return 0;
  const sum = daysToPay.reduce((a, b) => a + b, 0);
  return Math.round(sum / daysToPay.length);
}

/**
 * Calculate payments for current month
 */
export function calculatePaidThisMonth(payments: PaymentRow[]): number {
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  return payments
    .filter((p) => {
      if (!p.payment_date) return false;
      const date = new Date(p.payment_date);
      return (
        (p.status === "completed" || p.status === "paid") &&
        date.getMonth() === currentMonth &&
        date.getFullYear() === currentYear
      );
    })
    .reduce((sum, p) => sum + Number(p.amount ?? 0), 0);
}

/**
 * Calculate payments for last month
 */
export function calculatePaidLastMonth(payments: PaymentRow[]): number {
  const now = new Date();
  const lastMonth = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
  const lastMonthYear =
    now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();

  return payments
    .filter((p) => {
      if (!p.payment_date) return false;
      const date = new Date(p.payment_date);
      return (
        (p.status === "completed" || p.status === "paid") &&
        date.getMonth() === lastMonth &&
        date.getFullYear() === lastMonthYear
      );
    })
    .reduce((sum, p) => sum + Number(p.amount ?? 0), 0);
}

/**
 * Calculate percentage change
 */
export function calculatePercentageChange(
  current: number,
  previous: number
): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return ((current - previous) / previous) * 100;
}

/**
 * Calculate overdue trend by month (last 6 months)
 */
export function calculateOverdueTrendByMonth(
  invoices: InvoiceRow[]
): Array<{ monthLabel: string; overdueAmount: number }> {
  const now = new Date();
  const months: Array<{ monthLabel: string; yearMonth: string; overdueAmount: number }> = [];

  // Generate last 6 months
  for (let i = 5; i >= 0; i--) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthName = date.toLocaleDateString("en-US", { month: "short" });
    const yearMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    months.push({ monthLabel: monthName, yearMonth, overdueAmount: 0 });
  }

  // Group overdue invoices by due_date month
  const overdueInvoices = invoices.filter((inv) => inv.display_status === "overdue");
  
  for (const inv of overdueInvoices) {
    if (!inv.due_date) continue;
    const dueDate = new Date(inv.due_date);
    const yearMonth = `${dueDate.getFullYear()}-${String(dueDate.getMonth() + 1).padStart(2, "0")}`;
    
    const monthIndex = months.findIndex((m) => m.yearMonth === yearMonth);
    if (monthIndex >= 0) {
      months[monthIndex].overdueAmount += Number(inv.outstanding ?? 0);
    }
  }

  return months.map(({ monthLabel, overdueAmount }) => ({
    monthLabel,
    overdueAmount,
  }));
}
