export type ClientListStatusParam = "all" | "active" | "inactive" | "archived";

export type ClientSortKey =
  | "client_name"
  | "company"
  | "email"
  | "outstanding"
  | "invoices_count"
  | "status"
  | "created_at";

export type ClientListViewParam =
  | "default"
  | "highest-outstanding-first"
  | "with-overdue-invoices";

export type ClientPageInvoiceMetricRow = {
  client_id: string | null;
  display_status: string | null;
  risk_level: string | null;
  outstanding: number | null;
  due_date?: string | null;
};

export type ClientInvoiceMetrics = {
  outstandingSum: number;
  isOverdue: boolean;
  invoiceCount: number;
};

/** Outstanding and invoice count are derived from invoices_view, not clients columns. */
export function isComputedClientSortKey(
  sort: ClientSortKey | null
): sort is "outstanding" | "invoices_count" {
  return sort === "outstanding" || sort === "invoices_count";
}

/** Fetch all matching clients + workspace invoices before paginating. */
export function needsClientInvoiceAggregation(input: {
  view: ClientListViewParam;
  sort: ClientSortKey | null;
}): boolean {
  return (
    input.view === "highest-outstanding-first" ||
    input.view === "with-overdue-invoices" ||
    (input.view === "default" && isComputedClientSortKey(input.sort))
  );
}

/** Map UI sort keys to PostgREST order columns on public.clients (null = computed sort). */
export function mapClientSortKeyToDbColumn(
  sortKey: ClientSortKey | null
): string | null {
  if (!sortKey) return null;
  if (sortKey === "client_name") return "name";
  if (isComputedClientSortKey(sortKey)) return null;
  return sortKey;
}

export function aggregateClientInvoiceMetrics(
  invoiceRows: ClientPageInvoiceMetricRow[]
): Map<string, ClientInvoiceMetrics> {
  const clientMetrics = new Map<string, ClientInvoiceMetrics>();

  for (const inv of invoiceRows) {
    if (!inv.client_id) continue;

    const outstanding = Number(inv.outstanding ?? 0);
    const existing = clientMetrics.get(inv.client_id) ?? {
      outstandingSum: 0,
      isOverdue: false,
      invoiceCount: 0,
    };

    existing.outstandingSum += outstanding;
    existing.invoiceCount += 1;

    if (inv.display_status === "overdue" || inv.risk_level != null) {
      existing.isOverdue = true;
    }

    clientMetrics.set(inv.client_id, existing);
  }

  return clientMetrics;
}

export function sortClientsByComputedKey<
  T extends { id: string; outstanding?: number; invoices_count?: number },
>(clients: T[], sort: "outstanding" | "invoices_count", dir: "asc" | "desc"): T[] {
  const sorted = [...clients];

  sorted.sort((a, b) => {
    const aValue =
      sort === "outstanding"
        ? Number(a.outstanding ?? 0)
        : Number(a.invoices_count ?? 0);
    const bValue =
      sort === "outstanding"
        ? Number(b.outstanding ?? 0)
        : Number(b.invoices_count ?? 0);

    const primary = aValue - bValue;
    if (primary !== 0) {
      return dir === "asc" ? primary : -primary;
    }

    return String(a.id).localeCompare(String(b.id));
  });

  return sorted;
}

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
  view: ClientListViewParam;
  sort?: ClientSortKey | null;
}): boolean {
  return input.view === "default" && !isComputedClientSortKey(input.sort ?? null);
}
