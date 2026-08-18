/**
 * Invoice re-import paid-total guard — aligned with invoices_view paid semantics.
 *
 * Financially effective statuses: completed, paid, NULL (matches invoices_view).
 * Pending, failed, and archived payments do not consume paid capacity.
 * Uses COALESCE(net_amount, amount) when summing effective payments (invoices_view).
 */

import {
  PAYMENT_OVERPAY_TOLERANCE,
  isFinanciallyEffectivePaymentStatus,
} from "@/lib/payments/paymentImportOverpay";

export const INVOICE_IMPORT_PAID_TOTAL_TOLERANCE = PAYMENT_OVERPAY_TOLERANCE;

export type InvoiceImportPaymentSnapshot = {
  amount: number;
  netAmount?: number | null;
  status: string | null;
  archivedAt?: string | null;
};

export function getInvoiceImportEffectivePaymentAmount(
  payment: InvoiceImportPaymentSnapshot
): number {
  if (payment.archivedAt != null) return 0;
  if (!isFinanciallyEffectivePaymentStatus(payment.status)) return 0;
  return payment.netAmount ?? payment.amount;
}

export function sumInvoiceImportEffectivePaid(
  payments: InvoiceImportPaymentSnapshot[]
): number {
  return payments.reduce(
    (sum, payment) => sum + getInvoiceImportEffectivePaymentAmount(payment),
    0
  );
}

export function wouldInvoiceReimportViolatePaidTotal(params: {
  newTotal: number;
  effectivePaid: number;
  tolerance?: number;
}): boolean {
  const tolerance = params.tolerance ?? INVOICE_IMPORT_PAID_TOTAL_TOLERANCE;
  return params.effectivePaid > params.newTotal + tolerance;
}

export function formatInvoiceImportPaidTotalError(params: {
  invoiceNumber: string;
  currency: string;
  newTotal: number;
  effectivePaid: number;
}): string {
  const currency = params.currency.trim().toUpperCase() || "USD";
  return (
    `Invoice ${params.invoiceNumber} cannot be updated to ${currency} ${params.newTotal.toFixed(2)} ` +
    `because ${currency} ${params.effectivePaid.toFixed(2)} has already been paid.`
  );
}
