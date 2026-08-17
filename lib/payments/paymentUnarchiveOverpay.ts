/**
 * Unarchive overpayment guard — aligned with invoices_view paid semantics.
 *
 * Restoring an archived payment re-includes its effective amount in paid/outstanding.
 * Uses the same financially-effective status rules and tolerance as create/import guards.
 */

import {
  getEffectivePaymentAmount,
  PAYMENT_OVERPAY_TOLERANCE,
} from "./paymentImportOverpay";

export function formatPaymentUnarchiveOverpayError(params: {
  paymentAmount: number;
  availableOutstanding: number;
}): string {
  const available = Math.max(params.availableOutstanding, 0);
  return (
    `Restoring this payment would cause overpayment. ` +
    `Payment amount (${params.paymentAmount.toFixed(2)}) exceeds the invoice outstanding balance (${available.toFixed(2)}).`
  );
}

export function wouldRestorePaymentCauseOverpay(params: {
  paymentAmount: number;
  paymentStatus: string | null | undefined;
  currentOutstanding: number;
  tolerance?: number;
}): boolean {
  const effectiveAmount = getEffectivePaymentAmount(
    params.paymentAmount,
    params.paymentStatus
  );
  if (effectiveAmount <= 0) {
    return false;
  }

  const tolerance = params.tolerance ?? PAYMENT_OVERPAY_TOLERANCE;
  return effectiveAmount > params.currentOutstanding + tolerance;
}

export type PaymentUnarchiveCandidate = {
  paymentId: string;
  invoiceId: string;
  amount: number;
  status: string | null;
};

/**
 * Validates a batch of payments to unarchive against per-invoice outstanding capacity.
 * Processes payments in order; each successful candidate consumes remaining capacity.
 */
export function validatePaymentUnarchiveBatchOverpay(params: {
  payments: PaymentUnarchiveCandidate[];
  outstandingByInvoice: Map<string, number>;
  tolerance?: number;
}): Map<string, string> {
  const tolerance = params.tolerance ?? PAYMENT_OVERPAY_TOLERANCE;
  const errors = new Map<string, string>();
  const remainingByInvoice = new Map(params.outstandingByInvoice);

  for (const payment of params.payments) {
    const effectiveAmount = getEffectivePaymentAmount(
      payment.amount,
      payment.status
    );
    if (effectiveAmount <= 0) {
      continue;
    }

    const remaining = remainingByInvoice.get(payment.invoiceId) ?? 0;

    if (effectiveAmount > remaining + tolerance) {
      errors.set(
        payment.paymentId,
        formatPaymentUnarchiveOverpayError({
          paymentAmount: payment.amount,
          availableOutstanding: remaining,
        })
      );
      continue;
    }

    remainingByInvoice.set(payment.invoiceId, remaining - effectiveAmount);
  }

  return errors;
}
