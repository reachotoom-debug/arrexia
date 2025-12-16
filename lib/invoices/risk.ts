/**
 * Risk classification for invoices based on outstanding amount and days overdue
 */

export type InvoiceRiskLevel = "high" | "medium" | "low" | null;

export interface InvoiceForRisk {
  outstanding_amount: number | null;
  due_date: string | null;
}

/**
 * Classify invoice risk based on outstanding amount and days overdue
 * 
 * @param invoice - Invoice with outstanding_amount and due_date
 * @returns Risk level: "high", "medium", "low", or null if not overdue
 */
export function classifyRisk(invoice: InvoiceForRisk): InvoiceRiskLevel {
  const outstanding = invoice.outstanding_amount ?? 0;
  
  // If no outstanding amount or no due date, not at risk
  if (!invoice.due_date || outstanding <= 0) {
    return null;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const due = new Date(invoice.due_date);
  due.setHours(0, 0, 0, 0);
  
  // Calculate days overdue (positive if overdue, negative if not yet due)
  const daysOverdue = due < today
    ? Math.floor((today.getTime() - due.getTime()) / (1000 * 60 * 60 * 24))
    : 0;

  // If not overdue, no risk
  if (daysOverdue <= 0) {
    return null;
  }

  // High risk: 60+ days overdue OR outstanding >= $3000
  if (daysOverdue >= 60 || outstanding >= 3000) {
    return "high";
  }

  // Medium risk: 30-59 days overdue OR outstanding >= $1500
  if (daysOverdue >= 30 || outstanding >= 1500) {
    return "medium";
  }

  // Low risk: 1-29 days overdue with outstanding < $1500
  if (daysOverdue > 0) {
    return "low";
  }

  return null;
}

/**
 * Calculate days overdue for an invoice
 * 
 * @param dueDate - Due date string (YYYY-MM-DD)
 * @returns Number of days overdue (0 if not overdue, positive if overdue)
 */
export function calculateDaysOverdue(dueDate: string | null): number {
  if (!dueDate) {
    return 0;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const due = new Date(dueDate);
  due.setHours(0, 0, 0, 0);
  
  if (due >= today) {
    return 0;
  }

  return Math.floor((today.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Compute display status for an invoice
 * Based on: void wins, draft never overdue, paid when outstanding <= 0
 * 
 * @param invoice - Invoice with status, outstanding_amount, and due_date
 * @returns Display status: "draft" | "sent" | "paid" | "overdue" | "partially_paid" | "void"
 */
export function computeDisplayStatus(invoice: {
  status: string;
  outstanding_amount: number | null;
  due_date: string | null;
}): "draft" | "sent" | "paid" | "overdue" | "partially_paid" | "void" {
  const status = invoice.status?.toLowerCase() || "";
  const outstanding = invoice.outstanding_amount ?? 0;
  const dueDate = invoice.due_date;

  // Void always wins
  if (status === "void") {
    return "void";
  }

  // Draft never shows as overdue
  if (status === "draft") {
    return "draft";
  }

  // Paid when outstanding <= 0
  if (outstanding <= 0) {
    return "paid";
  }

  // Partially paid when some amount is outstanding but less than total
  // (We can't determine total from outstanding alone, so we check if status is partially_paid)
  if (status === "partially_paid" || status === "partial") {
    return "partially_paid";
  }

  // Overdue: sent status + outstanding > 0 + past due date
  if (status === "sent" || status === "overdue") {
    if (dueDate) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const due = new Date(dueDate);
      due.setHours(0, 0, 0, 0);
      
      if (due < today && outstanding > 0) {
        return "overdue";
      }
    }
    
    // If sent but not overdue yet, return sent
    if (status === "sent") {
      return "sent";
    }
  }

  // Default to sent for unknown statuses
  return "sent";
}

/**
 * Check if an invoice is overdue
 * 
 * @param invoice - Invoice with status, outstanding_amount, and due_date
 * @returns true if invoice is overdue
 */
export function isOverdue(invoice: {
  status: string;
  outstanding_amount: number | null;
  due_date: string | null;
}): boolean {
  const displayStatus = computeDisplayStatus(invoice);
  return displayStatus === "overdue";
}
