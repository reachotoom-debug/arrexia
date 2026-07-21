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

export type InvoiceListDisplayStatusFilter = "paid" | "partially_paid" | "overdue";

export type DisplayStatusFilterPredicate =
  | { kind: "eq"; column: "display_status"; value: "partially_paid" }
  | { kind: "or"; expression: string };

const INVOICE_LIST_STATUS_PARAMS: InvoiceListStatusParam[] = [
  "all",
  "draft",
  "sent",
  "paid",
  "partial",
  "overdue",
  "void",
  "archived",
];

/** Accepts `partial` and legacy `partially_paid` URL values for the Partially Paid tab. */
export function normalizeInvoiceListStatusParam(raw: string | null): InvoiceListStatusParam {
  if (!raw) return "all";

  const value = raw.toLowerCase();
  if (value === "partially_paid") {
    return "partial";
  }

  return INVOICE_LIST_STATUS_PARAMS.includes(value as InvoiceListStatusParam)
    ? (value as InvoiceListStatusParam)
    : "all";
}

export function resolveInvoiceListDisplayStatusFilter(
  status: InvoiceListStatusParam
): InvoiceListDisplayStatusFilter | null {
  switch (status) {
    case "paid":
      return "paid";
    case "partial":
      return "partially_paid";
    case "overdue":
      return "overdue";
    default:
      return null;
  }
}

/** Builds the display_status predicate for active invoice list queries. */
export function buildDisplayStatusFilterPredicate(
  displayStatus: InvoiceListDisplayStatusFilter
): DisplayStatusFilterPredicate {
  if (displayStatus === "partially_paid") {
    return { kind: "eq", column: "display_status", value: "partially_paid" };
  }

  const capitalizedFilter = displayStatus
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

  return {
    kind: "or",
    expression: `display_status.eq.${displayStatus},display_status.eq.${capitalizedFilter}`,
  };
}

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
