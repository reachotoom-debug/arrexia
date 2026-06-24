import { requireWorkspace } from "@/lib/auth/server";
import { supabaseServer } from "@/lib/supabase/server";
import { formatMoney } from "@/lib/utils/format-money";
import Link from "next/link";
import { ErrorState, EmptyState } from "@/components/ui/state";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { PaginationBar } from "@/components/PaginationBar";
import { HorizontalScrollArea } from "@/components/table/HorizontalScrollArea";
import { DataTableShell } from "@/components/layout/DataTableShell";
import {
  TABLE_BASE,
  TABLE_ACTIONS_ROW,
  TABLE_CELL_TEXT_COL,
  TABLE_MIN_WIDTH_INNER,
  TABLE_ROW,
  TABLE_TD,
  TABLE_TD_RIGHT,
  TABLE_TH,
  TABLE_TH_RIGHT,
} from "@/components/table/tableShell";
import { FileText, DollarSign, Shield, ShieldAlert, ShieldCheck, Layers } from "lucide-react";
import {
  CommandBar,
  CommandBarControls,
} from "@/components/layout/CommandBar";
import { CommandBarFilters } from "@/components/layout/CommandBarFilters";
import { PageHeader } from "@/components/layout/PageHeader";
import { ResetFiltersButton } from "@/components/shared/reset-filters-button";
import { ExportCsvButton } from "../_components/ExportCsvButton";
import { primaryCtaClass } from "@/components/ui/cta-styles";

const COLLECTIONS_PAGE_SIZE = 10;

/** Escalation rule: recommend escalate when both thresholds are met. Amount is compared in default currency; no conversion applied. */
const ESCALATION_MIN_OVERDUE_DAYS = 30;
const ESCALATION_MIN_OUTSTANDING = 5000;

type RiskFilter = "high" | "medium" | "low" | "all";

/** Overdue-day heat: 0-7 neutral gray, 8-30 amber, 31-60 orange, 61-90 rose, 90+ red. */
function getOverdueHeatClasses(days: number): string {
  if (days <= 7) return "bg-slate-100 text-slate-700 ring-slate-200";
  if (days <= 30) return "bg-amber-100 text-amber-900 ring-amber-300";
  if (days <= 60) return "bg-orange-200 text-orange-900 ring-orange-400";
  if (days <= 90) return "bg-rose-200 text-rose-900 ring-rose-400";
  return "bg-red-300 text-red-900 ring-red-500";
}

