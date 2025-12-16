/**
 * @deprecated Use computeInvoiceMetrics from @/lib/invoices/metrics instead
 * This file is kept for backward compatibility but delegates to the centralized metrics utility
 */

import { computeInvoiceMetrics, type InvoiceRiskLevel } from "./metrics";

// Re-export type for backward compatibility
export type { InvoiceRiskLevel };

/**
 * @deprecated Use computeInvoiceMetrics from @/lib/invoices/metrics instead
 * 
 * Calculate risk level for an invoice based on due date and outstanding amount.
 * This function now delegates to the centralized computeInvoiceMetrics utility.
 */
export function classifyInvoiceRisk(invoice: {
  due_date: string | null;
  outstanding: number;
}): InvoiceRiskLevel {
  const outstanding = Number(invoice.outstanding ?? 0);
  if (!invoice.due_date || outstanding <= 0) return "none";

  const metrics = computeInvoiceMetrics({
    invoice: {
      id: "", // Not needed for risk calculation
      status: "sent", // Default status
      amount: outstanding, // Use outstanding as amount for calculation
      due_date: invoice.due_date,
      outstanding_amount: outstanding,
    },
  });

  return metrics.riskLevel;
}

