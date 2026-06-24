export type PaymentStatusParam =
  | "all"
  | "completed"
  | "pending"
  | "failed"
  | "refunded"
  | "archived";
export type PaymentListViewParam =
  | "default"
  | "recent-first"
  | "largest-first"
  | "failed-first";
export type PaymentSortKey =
  | "paid_at"
  | "payment_date"
  | "amount"
  | "method"
  | "payment_provider"
  | "client_name"
  | "invoice_number"
  | "status"
  | "created_at";
export type SortDir = "asc" | "desc";

/**
 * Build URL for payments page with query parameters.
 * Same contract as the historical inline helper on the payments page.
 */
export function buildPaymentsUrl(
  workspaceId: string,
  currentParams: Record<string, string | string[] | undefined>,
  overrides: {
    page?: number;
    status?: PaymentStatusParam | undefined;
    view?: PaymentListViewParam | undefined;
    q?: string | undefined;
    sort?: PaymentSortKey | null | undefined;
    dir?: SortDir | undefined;
  }
): string {
  const urlParams = new URLSearchParams();

  const meaningfulParams = ["status", "view", "q", "sort", "dir", "pageSize"];
  meaningfulParams.forEach((key) => {
    const value = currentParams[key];
    if (value) {
      const strValue = Array.isArray(value) ? value[0] : value;
      if (strValue) {
        urlParams.set(key, strValue);
      }
    }
  });

  Object.entries(overrides).forEach(([key, value]) => {
    if (value === undefined || value === null) {
      urlParams.delete(key);
    } else {
      urlParams.set(key, String(value));
    }
  });

  const changingNonPageParam =
    overrides.status !== undefined ||
    overrides.view !== undefined ||
    overrides.q !== undefined ||
    overrides.sort !== undefined ||
    overrides.dir !== undefined;

  if (changingNonPageParam) {
    urlParams.delete("page");
  } else if (overrides.page !== undefined) {
    if (overrides.page > 1) {
      urlParams.set("page", overrides.page.toString());
    } else {
      urlParams.delete("page");
    }
  } else {
    const currentPage = Array.isArray(currentParams.page)
      ? currentParams.page[0]
      : currentParams.page;
    if (currentPage && parseInt(currentPage, 10) > 1) {
      urlParams.set("page", currentPage);
    }
  }

  if (urlParams.get("status") === "all") {
    urlParams.delete("status");
  }
  if (urlParams.get("view") === "default") {
    urlParams.delete("view");
  }
  if (urlParams.get("dir") === "desc" && !urlParams.get("sort")) {
    urlParams.delete("dir");
  }
  if (urlParams.get("page") === "1") {
    urlParams.delete("page");
  }

  const queryString = urlParams.toString();
  return `/${workspaceId}/payments${queryString ? `?${queryString}` : ""}`;
}
