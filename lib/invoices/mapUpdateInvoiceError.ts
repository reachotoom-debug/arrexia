export type UpdateInvoiceActionError = {
  error: string;
  code?: string;
};

const EXPECTED_UPDATE_INVOICE_MESSAGES = new Set([
  "Invoice total cannot be less than the amount already paid.",
  "Cannot edit a fully paid invoice.",
  "Cannot edit an archived invoice. Unarchive it first.",
  "Due date is required",
  "workspace_id is required",
]);

/**
 * Expected business-rule failures from updateInvoice / invoice edit RPC.
 * These must be surfaced to the user — not thrown through the route boundary.
 */
export function isExpectedUpdateInvoiceError(
  result: UpdateInvoiceActionError
): boolean {
  const { error, code } = result;

  if (EXPECTED_UPDATE_INVOICE_MESSAGES.has(error)) {
    return true;
  }

  if (error.startsWith("Failed to update invoice items:")) {
    return true;
  }

  if (
    code === "PLAN_LIMIT_INVOICES" ||
    code === "TRIAL_INVOICE_LIMIT_REACHED" ||
    (code != null && code.startsWith("PLAN_"))
  ) {
    return true;
  }

  if (error.includes("Trial expired") || error.includes("read-only")) {
    return true;
  }

  return false;
}
