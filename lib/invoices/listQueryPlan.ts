export type InvoiceListStatusParam =
  | "all"
  | "draft"
  | "sent"
  | "paid"
  | "partial"
  | "overdue"
  | "void"
  | "archived";

export type InvoiceListViewParam =
  | "default"
  | "overdue-first"
  | "highest-outstanding-first"
  | "smart-high-risk"
  | "smart-medium-risk"
  | "smart-low-risk";

export type InvoiceListQueryPlanInput = {
  status: InvoiceListStatusParam;
  search: string;
  view: InvoiceListViewParam;
};

/** Smart view presets add extra WHERE clauses beyond workspace scope. */
export function invoiceListViewAppliesCountFilters(view: InvoiceListViewParam): boolean {
  return view.startsWith("smart-");
}

/**
 * `anyInvoicesCount` is workspace-scoped active invoices (invoices_view + workspace_id).
 * When true, `filteredCount` uses the same predicates for the current request.
 */
export function shouldReuseAnyInvoicesCountAsFilteredCount(
  input: InvoiceListQueryPlanInput
): boolean {
  if (input.status === "archived") {
    return false;
  }

  if (input.status !== "all") {
    return false;
  }

  if (input.search.trim().length > 0) {
    return false;
  }

  return !invoiceListViewAppliesCountFilters(input.view);
}
