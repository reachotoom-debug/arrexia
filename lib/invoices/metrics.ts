/**
 * Centralized invoice metrics calculation utility
 * 
 * This module provides a single source of truth for calculating:
 * - Outstanding amounts
 * - Days overdue
 * - Risk levels
 * 
 * Used across: dashboard, invoices list, clients list, collections, and reminders
 */

export type InvoiceRiskLevel = "none" | "low" | "medium" | "high";

/**
 * Threshold for high outstanding amount (in currency units)
 */
export const HIGH_OUTSTANDING_THRESHOLD = 3000;

/**
 * Invoice row type - represents an invoice from the database
 */
export type InvoiceRowType = {
  id: string;
  status: "draft" | "sent" | "void" | string;
  amount?: number | null;
  total?: number | null; // For backward compatibility
  total_amount?: number | null; // Legacy support
  due_date: string | null;
  // Line items can be used to calculate total if amount is missing
  items?: Array<{
    quantity: number;
    unit_price: number;
  }> | null;
  // Pre-calculated fields from invoices_view (optional, for optimization)
  outstanding?: number | null; // From invoices_view.outstanding
  paid?: number | null; // From invoices_view.paid
  total_paid?: number | null; // Legacy alias for paid
};

/**
 * Payment row type - represents a payment from the database
 */
export type PaymentRowType = {
  id: string;
  amount: number | null;
  status?: string | null;
};

/**
 * Calculate the difference in days between two dates
 * Returns positive number if date1 is after date2, negative if before, 0 if same day
 */
function differenceInDays(date1: Date, date2: Date): number {
  const d1 = new Date(date1);
  const d2 = new Date(date2);
  d1.setHours(0, 0, 0, 0);
  d2.setHours(0, 0, 0, 0);
  const diffTime = d1.getTime() - d2.getTime();
  return Math.floor(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * Calculate invoice metrics including outstanding amount, days overdue, and risk level
 * 
 * This function can work in two modes:
 * 1. From raw data: calculates from invoice amount and payments array
 * 2. From pre-calculated fields: uses outstanding_amount and total_paid if available
 * 
 * @param args - Input parameters
 * @param args.invoice - Invoice row data (may include pre-calculated outstanding/paid from invoices_view)
 * @param args.payments - Array of payment rows related to this invoice (optional if using pre-calculated fields)
 * @param args.today - Optional date to use as "today" (defaults to current date)
 * @returns Calculated metrics
 */
export function computeInvoiceMetrics(args: {
  invoice: InvoiceRowType;
  payments?: PaymentRowType[];
  today?: Date;
}): {
  total: number;
  paidAmount: number;
  outstanding: number;
  daysOverdue: number;
  isOverdue: boolean;
  riskLevel: InvoiceRiskLevel;
} {
  const { invoice, payments = [], today = new Date() } = args;

  // Calculate total from invoice amount or line items
  let total = 0;
  if (invoice.amount != null) {
    total = Number(invoice.amount);
  } else if (invoice.total != null) {
    total = Number(invoice.total);
  } else if (invoice.total_amount != null) {
    total = Number(invoice.total_amount);
  } else if (invoice.items && invoice.items.length > 0) {
    // Fallback: calculate from line items
    total = invoice.items.reduce(
      (sum, item) => sum + Number(item.quantity || 0) * Number(item.unit_price || 0),
      0
    );
  }

  // Calculate paid amount - prefer pre-calculated field from invoices_view, otherwise calculate from payments
  let paidAmount = 0;
  if (invoice.paid != null) {
    paidAmount = Number(invoice.paid);
  } else if (invoice.total_paid != null) {
    paidAmount = Number(invoice.total_paid); // Legacy support
  } else {
    // Calculate from payments array
    const completedPayments = payments.filter(
      (p) => !p.status || p.status === "completed" || p.status === "paid"
    );
    paidAmount = completedPayments.reduce(
      (sum, p) => sum + Number(p.amount || 0),
      0
    );
  }

  // Calculate outstanding - prefer pre-calculated field from invoices_view, otherwise calculate
  let outstanding = 0;
  if (invoice.outstanding != null) {
    outstanding = Number(invoice.outstanding);
  } else {
    outstanding = Math.max(0, total - paidAmount);
  }

  // Calculate days overdue
  let daysOverdue = 0;
  if (outstanding > 0 && invoice.due_date) {
    const dueDate = new Date(invoice.due_date);
    daysOverdue = Math.max(0, differenceInDays(today, dueDate));
  }

  // Determine if overdue
  // Void invoices are never overdue
  const isOverdue = 
    invoice.status !== "void" && 
    outstanding > 0 && 
    daysOverdue > 0;

  // Calculate risk level
  let riskLevel: InvoiceRiskLevel = "none";
  if (isOverdue) {
    if (daysOverdue >= 30 || outstanding >= HIGH_OUTSTANDING_THRESHOLD) {
      riskLevel = "high";
    } else if (daysOverdue >= 15 && daysOverdue <= 29) {
      riskLevel = "medium";
    } else if (daysOverdue >= 1 && daysOverdue <= 14) {
      riskLevel = "low";
    }
  }

  return {
    total,
    paidAmount,
    outstanding,
    daysOverdue,
    isOverdue,
    riskLevel,
  };
}

