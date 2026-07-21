import { requireWorkspace } from "@/lib/auth/server";
import {
  applyDisplayStatusFilterPredicate,
  buildDisplayStatusFilterPredicate,
  normalizeInvoiceListStatusParam,
  shouldReuseAnyInvoicesCountAsFilteredCount,
} from "@/lib/invoices/listQueryPlan";
import { supabaseServer } from "@/lib/supabase/server";
import { createRoutePerf, isPerfEnabled, perfLog, perfTime } from "@/lib/perf/server";
import Link from "next/link";
import { ErrorState, EmptyState } from "@/components/ui/state";
import { ResetFiltersButton } from "@/components/shared/reset-filters-button";
import { InvoicesPreferencesGate } from "./_components/InvoicesPreferencesGate";
import { InvoicesClientFilterBadge } from "./_components/InvoicesClientFilterBadge";
import { InvoicesSearchInput } from "./_components/InvoicesSearchInput";
import { PlanLimitBanner } from "@/components/billing/PlanLimitBanner";
import { InvoicesTable } from "./_components/InvoicesTable";
import { InvoicesViewPills } from "./_components/InvoicesViewPills";
import { InvoicesTableUnarchiveButton } from "./_components/InvoicesTableUnarchiveButton";
import { ExportCsvButton } from "../_components/ExportCsvButton";
import { PaginationBar } from "@/components/PaginationBar";
import { formatCurrency } from "@/lib/format/currency";
import {
  CommandBar,
  CommandBarControls,
  CommandBarSearch,
} from "@/components/layout/CommandBar";
import { PageHeader } from "@/components/layout/PageHeader";
import { CommandBarFilters } from "@/components/layout/CommandBarFilters";
import {
  primaryCtaClass,
  primaryCtaDisabledClass,
} from "@/components/ui/cta-styles";
import { unstable_noStore as noStore } from "next/cache";
// Note: invoices_view provides status and financial fields directly.

const INVOICE_PAGE_SIZE = 10;

// Helper to apply smart view filters to query builder
type SmartViewQuery<T> = {
  eq: (column: string, value: unknown) => T;
  gt: (column: string, value: unknown) => T;
};

function applySmartViewFilter<T extends SmartViewQuery<T>>(
  query: T,
  view: InvoiceListViewParam
): T {
  if (view === "default" || !view.startsWith("smart-")) {
    return query;
  }

  if (view === "smart-high-risk") {
    return query.eq("risk_level", "high").eq("display_status", "overdue").gt("outstanding", 0);
  }
  if (view === "smart-medium-risk") {
    return query.eq("risk_level", "medium").eq("display_status", "overdue").gt("outstanding", 0);
  }
  if (view === "smart-low-risk") {
    return query.eq("risk_level", "low").eq("display_status", "overdue").gt("outstanding", 0);
  }

  return query;
}

type InvoiceStatusParam = "all" | "draft" | "sent" | "paid" | "partial" | "overdue" | "void" | "archived";
type InvoiceListViewParam = "default" | "overdue-first" | "highest-outstanding-first" | "smart-high-risk" | "smart-medium-risk" | "smart-low-risk";
type InvoiceSortKey = "issue_date" | "due_date" | "total" | "outstanding" | "client_name" | "invoice_number";
type SortDir = "asc" | "desc";

import type { InvoiceStatus } from "@/lib/invoices/types";

/**
 * Parse and validate invoice query parameters with defaults
 * Defaults: status=all, view=default, sort=issue_date, dir=desc, page=1, pageSize=10, search=""
 */
function parseInvoicesQuery(searchParams: Record<string, string | string[] | undefined>): {
  page: number;
  pageSize: number;
  status: InvoiceStatusParam;
  view: InvoiceListViewParam;
  search: string;
  sort: InvoiceSortKey;
  dir: SortDir;
} {
  // Extract and normalize page
  const rawPage = Array.isArray(searchParams.page) ? searchParams.page[0] : searchParams.page;
  const page = Math.max(parseInt(rawPage || "1", 10) || 1, 1);

  // Extract and normalize pageSize
  const rawPageSize = Array.isArray(searchParams.pageSize) ? searchParams.pageSize[0] : searchParams.pageSize;
  const pageSize = Math.max(parseInt(rawPageSize || String(INVOICE_PAGE_SIZE), 10) || INVOICE_PAGE_SIZE, 1);

  // Extract and normalize status
  const rawStatus = Array.isArray(searchParams.status) ? searchParams.status[0] : searchParams.status;
  const status = normalizeStatusParam(rawStatus || null);

  // Extract and normalize view
  const rawView = Array.isArray(searchParams.view) ? searchParams.view[0] : searchParams.view;
  const view: InvoiceListViewParam = (rawView || "default") as InvoiceListViewParam;

  // Extract search term (search)
  const rawSearch = Array.isArray(searchParams.search) ? searchParams.search[0] : searchParams.search;
  const search = (rawSearch || "").trim();

  // Extract and validate sort
  const rawSort = Array.isArray(searchParams.sort) ? searchParams.sort[0] : searchParams.sort;
  const allowedSorts: InvoiceSortKey[] = ["issue_date", "due_date", "total", "outstanding", "client_name", "invoice_number"];
  const sort: InvoiceSortKey = allowedSorts.includes(rawSort as InvoiceSortKey) 
    ? (rawSort as InvoiceSortKey) 
    : "issue_date";

  // Extract and validate dir
  const rawDir = Array.isArray(searchParams.dir) ? searchParams.dir[0] : searchParams.dir;
  const dir: SortDir = rawDir === "asc" || rawDir === "desc" ? rawDir : "desc";

  return {
    page,
    pageSize,
    status,
    view,
    search,
    sort,
    dir,
  };
}