type CollectionsPageProps = {
  params: Promise<{ workspaceId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

// Load collections data from invoices_view (single source of truth)
// 
// COLLECTIONS BEHAVIOR:
// - Excludes: archived invoices, void invoices, draft invoices, invoices with outstanding <= 0
// - Excludes invoices for inactive or archived clients (matches Reminders eligibility rules)
// - Shares risk filter logic with Invoices Smart Risk views (risk_level, is_overdue, outstanding > 0)
async function getCollectionsData(
  workspaceId: string,
  risk: RiskFilter,
  page: number,
  pageSize: number
) {
  const supabase = await supabaseServer();

  // Build base query for paginated invoices
  // CONSISTENCY: Match invoices list smart views exactly - risk_level, is_overdue, outstanding > 0
  let baseQuery = supabase
    .from("invoices_view")
    .select(
      `
        id,
        workspace_id,
        client_id,
        client_name,
        client_is_active,
        client_archived_at,
        invoice_number,
        display_status,
        base_status,
        is_overdue,
        overdue_days,
        risk_level,
        outstanding,
        currency,
        issue_date,
        due_date,
        notes
      `,
      { count: "exact" }
    )
    .eq("workspace_id", workspaceId)
    // CONSISTENCY: Same filters as invoices smart views
    .eq("is_overdue", true)
    .is("archived_at", null)
    .gt("outstanding", 0)
    // Collections eligibility: only for active, non-archived clients
    .eq("client_is_active", true)
    .is("client_archived_at", null);

  // Apply risk filter (consistent with smart views)
  if (risk !== "all") {
    baseQuery = baseQuery.eq("risk_level", risk);
  }

  // Calculate pagination range (using COLLECTIONS_PAGE_SIZE constant = 10)
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  // Apply ordering:
  // - Default (all): newest-first by issue_date
  // - Risk-specific views: keep existing risk prioritization
  if (risk === "all") {
    baseQuery = baseQuery
      .order("issue_date", { ascending: false, nullsFirst: false })
      .order("due_date", { ascending: false, nullsFirst: false });
  } else if (risk === "high") {
    // High risk: outstanding DESC, overdue_days DESC (matches smart-high-risk)
    baseQuery = baseQuery
      .order("outstanding", { ascending: false, nullsFirst: false })
      .order("overdue_days", { ascending: false, nullsFirst: false });
  } else {
    // Medium, Low, All: overdue_days DESC, outstanding DESC (matches smart-medium-risk, smart-low-risk)
    baseQuery = baseQuery
      .order("overdue_days", { ascending: false, nullsFirst: false })
      .order("outstanding", { ascending: false, nullsFirst: false });
  }
  // Add stable secondary sort by id to avoid row jitter
  baseQuery = baseQuery.order("id", { ascending: true });

  // Get paginated invoices with total count
  const { data: invoiceData, error, count } = await baseQuery.range(from, to);

  if (error) {
    console.error("[Collections] failed to load invoices", { workspaceId, risk, error });
    throw error;
  }

  const invoices = invoiceData ?? [];
  const totalCount = count ?? 0;

  // Fetch client data for current page invoices (for display in Contact column)
  const clientIds = [...new Set(invoices.map((inv: any) => inv.client_id).filter(Boolean))];
  const clientsMap = new Map();
  
  if (clientIds.length > 0) {
    const { data: clients, error: clientsError } = await supabase
      .from("clients")
      .select("id, name, company, email, whatsapp, whatsapp_phone")
      .in("id", clientIds)
      .eq("workspace_id", workspaceId)
      .eq("is_active", true)
      .is("archived_at", null);

    if (clientsError) {
      console.error("[Collections] failed to load clients", { workspaceId, clientsError });
      // Continue without client data - invoices will still show with client_name from invoices_view
    } else {
      clients.forEach((c) => clientsMap.set(c.id, c));
    }
  }

  // Enrich invoices with client data (for Contact column display)
  // Client may be null if client not found or query failed, but invoice still appears
  const enrichedInvoices = invoices.map((inv: any) => ({
    ...inv,
    client: clientsMap.get(inv.client_id) || null,
  }));

  // Calculate total pages (using totalCount from DB query and COLLECTIONS_PAGE_SIZE = 10)
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  // Calculate total outstanding for all matching invoices (not just current page)
  // Uses same filters as base query (risk, is_overdue, outstanding > 0)
  let totalOutstanding = 0;
  try {
    let metricsQuery = supabase
      .from("invoices_view")
      .select("outstanding")
      .eq("workspace_id", workspaceId)
      // CONSISTENCY: Same filters as base query (matches smart views exactly)
      .eq("is_overdue", true)
      .is("archived_at", null)
      .gt("outstanding", 0)
      // Collections eligibility: only for active, non-archived clients
      .eq("client_is_active", true)
      .is("client_archived_at", null);

    if (risk !== "all") {
      metricsQuery = metricsQuery.eq("risk_level", risk);
    }

    const { data: allOutstanding } = await metricsQuery;
    totalOutstanding = (allOutstanding ?? []).reduce((sum, inv) => sum + Number(inv.outstanding ?? 0), 0);
  } catch (metricsError) {
    console.error("[Collections] failed to calculate outstanding total", { workspaceId, metricsError });
    // Continue with totalOutstanding = 0 if metrics query fails
  }

  return {
    rows: enrichedInvoices,
    count: totalCount,
    page,
    pageSize,
    totalPages,
    summary: {
      // Total count of all invoices matching the risk filter (from main query)
      invoicesInView: totalCount,
      // Sum of outstanding amounts for all matching invoices (from metrics query)
      outstandingInView: totalOutstanding,
      mode: risk === "all" ? "All Risks" : risk === "high" ? "High Risk" : risk === "medium" ? "Medium Risk" : "Low Risk",
    },
  };
}

export default async function CollectionsPage({
  params,
  searchParams,
}: CollectionsPageProps) {
  const { workspaceId } = await params;
  await requireWorkspace(workspaceId);

  const resolvedSearchParams = (await searchParams) || {};
  const riskFilter =
    (Array.isArray(resolvedSearchParams.risk)
      ? resolvedSearchParams.risk[0]
      : resolvedSearchParams.risk) ?? "all";

  const risk = (riskFilter === "high" || riskFilter === "medium" || riskFilter === "low" || riskFilter === "all")
    ? (riskFilter as RiskFilter)
    : "all";

  // Parse page param (default 1, clamp min 1)
  const pageParam = (Array.isArray(resolvedSearchParams.page)
    ? resolvedSearchParams.page[0]
    : resolvedSearchParams.page) ?? "1";
  const page = Math.max(1, parseInt(pageParam, 10) || 1);
  const pageSize = COLLECTIONS_PAGE_SIZE;

  let collectionsData;
  try {
    collectionsData = await getCollectionsData(workspaceId, risk, page, pageSize);
  } catch (error) {
    return (
      <div className="w-full min-w-0">
        <div className="p-6">
          <ErrorState
            title="Unable to load collections"
            message="We couldn&apos;t load your collections data right now. Please try again in a moment."
          />
        </div>
      </div>
    );
  }

  const { rows: invoices, count, page: currentPage, totalPages, summary } = collectionsData;

  const riskOptions = [
    { id: "high", label: "High risk" },
    { id: "medium", label: "Medium risk" },
    { id: "low", label: "Low risk" },
    { id: "all", label: "All risks" },
  ];

  // Helper to build URLs with risk filter (resets page to 1)
  const buildRiskUrl = (riskId: string) => {
    const params = new URLSearchParams();
    params.set("risk", riskId);
    params.set("page", "1");
    return `/${workspaceId}/collections?${params.toString()}`;
  };

  // Helper to build URLs for pagination (preserves risk filter)
  const buildPageUrl = (newPage: number) => {
    const params = new URLSearchParams();
    params.set("risk", risk);
    if (newPage > 1) {
      params.set("page", newPage.toString());
    }
    return `/${workspaceId}/collections?${params.toString()}`;
  };

  const collectionsFilterSummary =
    risk !== "all"
      ? riskOptions.find((r) => r.id === risk)?.label ?? risk
      : undefined;
  const activeFilterCount = Number(risk !== "all");

  return (
    <div className="w-full min-w-0 space-y-4 md:space-y-6">
      <CommandBar>
        <PageHeader
          title="Collections"
          description="Overdue invoices with outstanding balances for follow-up."
          primaryAction={
            <Link href={`/${workspaceId}/invoices/new`} className={primaryCtaClass}>
              New Invoice
            </Link>
          }
          headerTrailing={
            <ExportCsvButton workspaceId={workspaceId} module="invoices" />
          }
        />
        <CommandBarControls
          filters={
            <CommandBarFilters
              summary={collectionsFilterSummary}
              activeCount={activeFilterCount}
              clearAllHref={`/${workspaceId}/collections`}
            >
              <div className="flex flex-wrap gap-2">
                {riskOptions.map((r) => {
                  const isActive = risk === r.id;
                  return (
                    <Link
                      key={r.id}
                      href={buildRiskUrl(r.id)}
                      className={
                        "inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition " +
                        (isActive
                          ? "border-blue-600 bg-blue-100 text-blue-800 shadow-sm ring-1 ring-blue-200"
                          : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50")
                      }
                    >
                      {r.label}
                    </Link>
                  );
                })}
              </div>
            </CommandBarFilters>
          }
          filterAdjacentActions={
            <ResetFiltersButton basePath={`/${workspaceId}/collections`} />
          }
        />
      </CommandBar>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-slate-100 p-2">
              <FileText className="h-5 w-5 text-slate-600" />
            </div>
            <div className="flex-1">
              <div className="text-xs text-slate-500">Invoices in view</div>
              <div className="text-2xl font-semibold mt-1">{summary.invoicesInView}</div>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-slate-100 p-2">
              <DollarSign className="h-5 w-5 text-slate-600" />
            </div>
            <div className="flex-1">
              <div className="text-xs text-slate-500">Outstanding in view</div>
              <div className="text-2xl font-semibold mt-1">
                {formatMoney(summary.outstandingInView, "USD")}
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-slate-100 p-2">
              {risk === "high" ? (
                <ShieldAlert className="h-5 w-5 text-red-600" />
              ) : risk === "medium" ? (
                <Shield className="h-5 w-5 text-amber-600" />
              ) : risk === "low" ? (
                <ShieldCheck className="h-5 w-5 text-emerald-600" />
              ) : (
                <Layers className="h-5 w-5 text-slate-600" />
              )}
            </div>
            <div className="flex-1">
              <div className="text-xs text-slate-500">Mode</div>
              <div className="text-2xl font-semibold mt-1 capitalize">
                {summary.mode}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* TABLE */}
      {count === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-6">
          <EmptyState
            title={
              risk === "low"
                ? "No low risk overdue invoices"
                : risk === "medium"
                ? "No medium risk overdue invoices"
                : risk === "high"
                ? "No high risk overdue invoices"
                : "No overdue invoices"
            }
            message={
              risk === "low"
                ? "No low risk invoices found. Try selecting a different risk level."
                : risk === "medium"
                ? "No medium risk invoices found. Try selecting a different risk level."
                : risk === "high"
                ? "No high risk invoices found. Try selecting a different risk level."
                : "All your invoices are up to date. Great job!"
            }
            actionLabel="View invoices"
            actionHref={`/${workspaceId}/invoices`}
          />
        </div>
      ) : (
        <>
          <DataTableShell disableInnerScroll>
          <HorizontalScrollArea
            className="relative w-full min-w-0"
            viewportClassName="overflow-x-auto scrollbar-thin scrollbar-transparent"
          >
            <div className={TABLE_MIN_WIDTH_INNER}>
            <table className={TABLE_BASE}>
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className={`hidden lg:table-cell ${TABLE_TH}`}>Risk</th>
                  <th className={TABLE_TH}>Invoice #</th>
                  <th className={`${TABLE_CELL_TEXT_COL} ${TABLE_TH}`}>Client</th>
                  <th className={`hidden lg:table-cell ${TABLE_TH}`}>Due date</th>
                  <th className={`hidden lg:table-cell ${TABLE_TH}`}>Overdue days</th>
                  <th className={TABLE_TH_RIGHT}>Outstanding</th>
                  <th className={`hidden lg:table-cell ${TABLE_TH}`}>Escalation</th>
                  <th className={TABLE_TH}>Status</th>
                  <th className={`hidden md:table-cell ${TABLE_CELL_TEXT_COL} ${TABLE_TH}`}>
                    Contact
                  </th>
                  <th className={TABLE_TH_RIGHT}>Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {invoices.map((inv) => {
                  const client = (inv as { client?: { email?: string | null; whatsapp?: string | null; whatsapp_phone?: string | null } }).client;
                  return (
                  <tr key={inv.id} className={TABLE_ROW}>
                    <td className={`hidden lg:table-cell ${TABLE_TD} text-sm`}>
                      <span
                        className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold
                        ${
                          inv.risk_level === "high"
                            ? "bg-red-100 text-red-700 border border-red-200"
                            : inv.risk_level === "medium"
                            ? "bg-amber-100 text-amber-700 border border-amber-200"
                            : "bg-blue-100 text-blue-700 border border-blue-200"
                        }`}
                      >
                        {inv.risk_level?.toUpperCase().charAt(0) || "—"}
                      </span>
                    </td>

                    <td className={`${TABLE_TD} text-sm whitespace-nowrap`}>
                      <Link
                        href={`/${workspaceId}/invoices/${inv.id}`}
                        className="text-blue-600 font-medium hover:underline"
                      >
                        {inv.invoice_number || `INV-${String(inv.id).slice(0, 8)}`}
                      </Link>
                    </td>

                    <td className={`${TABLE_CELL_TEXT_COL} ${TABLE_TD} text-sm text-slate-900`}>
                      <div className="font-medium break-words">{inv.client_name || "—"}</div>
                      {client?.email?.trim() ? (
                        <div className="mt-0.5 hidden break-words text-sm text-slate-500 md:block">
                          {client.email.trim()}
                        </div>
                      ) : null}
                    </td>

                    <td className={`hidden lg:table-cell ${TABLE_TD} text-sm text-slate-700`}>
                      {inv.due_date ? new Date(inv.due_date).toLocaleDateString() : "—"}
                    </td>

                    <td className={`hidden lg:table-cell ${TABLE_TD} text-sm text-slate-700`}>
                      {inv.overdue_days != null && inv.overdue_days > 0 ? (
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset tabular-nums ${getOverdueHeatClasses(Number(inv.overdue_days))}`}
                        >
                          {inv.overdue_days}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>

                    <td className={`${TABLE_TD_RIGHT} text-sm font-semibold text-slate-900`}>
                      {formatMoney(Number(inv.outstanding || 0), "USD")}
                    </td>

                    <td className={`hidden lg:table-cell ${TABLE_TD} text-sm`}>
                      {(() => {
                        const overdueDays = Number(inv.overdue_days ?? 0);
                        const outstanding = Number(inv.outstanding ?? 0);
                        const escalate =
                          overdueDays >= ESCALATION_MIN_OVERDUE_DAYS &&
                          outstanding >= ESCALATION_MIN_OUTSTANDING;
                        return escalate ? (
                          <span
                            title={`Escalate if overdue_days >= ${ESCALATION_MIN_OVERDUE_DAYS} AND outstanding >= ${ESCALATION_MIN_OUTSTANDING}`}
                            className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800 ring-1 ring-inset ring-red-200"
                          >
                            Escalate
                          </span>
                        ) : null;
                      })()}
                    </td>

                    <td className={`${TABLE_TD} text-sm whitespace-nowrap`}>
                      <StatusBadge type="invoice" status={inv.display_status || "overdue"} />
                    </td>

                    <td className={`hidden md:table-cell ${TABLE_CELL_TEXT_COL} ${TABLE_TD} text-sm`}>
                      {(() => {
                        const phone = client?.whatsapp_phone?.trim() || client?.whatsapp?.trim() || null;
                        if (!phone) {
                          return <span className="text-slate-400 text-sm">—</span>;
                        }
                        return <div className="break-words text-slate-600">{phone}</div>;
                      })()}
                    </td>

                  <td className={`${TABLE_TD_RIGHT} text-sm leading-5`}>
                    <div className={TABLE_ACTIONS_ROW}>
                      <Link
                        href={`/${workspaceId}/invoices/${inv.id}`}
                        className="inline-flex items-center whitespace-nowrap rounded-md bg-blue-600 px-2.5 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-blue-700"
                      >
                        View invoice
                      </Link>
                    </div>
                  </td>
                  </tr>
                );
                })}
              </tbody>
            </table>
            </div>
            </HorizontalScrollArea>
            </DataTableShell>

          {/* Pagination */}
          <PaginationBar
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={count}
            itemLabel={`invoice${count !== 1 ? "s" : ""}`}
            basePath={`/${workspaceId}/collections`}
            queryParams={{ ...resolvedSearchParams, risk }}
          />
        </>
      )}
    </div>
  );
}
