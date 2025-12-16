/**
 * Shared column styling constants for invoice tables
 * Ensures consistent column widths across all invoice tables in the application
 */

export const INVOICE_NUMBER_COL_CLASS =
  "whitespace-nowrap text-left pl-6 pr-2 w-[110px] min-w-[100px] max-w-[130px]";

/**
 * Shared cell styling for Overdue Invoices tables
 * Ensures consistent row height and no wrapping
 */
export const OVERDUE_INVOICE_CELL =
  "whitespace-nowrap align-middle text-sm py-3 px-4";

/**
 * Shared header cell styling for Overdue Invoices tables
 * Ensures consistent header height and alignment with rows
 */
export const OVERDUE_INVOICE_HEADER_CELL =
  "whitespace-nowrap align-middle text-xs font-medium text-slate-500 uppercase tracking-wide py-2 px-4";