/**
 * Build URL for invoices page with query parameters
 * Starts from current search params, applies overrides, deletes keys when value is undefined
 * Removes default values from URL: status="all", view="default", sort="issue_date"+dir="desc", page=1
 * Forces page=1 when changing anything except page itself
 */
function buildInvoicesUrl(
  workspaceId: string,
  currentParams: Record<string, string | string[] | undefined>,
  overrides: {
    page?: number;
    status?: InvoiceStatusParam | undefined;
    view?: InvoiceListViewParam | undefined;
    search?: string | undefined;
    sort?: InvoiceSortKey | undefined;
    dir?: SortDir | undefined;
    clientId?: string | undefined;
  }
): string {
  const urlParams = new URLSearchParams();

  // Start from current params (excluding page/pageSize - we'll handle them separately)
  const meaningfulParams = ["status", "view", "search", "sort", "dir", "pageSize", "clientId"];
  meaningfulParams.forEach((key) => {
    const value = currentParams[key];
    if (value) {
      const strValue = Array.isArray(value) ? value[0] : value;
      if (strValue) {
        urlParams.set(key, strValue);
      }
    }
  });

  // Apply overrides - undefined means delete the param
  Object.entries(overrides).forEach(([key, value]) => {
    if (value === undefined) {
      urlParams.delete(key);
    } else {
      urlParams.set(key, String(value));
    }
  });

  // Determine if we should reset to page 1
  // Reset page=1 when changing status/view/search/sort/dir (but not when only changing page)
  const changingNonPageParam = 
    overrides.status !== undefined ||
    overrides.view !== undefined ||
    overrides.search !== undefined ||
    overrides.sort !== undefined ||
    overrides.dir !== undefined;

  if (changingNonPageParam) {
    // Remove page param when changing filters - page=1 is the default, so omit it from URL
    urlParams.delete("page");
  } else if (overrides.page !== undefined) {
    // Only set page if explicitly provided and not resetting
    if (overrides.page > 1) {
      urlParams.set("page", overrides.page.toString());
    } else {
      urlParams.delete("page");
    }
  } else {
    // Preserve current page if it exists and > 1
    const currentPage = Array.isArray(currentParams.page) 
      ? currentParams.page[0] 
      : currentParams.page;
    if (currentPage && parseInt(currentPage, 10) > 1) {
      urlParams.set("page", currentPage);
    }
  }

  // Remove default values from URL to keep it clean
  // status="all" -> remove
  if (urlParams.get("status") === "all") {
    urlParams.delete("status");
  }
  // view="default" -> remove
  if (urlParams.get("view") === "default") {
    urlParams.delete("view");
  }
  // sort="issue_date" + dir="desc" -> remove both (default sort)
  if (urlParams.get("sort") === "issue_date" && urlParams.get("dir") === "desc") {
    urlParams.delete("sort");
    urlParams.delete("dir");
  }
  // page=1 -> remove (default page)
  if (urlParams.get("page") === "1") {
    urlParams.delete("page");
  }

  const queryString = urlParams.toString();
  return `/${workspaceId}/invoices${queryString ? `?${queryString}` : ""}`;
}

// Type for a row from invoices_view
// NOTE: display_status is the canonical status computed in SQL - always use this field
// Canonical contract for list loading: total, paid, outstanding, display_status, risk_level
type InvoiceRow = {
  id: string;
  client_name: string | null;
  invoice_number: string | null;
  issue_date: string | null;
  due_date: string | null;
  total: number | null;
  paid: number | null;
  outstanding: number | null;
  display_status: InvoiceStatus;
  risk_level: string | null;
  [key: string]: unknown; // kept for archived branch compatibility
};

