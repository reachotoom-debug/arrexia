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
  | { kind: "financial_partial" }
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

/** Whether an invoice matches the Partially Paid tab (financial definition). */
export function matchesPartiallyPaidFinancialFilter(input: {
  paid: number;
  outstanding: number;
}): boolean {
  return input.paid > 0 && input.outstanding > 0;
}

/** Builds the display_status predicate for active invoice list queries. */
export function buildDisplayStatusFilterPredicate(
  displayStatus: InvoiceListDisplayStatusFilter
): DisplayStatusFilterPredicate {
  if (displayStatus === "partially_paid") {
    return { kind: "financial_partial" };
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

type DisplayStatusFilterQuery<T> = {
  gt: (column: string, value: number) => T;
  or: (expression: string) => T;
};

export function applyDisplayStatusFilterPredicate<T extends DisplayStatusFilterQuery<T>>(
  query: T,
  predicate: DisplayStatusFilterPredicate
): T {
  if (predicate.kind === "financial_partial") {
    return query.gt("paid", 0).gt("outstanding", 0);
  }

  return query.or(predicate.expression);
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
