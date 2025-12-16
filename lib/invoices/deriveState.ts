/**
 * Invoice derived state for numeric calculations
 * 
 * NOTE: This function does NOT calculate the canonical invoice status.
 * Status is ALWAYS derived from invoices_view.display_status in SQL.
 * 
 * This function only calculates numeric fields (totalPaid, outstanding, paymentState)
 * that are written back to the invoices table for consistency.
 */
export type InvoiceDerivedState = {
  totalPaid: number;
  outstanding: number;
  paymentState: "unpaid" | "partially_paid" | "paid";
};

export function deriveInvoiceState(params: {
  status: "draft" | "sent" | "void";
  amount: number;
  payments: { amount: number; status?: string }[];
}): InvoiceDerivedState {
  const { status, amount, payments } = params;

  // Filter only completed payments
  const completedPayments = payments.filter(
    (p) => !p.status || p.status === "completed" || p.status === "paid"
  );

  const totalPaid = completedPayments.reduce(
    (sum, p) => sum + Number(p.amount || 0),
    0
  );

  let outstanding = Number(amount) - totalPaid;
  if (outstanding < 0) outstanding = 0;

  // Void invoices: set outstanding to 0 for consistency
  if (status === "void") {
    return {
      totalPaid,
      outstanding: 0,
      paymentState: "unpaid",
    };
  }

  // Determine payment state (for storing in invoices.payment_state)
  let paymentState: "unpaid" | "partially_paid" | "paid";
  if (outstanding <= 0 && amount > 0) {
    paymentState = "paid";
  } else if (totalPaid > 0 && outstanding > 0) {
    paymentState = "partially_paid";
  } else {
    paymentState = "unpaid";
  }

  return {
    totalPaid,
    outstanding,
    paymentState,
  };
}