/**
 * Normalizes display_status from any format (Paid, paid, Partially Paid, partially_paid, etc.)
 * to canonical lowercase snake_case format: draft | sent | paid | partially_paid | overdue | void
 */
function normalizeDisplayStatus(value: string | null | undefined): InvoiceStatus {
  if (!value) return "sent";
  
  // Convert to lowercase and replace spaces/underscores consistently
  const normalized = value
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "_") // Replace spaces with underscores
    .replace(/-/g, "_");   // Replace hyphens with underscores
  
  // Map variations to canonical values
  const statusMap: Record<string, InvoiceStatus> = {
    draft: "draft",
    sent: "sent",
    paid: "paid",
    partially_paid: "partially_paid",
    "partiallypaid": "partially_paid",
    "partial": "partially_paid", // URL param "partial" maps to "partially_paid"
    overdue: "overdue",
    void: "void",
  };
  
  return statusMap[normalized] || "sent";
}

function normalizeStatusParam(raw: string | null): InvoiceStatusParam {
  return normalizeInvoiceListStatusParam(raw);
}


interface InvoicesPageProps {
  params: Promise<{ workspaceId: string }>;
  searchParams: Promise<{
    [key: string]: string | string[] | undefined;
  }>;
}

async function loadInvoices(
  workspaceId: string,
  searchParams: Record<string, string | string[] | undefined>
): Promise<{
  invoices: InvoiceRow[];
  totalCount: number;
  anyInvoicesCount: number;
  page: number;
  pageSize: number;
  view: InvoiceListViewParam;
  status: InvoiceStatusParam;
  sort: InvoiceSortKey;
  dir: SortDir;
  search: string;
}> {
  const supabase = await supabaseServer();

  // Parse query parameters with defaults
  const { page, pageSize, status, view, search, sort, dir } = parseInvoicesQuery(searchParams);
  const rawSort = Array.isArray(searchParams.sort) ? searchParams.sort[0] : searchParams.sort;
  const hasExplicitSort = Boolean(rawSort && rawSort.trim().length > 0);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const reuseAnyInvoicesCountAsFilteredCount = shouldReuseAnyInvoicesCountAsFilteredCount({
    status,
    search,
    view,
  });

  // ============================================================================
  // DATA SOURCE SELECTION (Active vs Archived)
  // ============================================================================
  // invoices_view is active-only (WHERE archived_at IS NULL) - use for active tabs
  // Archived tab must query base invoices table with nested selects for client data
  // ============================================================================
  const isArchivedFilter = status === "archived";

  // Define clear filters
  type BaseStatus = "draft" | "sent" | "void";
  type DisplayStatus = "paid" | "partially_paid" | "overdue";

  let baseStatusFilter: BaseStatus | null = null;
  let displayStatusFilter: DisplayStatus | null = null;

  switch (status) {
    case "draft":
    case "sent":
    case "void":
      baseStatusFilter = status;
      break;
    case "paid":
      displayStatusFilter = "paid";
      break;
    case "partial":
      displayStatusFilter = "partially_paid";
      break;
    case "overdue":
      displayStatusFilter = "overdue";
      break;
    default:
      // "all" or "archived" or anything unknown = no extra filter
      break;
  }

  let query;
  let countQuery;

  if (isArchivedFilter) {
    // ========================================================================
    // ARCHIVED TAB: Query base invoices table with nested selects
    // Note: Base table has: id, workspace_id, client_id, invoice_number, status, amount, currency,
    //       issue_date, due_date, po_number, notes, archived_at
    // Computed fields (paid, outstanding, display_status, etc.) will be calculated in mapping
    // ========================================================================
    query = supabase
      .from("invoices")
      .select(
        `
        id,
        workspace_id,
        client_id,
        invoice_number,
        status,
        amount,
        issue_date,
        due_date,
        currency,
        po_number,
        notes,
        archived_at,
        clients(name)
      `,
        { count: "exact" }
      )
      .eq("workspace_id", workspaceId)
      .not("archived_at", "is", null);

    countQuery = supabase
      .from("invoices")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .not("archived_at", "is", null);
  } else {
    // ========================================================================
    // ACTIVE TABS: Query invoices_view (includes joined columns)
    // ========================================================================
    query = supabase
      .from("invoices_view")
      .select(
        "id, invoice_number, client_name, issue_date, due_date, total, paid, outstanding, display_status, risk_level"
      )
      .eq("workspace_id", workspaceId);

    countQuery = supabase
      .from("invoices_view")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId);
  }

  // ============================================================================
  // HARDENED INVOICE STATUS FILTER RULES (Archive Behavior)
  // ============================================================================
  // Rule 1: status=all → archived_at IS NULL (use invoices_view, no status filter)
  // Rule 2: status=archived → archived_at IS NOT NULL (use base invoices table, NO status filter)
  // Rule 3: status=draft/sent/paid/partial/overdue/void → archived_at IS NULL AND invoices match selected status
  //         (use invoices_view with status filter)
  //
  // CRITICAL: Archived invoices MUST NEVER leak into non-archived filters
  // ============================================================================

  if (!isArchivedFilter) {
    // ========================================================================
    // ACTIVE TABS: status === "all" | "draft" | "sent" | "paid" | "partial" | "overdue" | "void"
    // ========================================================================
    // invoices_view already excludes archived (WHERE archived_at IS NULL at SQL level)
    // No need to filter archived_at explicitly - view contract handles it

    // Apply status filters
    if (baseStatusFilter) {
      query = query.eq("base_status", baseStatusFilter);
      countQuery = countQuery.eq("base_status", baseStatusFilter);
    }

    if (displayStatusFilter) {
      const predicate = buildDisplayStatusFilterPredicate(displayStatusFilter);
      query = applyDisplayStatusFilterPredicate(query, predicate);
      countQuery = applyDisplayStatusFilterPredicate(countQuery, predicate);
    }
  }
  // Archived tab: No status filter needed - shows all archived invoices regardless of status

  // Apply search filter (server-side)
  if (search) {
    // Escape special characters in search term for PostgREST ILIKE
    const escapedSearch = search.replace(/%/g, "\\%").replace(/_/g, "\\_");
    const searchPattern = `%${escapedSearch}%`;
    
    if (isArchivedFilter) {
      // Archived tab: Search only base columns (invoice_number, po_number, notes)
      // Note: Can't search nested client fields with ILIKE in PostgREST easily
      const searchFilter = `invoice_number.ilike.${searchPattern},po_number.ilike.${searchPattern},notes.ilike.${searchPattern}`;
      query = query.or(searchFilter);
      countQuery = countQuery.or(searchFilter);
    } else {
      // Active tabs: Search across invoice_number, po_number, notes, client_name
      // invoices_view includes client_name as direct column
      query = query.or(
        `invoice_number.ilike.${searchPattern},client_name.ilike.${searchPattern},po_number.ilike.${searchPattern},notes.ilike.${searchPattern}`
      );
      countQuery = countQuery.or(
        `invoice_number.ilike.${searchPattern},client_name.ilike.${searchPattern},po_number.ilike.${searchPattern},notes.ilike.${searchPattern}`
      );
    }
  }

  // Apply smart view filters BEFORE ordering (only for active tabs - archived tab doesn't use smart views)
  if (!isArchivedFilter) {
    query = applySmartViewFilter(query, view);
    countQuery = applySmartViewFilter(countQuery, view);
  }

  // Apply ordering (AFTER all filtering)
  if (isArchivedFilter) {
    // ========================================================================
    // ARCHIVED TAB ORDERING: Use base table columns
    // ========================================================================
    if (hasExplicitSort && sort) {
      // User-specified sort
      query = query.order(sort, { ascending: dir === "asc", nullsFirst: false });
      query = query.order("id", { ascending: true }); // Stable secondary sort
    } else {
      // Default newest-first (issue_date + invoice_number — avoid created_at/updated_at; not on invoices_view)
      query = query.order("issue_date", { ascending: false, nullsFirst: false });
      query = query.order("invoice_number", { ascending: false, nullsFirst: false });
      query = query.order("id", { ascending: true }); // Stable secondary sort
    }
  } else {
    // ========================================================================
    // ACTIVE TABS ORDERING: Use invoices_view columns
    // ========================================================================
    // Only apply column sort if user explicitly selected it.
    if (view === "default" && hasExplicitSort && sort) {
      // Apply user-specified sort
      query = query.order(sort, { ascending: dir === "asc", nullsFirst: false });
      // Add stable secondary sort by id to avoid row jitter
      query = query.order("id", { ascending: true });
    } else {
      // Apply view-specific ordering
      switch (view) {
        case "highest-outstanding-first": {
          query = query.order("outstanding", { ascending: false, nullsFirst: false });
          query = query.order("id", { ascending: true }); // Stable secondary sort
          break;
        }

        case "overdue-first": {
          query = query
            .order("display_status", { ascending: false })  // overdue first by status
            .order("due_date", { ascending: true })         // earlier due dates first
            .order("issue_date", { ascending: false });     // then by issue date desc
          query = query.order("id", { ascending: true }); // Stable secondary sort
          break;
        }

        case "smart-high-risk": {
          query = query
            .order("outstanding", { ascending: false })
            .order("overdue_days", { ascending: false });
          query = query.order("id", { ascending: true }); // Stable secondary sort
          break;
        }

        case "smart-medium-risk": {
          query = query
            .order("overdue_days", { ascending: false })
            .order("outstanding", { ascending: false });
          query = query.order("id", { ascending: true }); // Stable secondary sort
          break;
        }

        case "smart-low-risk": {
          query = query
            .order("overdue_days", { ascending: false })
            .order("outstanding", { ascending: false });
          query = query.order("id", { ascending: true }); // Stable secondary sort
          break;
        }

        case "default":
        default: {
          // Default view: newest invoices first by issue date.
          query = query.order("issue_date", { ascending: false, nullsFirst: false });
          // Tie-breaker when issue_date is identical.
          query = query.order("invoice_number", { ascending: false, nullsFirst: false });
          query = query.order("id", { ascending: true }); // Stable secondary sort
          break;
        }
      }
    }
  }

  // Apply pagination (AFTER all filtering, search, and ordering)
  const paginatedRowsQuery = query.range(from, to);
  const anyInvoicesCountQuery = supabase
    .from("invoices_view")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId);

  type CountQueryResult = { count: number | null; error: { message: string } | null };
  type RowsQueryResult = {
    data: Record<string, unknown>[] | null;
    error: { message: string; details?: string; hint?: string; code?: string } | null;
  };

  let invoicesFromDb: Record<string, unknown>[] | null = null;
  let error: RowsQueryResult["error"] = null;
  let count: number | null = null;
  let countError: CountQueryResult["error"] = null;
  let workspaceInvoiceCount = 0;

  if (reuseAnyInvoicesCountAsFilteredCount) {
    const [rowsResult, filteredCountResult] = await Promise.all([
      perfTime(
        "invoice-list",
        "invoiceRows",
        async () => paginatedRowsQuery,
        (result) => `rows=${result.data?.length ?? 0}`
      ),
      perfTime(
        "invoice-list",
        "filteredCount",
        async () => countQuery,
        (result) => `count=${result.count ?? 0}`
      ),
    ]);

    invoicesFromDb = rowsResult.data;
    error = rowsResult.error;
    count = filteredCountResult.count;
    countError = filteredCountResult.error;
    workspaceInvoiceCount = typeof count === "number" ? count : 0;

    if (isPerfEnabled()) {
      perfLog(
        "invoice-list",
        `anyInvoicesCount=reused count=${workspaceInvoiceCount}`
      );
    }
  } else {
    const [rowsResult, filteredCountResult, anyInvoicesCountResult] = await Promise.all([
      perfTime(
        "invoice-list",
        "invoiceRows",
        async () => paginatedRowsQuery,
        (result) => `rows=${result.data?.length ?? 0}`
      ),
      perfTime(
        "invoice-list",
        "filteredCount",
        async () => countQuery,
        (result) => `count=${result.count ?? 0}`
      ),
      perfTime(
        "invoice-list",
        "anyInvoicesCount",
        async () => anyInvoicesCountQuery,
        (result) => `count=${result.count ?? 0}`
      ),
    ]);

    invoicesFromDb = rowsResult.data;
    error = rowsResult.error;
    count = filteredCountResult.count;
    countError = filteredCountResult.error;
    workspaceInvoiceCount =
      typeof anyInvoicesCountResult.count === "number" ? anyInvoicesCountResult.count : 0;
  }

  // If count query fails, log but don't fail the whole request
  if (countError) {
    if (process.env.NODE_ENV === "development") {
      console.error("[InvoicesPage] count query failed:", countError.message);
    }
  }

  // Error handling
  if (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("[InvoicesPage] failed to load invoices", {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
      });
    }
    throw error;
  }

  // Map DB result into InvoiceRow shape
  const mappedInvoices: InvoiceRow[] = (invoicesFromDb ?? []).map((invoice: Record<string, unknown>) => {
    // Extract client_name based on data source
    let client_name: string | null = null;
    
    if (isArchivedFilter) {
      // Archived tab: Extract from nested clients relation
      const clientsValue = invoice.clients;
      const clientsRecord =
        typeof clientsValue === "object" && clientsValue !== null
          ? (clientsValue as Record<string, unknown>)
          : null;
      client_name = (clientsRecord?.name as string | null | undefined) ?? null;
      
      // For archived invoices, derived financial fields are not available from invoices_view,
      // but base status should still reflect the stored invoice status.
      const status = (invoice.status as string | null | undefined) ?? "sent";
      
      return {
        id: invoice.id as string,
        invoice_number: (invoice.invoice_number as string | null | undefined) ?? null,
        issue_date: (invoice.issue_date as string | null | undefined) ?? null,
        due_date: (invoice.due_date as string | null | undefined) ?? null,
        total: null,
        paid: null,
        outstanding: null,
        display_status: normalizeDisplayStatus(status) as InvoiceStatus,
        risk_level: null,
        client_name,
      };
    } else {
      // Active tabs: Use direct columns from invoices_view
      client_name = (invoice.client_name as string | null | undefined) ?? null;
      
      return {
        id: invoice.id as string,
        invoice_number: (invoice.invoice_number as string | null | undefined) ?? null,
        issue_date: (invoice.issue_date as string | null | undefined) ?? null,
        due_date: (invoice.due_date as string | null | undefined) ?? null,
        total: (invoice.total as number | null | undefined) ?? null,
        paid: (invoice.paid as number | null | undefined) ?? null,
        outstanding: (invoice.outstanding as number | null | undefined) ?? null,
        display_status: invoice.display_status as InvoiceStatus,
        risk_level: (invoice.risk_level as string | null | undefined) ?? null,
        client_name,
      };
    }
  });

  return {
    invoices: mappedInvoices,
    totalCount: typeof count === "number" ? count : 0,
    anyInvoicesCount: workspaceInvoiceCount,
    page,
    pageSize,
    view,
    status,
    sort,
    dir,
    search,
  };
}

