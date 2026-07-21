export type ClientListStatusParam = "all" | "active" | "inactive" | "archived";

export type ClientPageInvoiceMetricRow = {
  client_id: string | null;
  display_status: string | null;
  risk_level: string | null;
  outstanding: number | null;
  due_date?: string | null;
};

/**
 * Workspace-wide client total matches the filtered list query when no status/search
 * filters are applied (status=all, empty search).
 */
export function canUseFilteredCountAsWorkspaceTotal(input: {
  status: ClientListStatusParam;
  q: string;
}): boolean {
  return input.status === "all" && input.q.trim().length === 0;
}

/** Page-level invoice metrics reuse loadClients batch when predicates match. */
export function shouldReusePageInvoiceMetricsFromLoadClients(input: {
  view: "default" | "highest-outstanding-first" | "with-overdue-invoices";
}): boolean {
  return input.view === "default";
}
