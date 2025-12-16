/**
 * Centralized UI helpers for invoice status display
 * These functions map the canonical InvoiceStatus from invoices_view.display_status
 * to user-facing labels and badge styles.
 */

import type { InvoiceStatus } from "./types";

/**
 * Get human-readable label for invoice status
 */
export function getInvoiceStatusLabel(status: InvoiceStatus | string | null | undefined): string {
  if (!status) return "Unknown";

  switch (status.toLowerCase()) {
    case "draft":
      return "Draft";
    case "sent":
      return "Sent";
    case "partially_paid":
      return "Partially Paid";
    case "paid":
      return "Paid";
    case "overdue":
      return "Overdue";
    case "void":
      return "Void";
    default:
      return String(status);
  }
}

/**
 * Get Tailwind CSS classes for status badge
 * Returns className string for badge styling
 */
export function getInvoiceStatusBadgeClasses(
  status: InvoiceStatus | string | null | undefined
): string {
  if (!status) return "bg-gray-100 text-gray-600";

  switch (status.toLowerCase()) {
    case "draft":
      return "bg-slate-100 text-slate-700";
    case "sent":
      return "bg-blue-100 text-blue-700";
    case "partially_paid":
      return "bg-amber-100 text-amber-700";
    case "paid":
      return "bg-emerald-100 text-emerald-700";
    case "overdue":
      return "bg-rose-100 text-rose-700";
    case "void":
      return "bg-gray-100 text-gray-600";
    default:
      return "bg-gray-100 text-gray-600";
  }
}