const statusFilters = [
  { label: "All", value: "all" },
  { label: "Draft", value: "draft" },
  { label: "Sent", value: "sent" },
  { label: "Paid", value: "paid" },
  { label: "Partially Paid", value: "partial" },
  { label: "Overdue", value: "overdue" },
  { label: "Void", value: "void" },
  { label: "Archived", value: "archived" },
] as const;

const SMART_INVOICE_VIEWS = [
  { id: "smart-high-risk", label: "Smart: High risk overdue" },
  { id: "smart-medium-risk", label: "Smart: Medium risk" },
  { id: "smart-low-risk", label: "Smart: Low risk" },
];

const INVOICE_VIEW_PRESETS = [
  { id: "default" as const, label: "Default View" },
  { id: "overdue-first" as const, label: "Overdue First" },
  { id: "highest-outstanding-first" as const, label: "Highest Outstanding First" },
];

export default async function InvoicesPage({
  params,
  searchParams,
}: InvoicesPageProps) {
  noStore();
  const perf = createRoutePerf("invoice-list");
  const { workspaceId } = await params;
  await perf.time("requireWorkspace", () => requireWorkspace(workspaceId));

  const resolvedSearchParams = (await searchParams) || {};
  const limitCodeParam = Array.isArray(resolvedSearchParams.limit)
    ? resolvedSearchParams.limit[0]
    : resolvedSearchParams.limit;

  // Load invoices using the refactored function
  let invoiceData;
  try {
    invoiceData = await perf.time("loadInvoices", () =>
      loadInvoices(workspaceId, resolvedSearchParams)
    );
  } catch {
    perf.finish({ status: "error" });
    return (
      <>
        <InvoicesPreferencesGate />
        <div className="w-full min-w-0">
          <div className="p-6">
            <ErrorState
              title="Unable to load invoices"
              message="We couldn&apos;t load your invoices right now. Please try again shortly."
            />
          </div>
        </div>
      </>
    );
  }

  const {
    invoices,
    totalCount,
    anyInvoicesCount,
    page,
    view: viewParam,
    status: statusParam,
    search: searchTerm,
  } = invoiceData;
  const invoiceRows = invoices ?? [];

  // Compute status and basic flags
  const status = statusParam ?? "all";
  const isArchivedView = status === "archived";

  // Extract clientId for UI
  const rawClientId = Array.isArray(resolvedSearchParams.clientId)
    ? resolvedSearchParams.clientId[0]
    : resolvedSearchParams.clientId;
  const clientId = rawClientId || undefined;

  // Has any invoices in this workspace at all (ignoring filters)
  const hasAnyInvoices = anyInvoicesCount > 0;

  // Enrich invoices - use fields directly from invoices_view (canonical contract)
  // No client-side sorting/filtering - all done server-side
  const enrichedInvoices = invoiceRows.map((invoice: InvoiceRow) => {
    // Use canonical column names: total, paid, outstanding
    const outstanding = Number(invoice.outstanding ?? 0);
    const amount = Number(invoice.total ?? 0);
    const totalPaid = Number(invoice.paid ?? 0);
    
    // Normalize display_status to canonical format (handles both formats from DB)
    const displayStatusNormalized = normalizeDisplayStatus(invoice.display_status || "sent");
    const risk = invoice.risk_level || null;
    const invoiceIsOverdue = displayStatusNormalized === "overdue";
    
    // invoice_number and client_name are now available from invoices_view
    const invoiceNumber = invoice.invoice_number ?? null;
    const clientName = invoice.client_name ?? null;
    const currency = "USD";
    
    return {
      ...invoice,
      invoice_number: invoiceNumber,
      client_name: clientName,
      currency,
      amount,
      total: amount,
      outstanding,
      totalPaid,
      paymentState: displayStatusNormalized === "paid" ? "paid" : displayStatusNormalized === "partially_paid" ? "partially_paid" : "unpaid",
      isOverdue: invoiceIsOverdue,
      displayStatus: displayStatusNormalized,
      displayStatusNormalized,
      risk_level: risk,
      risk: risk || "none",
      archived_at: null,
    };
  });

  // Calculate totalCount and pagination
  // totalCount comes from the Supabase query count in loadInvoices
  const totalPages = Math.max(
    Math.ceil(totalCount / INVOICE_PAGE_SIZE),
    1
  );
  const safePage = Math.min(page, totalPages);

  // Extract client name from first invoice if clientId filter is active
  let clientFilterName: string | null = null;
  if (clientId && enrichedInvoices.length > 0) {
    const firstInvoice = enrichedInvoices[0];
    clientFilterName = firstInvoice.client_name ?? null;
  }


  const isInvoiceLimitReached = limitCodeParam === "PLAN_LIMIT_INVOICES";

  const invoiceFilterSummaryParts: string[] = [];
  if (viewParam !== "default") {
    const smart = SMART_INVOICE_VIEWS.find((v) => v.id === viewParam);
    if (smart) {
      invoiceFilterSummaryParts.push(smart.label);
    } else {
      const preset = INVOICE_VIEW_PRESETS.find((v) => v.id === viewParam);
      invoiceFilterSummaryParts.push(preset?.label ?? viewParam);
    }
  }
  if (status !== "all") {
    invoiceFilterSummaryParts.push(
      statusFilters.find((f) => f.value === status)?.label ?? status
    );
  }
  const invoicesFilterSummary =
    invoiceFilterSummaryParts.length > 0
      ? invoiceFilterSummaryParts.join(" · ")
      : undefined;
  const activeFilterCount =
    Number(viewParam !== "default") +
    Number(status !== "all") +
    Number(Boolean(clientId));

  const invoiceListEmpty =
    status === "all" && !hasAnyInvoices
      ? {
          title: "No invoices yet",
          message: "Create your first invoice to start tracking receivables.",
          actionLabel: "New invoice",
          actionHref: `/${workspaceId}/invoices/new`,
        }
      : isArchivedView
        ? {
            title: "No archived invoices",
            message:
              "You don't have any archived invoices. Active invoices are shown under the All tabs.",
            actionLabel: "View active invoices",
            actionHref: buildInvoicesUrl(workspaceId, resolvedSearchParams, {
              status: "all",
            }),
          }
        : {
            title: "No invoices match your filters",
            message: "Try clearing search or filters to see more invoices.",
            actionLabel: "Clear filters",
            actionHref: buildInvoicesUrl(workspaceId, resolvedSearchParams, {
              status: "all",
              view: "default",
              search: "",
              clientId: undefined,
            }),
          };
  const summaryOutstanding = enrichedInvoices.reduce(
    (sum, inv) => sum + Number(inv.outstanding ?? 0),
    0
  );
  const summaryOverdueCount = enrichedInvoices.filter(
    (inv) => inv.displayStatusNormalized === "overdue"
  ).length;

  perf.finish({
    rows: enrichedInvoices.length,
    totalCount,
  });

  return (
    <>
      <InvoicesPreferencesGate />
      <InvoicesViewPills>
      <div className="w-full min-w-0 space-y-4 md:space-y-6">
      {isInvoiceLimitReached ? <PlanLimitBanner code="PLAN_LIMIT_INVOICES" /> : null}
      <CommandBar>
        <PageHeader
          title="Invoices"
          description="View and manage all invoices for this organization."
          primaryAction={
            isInvoiceLimitReached ? (
              <button
                type="button"
                className={primaryCtaDisabledClass}
                disabled
                title="Upgrade to create more"
              >
                New Invoice
              </button>
            ) : (
              <Link href={`/${workspaceId}/invoices/new`} className={primaryCtaClass}>
                New Invoice
              </Link>
            )
          }
          headerTrailing={<ExportCsvButton workspaceId={workspaceId} module="invoices" />}
        />

        <CommandBarSearch>
          <InvoicesSearchInput
            workspaceId={workspaceId}
            initialSearch={searchTerm}
          />
        </CommandBarSearch>

        <CommandBarControls
          filters={
            <CommandBarFilters
              summary={invoicesFilterSummary}
              activeCount={activeFilterCount}
              clearAllHref={`/${workspaceId}/invoices`}
            >
              <div className="space-y-4">
                <div>
                  <p className="mb-2 text-sm font-semibold text-gray-700">
                    Smart views
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {SMART_INVOICE_VIEWS.map((v) => {
                      const isActive = viewParam === v.id;
                      const href = buildInvoicesUrl(workspaceId, resolvedSearchParams, {
                        view: v.id as InvoiceListViewParam,
                        status: "all",
                      });
                      return (
                        <Link
                          key={v.id}
                          href={href}
                          className={[
                            "inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-medium transition-colors",
                            isActive
                              ? "border-amber-500 bg-amber-500 text-white"
                              : "border-amber-200 bg-amber-50 text-amber-700 hover:border-amber-400",
                          ].join(" ")}
                        >
                          {v.label}
                        </Link>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <p className="mb-2 text-sm font-semibold text-gray-700">
                    View
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {INVOICE_VIEW_PRESETS.map((opt) => {
                      const isActive = viewParam === opt.id;
                      return (
                        <Link
                          key={opt.id}
                          href={buildInvoicesUrl(workspaceId, resolvedSearchParams, {
                            view: opt.id as InvoiceListViewParam,
                            status: "all",
                          })}
                          className={
                            "inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition " +
                            (isActive
                              ? "border-blue-600 bg-blue-100 text-blue-800 shadow-sm ring-1 ring-blue-200"
                              : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50")
                          }
                        >
                          {opt.label}
                        </Link>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <p className="mb-2 text-sm font-semibold text-gray-700">
                    Status
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {statusFilters.map((filter) => {
                      const isActive = status === filter.value;
                      return (
                        <Link
                          key={filter.value}
                          href={buildInvoicesUrl(workspaceId, resolvedSearchParams, {
                            status: filter.value as InvoiceStatusParam,
                          })}
                          className={
                            "inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition " +
                            (isActive
                              ? "border-blue-600 bg-blue-100 text-blue-800 shadow-sm ring-1 ring-blue-200"
                              : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50")
                          }
                        >
                          {filter.label}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              </div>
            </CommandBarFilters>
          }
          filterAdjacentActions={
            <ResetFiltersButton basePath={`/${workspaceId}/invoices`} />
          }
          secondaryActions={
            isArchivedView ? (
              <InvoicesTableUnarchiveButton
                workspaceId={workspaceId}
                invoices={enrichedInvoices.map((inv) => ({
                  id: inv.id,
                  archived_at: inv.archived_at ?? null,
                }))}
                searchParams={resolvedSearchParams}
              />
            ) : undefined
          }
        />
      </CommandBar>

      {/* Client Filter Badge */}
      {clientId && (
        <InvoicesClientFilterBadge
          clientName={clientFilterName}
        />
      )}

      <div className="flex min-w-0 flex-wrap items-baseline gap-x-6 gap-y-2 text-sm text-gray-600">
        <span>{totalCount} invoices</span>
        <span>
          Outstanding:{" "}
          <span className="font-medium text-slate-800">
            {formatCurrency(summaryOutstanding, { currency: "USD" })}
          </span>
        </span>
        <span>
          Overdue: <span className="font-medium text-slate-800">{summaryOverdueCount}</span>
        </span>
      </div>

        {/* Table or Empty State */}
        <div>
          {enrichedInvoices.length > 0 ? (
            <InvoicesTable
              invoices={enrichedInvoices.map((inv) => ({
                id: inv.id,
                invoice_number: inv.invoice_number ?? null,
                client_name: inv.client_name ?? null,
                displayStatusNormalized: inv.displayStatusNormalized,
                issue_date: inv.issue_date ?? null,
                due_date: inv.due_date ?? null,
                total: inv.total,
                totalPaid: inv.totalPaid,
                outstanding: inv.outstanding,
                currency: inv.currency,
                risk: (inv.risk || "none") as "high" | "medium" | "low" | "none",
                archived_at: inv.archived_at ?? null,
              }))}
              workspaceId={workspaceId}
              searchParams={resolvedSearchParams}
              isArchivedView={isArchivedView}
            />
          ) : (
            <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
            <EmptyState
              bare
              title={invoiceListEmpty.title}
              message={invoiceListEmpty.message}
              actionLabel={invoiceListEmpty.actionLabel}
              actionHref={invoiceListEmpty.actionHref}
            />
            </div>
          )}
        </div>

      {/* Pagination */}
      <PaginationBar
        currentPage={safePage}
        totalPages={totalPages}
        totalItems={totalCount}
        itemLabel={`invoice${totalCount !== 1 ? "s" : ""}`}
        basePath={`/${workspaceId}/invoices`}
        queryParams={resolvedSearchParams}
      />
      </div>
      </InvoicesViewPills>
    </>
  );
}
