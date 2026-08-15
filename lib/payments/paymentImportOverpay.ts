/**
 * Payment import overpayment validation — aligned with invoices_view paid semantics.
 *
 * Financially effective statuses: completed, paid, NULL (matches invoices_view).
 * Import may also set pending/failed; those do not consume outstanding capacity.
 */

export const PAYMENT_OVERPAY_TOLERANCE = 0.01;

export function isFinanciallyEffectivePaymentStatus(
  status: string | null | undefined
): boolean {
  if (status == null || status === "") return true;
  const normalized = status.trim().toLowerCase();
  return normalized === "completed" || normalized === "paid";
}

export function getEffectivePaymentAmount(
  amount: number,
  status: string | null | undefined
): number {
  return isFinanciallyEffectivePaymentStatus(status) ? amount : 0;
}

export type PaymentImportOverpayRow = {
  rowId: string;
  invoiceId: string;
  invoiceNumber: string;
  amount: number;
  status: string;
  transactionId: string;
  isUpdate: boolean;
};

export type InvoiceOutstandingSnapshot = {
  invoiceId: string;
  invoiceNumber: string;
  total: number;
  outstanding: number;
};

export type ExistingPaymentSnapshot = {
  transactionId: string;
  invoiceId: string;
  amount: number;
  status: string | null;
};

export function formatPaymentImportOverpayError(params: {
  invoiceNumber: string;
  paymentAmount: number;
  availableAmount: number;
}): string {
  return (
    `Payment exceeds invoice outstanding balance. ` +
    `Invoice ${params.invoiceNumber}: payment ${params.paymentAmount.toFixed(2)}, ` +
    `available ${Math.max(params.availableAmount, 0).toFixed(2)}.`
  );
}

/**
 * Validates cumulative import batch against per-invoice outstanding capacity.
 * Returns rowId -> error message for blocking overpayments.
 */
export function validatePaymentImportBatchOverpay(params: {
  rows: PaymentImportOverpayRow[];
  invoices: Map<string, InvoiceOutstandingSnapshot>;
  existingPayments: Map<string, ExistingPaymentSnapshot>;
  tolerance?: number;
}): Map<string, string> {
  const tolerance = params.tolerance ?? PAYMENT_OVERPAY_TOLERANCE;
  const errors = new Map<string, string>();

  const remainingByInvoice = new Map<string, number>();
  for (const [invoiceId, snapshot] of params.invoices) {
    remainingByInvoice.set(invoiceId, snapshot.outstanding);
  }

  const batchEffectiveByTx = new Map<string, number>();
  const batchInvoiceByTx = new Map<string, string>();

  for (const row of params.rows) {
    if (!remainingByInvoice.has(row.invoiceId)) {
      errors.set(row.rowId, "Invoice not found for overpayment validation.");
      continue;
    }

    const newEffective = getEffectivePaymentAmount(row.amount, row.status);

    if (row.isUpdate && row.transactionId) {
      const existing = params.existingPayments.get(row.transactionId);
      let existingEffective = 0;
      let releaseInvoiceId = row.invoiceId;

      if (batchEffectiveByTx.has(row.transactionId)) {
        existingEffective = batchEffectiveByTx.get(row.transactionId)!;
        releaseInvoiceId =
          batchInvoiceByTx.get(row.transactionId) ?? row.invoiceId;
      } else if (existing) {
        existingEffective = getEffectivePaymentAmount(
          existing.amount,
          existing.status
        );
        releaseInvoiceId = existing.invoiceId;
      }

      const releaseRemaining = remainingByInvoice.get(releaseInvoiceId) ?? 0;
      remainingByInvoice.set(
        releaseInvoiceId,
        releaseRemaining + existingEffective
      );
    }

    const remaining = remainingByInvoice.get(row.invoiceId) ?? 0;

    if (newEffective > remaining + tolerance) {
      errors.set(
        row.rowId,
        formatPaymentImportOverpayError({
          invoiceNumber: row.invoiceNumber,
          paymentAmount: row.amount,
          availableAmount: remaining,
        })
      );
      continue;
    }

    remainingByInvoice.set(row.invoiceId, remaining - newEffective);

    if (row.transactionId) {
      batchEffectiveByTx.set(row.transactionId, newEffective);
      batchInvoiceByTx.set(row.transactionId, row.invoiceId);
    }
  }

  return errors;
}
