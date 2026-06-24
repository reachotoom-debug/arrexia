import { requireWorkspace } from "@/lib/auth/server";
import { supabaseServer } from "@/lib/supabase/server";
import { unstable_noStore as noStore } from "next/cache";
import Link from "next/link";
import { ErrorState, EmptyState } from "@/components/ui/state";
import { ClientsContentWrapper } from "./_components/ClientsContentWrapper";
import { ClientsPreferencesGate } from "./_components/ClientsPreferencesGate";
import { ResetFiltersButton } from "@/components/shared/reset-filters-button";
import { ClientsSearchInput } from "./_components/ClientsSearchInput";
import { PlanLimitBanner } from "@/components/billing/PlanLimitBanner";
import { ExportCsvButton } from "../_components/ExportCsvButton";
import { PaginationBar } from "@/components/PaginationBar";
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

const CLIENTS_PAGE_SIZE = 10;

const CLIENT_STATUS = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
  { value: "archived", label: "Archived" },
];

const CLIENT_VIEWS = [
  { id: "default", label: "Default View" },
  { id: "highest-outstanding-first", label: "Highest outstanding first" },
  { id: "with-overdue-invoices", label: "With overdue invoices" },
];

type ClientStatusParam = "all" | "active" | "inactive" | "archived";
type ClientListViewParam = "default" | "highest-outstanding-first" | "with-overdue-invoices";
type ClientSortKey = "client_name" | "company" | "email" | "outstanding" | "invoices_count" | "status" | "created_at";
type SortDir = "asc" | "desc";

/**
 * Parse and validate clients query parameters with defaults
 * Defaults: page=1, pageSize=10, status="active" (shows only active, non-archived), view="default", q="", sort="created_at", dir="desc"
 * If view != "default", set sort=null (ignore header sort)
 */
function parseClientsQuery(searchParams: Record<string, string | string[] | undefined>): {
  page: number;
  pageSize: number;
  status: ClientStatusParam;
  view: ClientListViewParam;
  q: string;
  sort: ClientSortKey | null;
  dir: SortDir;
} {
  // Extract and normalize page
  const rawPage = Array.isArray(searchParams.page) ? searchParams.page[0] : searchParams.page;
  const page = Math.max(parseInt(rawPage || "1", 10) || 1, 1);

  // Extract and normalize pageSize
  const rawPageSize = Array.isArray(searchParams.pageSize) ? searchParams.pageSize[0] : searchParams.pageSize;
  const pageSize = Math.max(parseInt(rawPageSize || String(CLIENTS_PAGE_SIZE), 10) || CLIENTS_PAGE_SIZE, 1);

  // Extract and normalize status
  // Default to "active" to show only active, non-archived clients by default
  const rawStatus = Array.isArray(searchParams.status) ? searchParams.status[0] : searchParams.status;
  const status: ClientStatusParam = (rawStatus || "active").toLowerCase() as ClientStatusParam;
  const allowedStatus: ClientStatusParam[] = ["all", "active", "inactive", "archived"];
  const normalizedStatus = allowedStatus.includes(status) ? status : "active";

  // Extract and normalize view
  const rawView = Array.isArray(searchParams.view) ? searchParams.view[0] : searchParams.view;
  const view: ClientListViewParam = (rawView || "default") as ClientListViewParam;
  const allowedViews: ClientListViewParam[] = ["default", "highest-outstanding-first", "with-overdue-invoices"];
  const normalizedView = allowedViews.includes(view) ? view : "default";

  // Extract search term (q or search for backward compatibility)
  const rawQ = Array.isArray(searchParams.q) ? searchParams.q[0] : searchParams.q;
  const rawSearch = Array.isArray(searchParams.search) ? searchParams.search[0] : searchParams.search;
  const q = (rawQ || rawSearch || "").trim();

  // Extract and validate sort (nullable)
  const rawSort = Array.isArray(searchParams.sort) ? searchParams.sort[0] : searchParams.sort;
  // Also support legacy sortBy param
  const rawSortBy = Array.isArray(searchParams.sortBy) ? searchParams.sortBy[0] : searchParams.sortBy;
  const sortInput = rawSort || rawSortBy;
  const allowedSorts: ClientSortKey[] = ["client_name", "company", "email", "outstanding", "invoices_count", "status", "created_at"];
  // Map "name" to "client_name" for backward compatibility
  const normalizedSortInput = sortInput === "name" ? "client_name" : sortInput;
  let sort: ClientSortKey | null = normalizedSortInput && allowedSorts.includes(normalizedSortInput as ClientSortKey)
    ? (normalizedSortInput as ClientSortKey)
    : "created_at"; // Default to newest first

  // Extract and validate dir (default "desc")
  const rawDir = Array.isArray(searchParams.dir) ? searchParams.dir[0] : searchParams.dir;
  // Also support legacy sortDir param
  const rawSortDir = Array.isArray(searchParams.sortDir) ? searchParams.sortDir[0] : searchParams.sortDir;
  const dirInput = rawDir || rawSortDir;
  const dir: SortDir = dirInput === "asc" || dirInput === "desc" ? dirInput : "desc";

  // If view != "default", set sort=null (ignore header sort)
  const normalizedSort = normalizedView !== "default" ? null : sort;
  const normalizedDir = normalizedView !== "default" ? "asc" : dir;

  return {
    page,
    pageSize,
    status: normalizedStatus,
    view: normalizedView,
    q,
    sort: normalizedSort,
    dir: normalizedDir,
  };
}

/**
 * Build URL for clients page with query parameters
 * Starts from current search params, applies overrides, deletes keys when value is undefined
 * Removes default values from URL: status="all", view="default", sort=null, dir="desc", page=1
 * Forces page=1 when changing anything except page itself
 */
function buildClientsUrl(
  workspaceId: string,
  currentParams: Record<string, string | string[] | undefined>,
  overrides: {
    page?: number;
    status?: ClientStatusParam | undefined;
    view?: ClientListViewParam | undefined;
    q?: string | undefined;
    sort?: ClientSortKey | null | undefined;
    dir?: SortDir | undefined;
  }
): string {
  const urlParams = new URLSearchParams();

  // Start from current params (excluding page/pageSize - we'll handle them separately)
  // Include displayView to preserve list/cards view when changing filters
  const meaningfulParams = ["status", "view", "q", "search", "sort", "dir", "pageSize", "displayView"];
  meaningfulParams.forEach((key) => {
    const value = currentParams[key];
    if (value) {
      const strValue = Array.isArray(value) ? value[0] : value;
      if (strValue) {
        // Normalize "search" to "q" for consistency
        const paramKey = key === "search" ? "q" : key;
        urlParams.set(paramKey, strValue);
      }
    }
  });

  // Apply overrides - undefined or null means delete the param
  Object.entries(overrides).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") {
      urlParams.delete(key);
    } else {
      urlParams.set(key, String(value));
    }
  });

  // Determine if we should reset to page 1
  // Reset page=1 when changing status/view/q/sort/dir (but not when only changing page)
  const changingNonPageParam = 
    overrides.status !== undefined ||
    overrides.view !== undefined ||
    overrides.q !== undefined ||
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
  // Note: Canonical URLs always have all params explicitly set (handled by redirect)
  // This function is used for UI navigation, so we remove defaults to keep URLs clean
  // status="active" -> remove (new default)
  if (urlParams.get("status") === "active") {
    urlParams.delete("status");
  }
  // view="default" -> remove
  if (urlParams.get("view") === "default") {
    urlParams.delete("view");
  }
  // sort=null or empty -> remove sort and dir
  if (!urlParams.get("sort")) {
    urlParams.delete("sort");
    // dir="desc" is default, so remove it if no sort
    if (urlParams.get("dir") === "desc") {
      urlParams.delete("dir");
    }
  }
  // page=1 -> remove (default page)
  if (urlParams.get("page") === "1") {
    urlParams.delete("page");
  }
  // Remove legacy params if present
  urlParams.delete("search");
  urlParams.delete("sortBy");
  urlParams.delete("sortDir");

  const queryString = urlParams.toString();
  return `/${workspaceId}/clients${queryString ? `?${queryString}` : ""}`;
}

function sortLabel(sort: ClientSortKey | null): string {
  if (!sort) return "Client Name";
  switch (sort) {
    case "client_name":
      return "Client Name";
    case "company":
      return "Company";
    case "email":
      return "Email";
    case "outstanding":
      return "Outstanding";
    case "invoices_count":
      return "Invoices";
    case "status":
      return "Status";
    case "created_at":
      return "Created";
    default:
      return "Client Name";
  }
}

function sortArrow(dir: SortDir): "↑" | "↓" {
  return dir === "asc" ? "↑" : "↓";
}

interface ClientsPageProps {
  params: Promise<{ workspaceId: string }>;
  searchParams: Promise<{
    [key: string]: string | string[] | undefined;
  }>;
}

async function loadClients(
  workspaceId: string,
  searchParams: Record<string, string | string[] | undefined>
): Promise<{
  clients: any[];
  totalCount: number;
  page: number;
  pageSize: number;
  view: ClientListViewParam;
  status: ClientStatusParam;
  sort: ClientSortKey | null;
  dir: SortDir;
  q: string;
}> {
  const supabase = await supabaseServer();

  // Parse query parameters with defaults
  const { page, pageSize, status, view, q, sort, dir } = parseClientsQuery(searchParams);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;


  // Build base query - select all columns from clients table
  // IMPORTANT: For views that need invoice data, we fetch ALL matching clients first,
  // then apply view filtering/sorting, then paginate in memory
  // For simple views, we can paginate directly in SQL
  const needsInvoiceData = view === "highest-outstanding-first" || view === "with-overdue-invoices";
  
  let query = supabase
    .from("clients")
    .select("id, name, company, email, status, workspace_id, country, whatsapp, whatsapp_phone, payment_terms, created_at, updated_at, archived_at, is_active", { count: "exact" })
    .eq("workspace_id", workspaceId);

  // Client State Model Filters:
  // - Active: archived_at IS NULL AND is_active = true
  // - Inactive: archived_at IS NULL AND is_active = false
  // - Archived: archived_at IS NOT NULL
  // - All: workspace scoped only (no filters)
  // IMPORTANT: Use .is() for null checks, not .eq() - PostgREST requires .is() for NULL comparisons
  if (status === "archived") {
    // Show only archived clients (archived_at IS NOT NULL)
    query = query.not("archived_at", "is", null);
  } else {
    // Default: exclude archived (show only active/inactive based on is_active field)
    // This ensures archived clients never appear in default lists
    query = query.is("archived_at", null);
  }

  // Apply is_active filters (for non-archived records only)
  // NEVER infer inactive from archived - they are separate states
  if (status === "active") {
    // Active: archived_at IS NULL AND is_active = true
    query = query.eq("is_active", true);
  } else if (status === "inactive") {
    // Inactive: archived_at IS NULL AND is_active = false
    query = query.eq("is_active", false);
  }
  // status="all" or "archived" => no is_active filter (only archived_at filter applies)

  // Apply search filter (server-side) - search across name, company, email, whatsapp_phone
  if (q) {
    // Escape special characters in search term for PostgREST ILIKE
    const escapedSearch = q.replace(/%/g, "\\%").replace(/_/g, "\\_");
    const searchPattern = `%${escapedSearch}%`;
    // Use PostgREST or() syntax for multiple ILIKE conditions
    query = query.or(
      `name.ilike.${searchPattern},company.ilike.${searchPattern},email.ilike.${searchPattern},whatsapp_phone.ilike.${searchPattern}`
    );
  }

  // Apply view-specific filtering and ordering BEFORE pagination
  // Rule: View presets map to (sort,dir) on the server:
  //   - view=default => sort=client_name, dir=asc (or use header sort if sort param exists)
  //   - view=highest-outstanding-first => sort=outstanding, dir=desc (computed from invoices)
  //   - view=with-overdue-invoices => filter has_overdue=true, sort=outstanding, dir=desc
  
  let appliedOrder: string | null = null;
  let appliedView: string | null = null;
  
  // Map sort key to database column name
  const getSortColumn = (sortKey: ClientSortKey | null): string | null => {
    if (!sortKey) return null;
    // Map client_name to name in database
    if (sortKey === "client_name") return "name";
    // Other keys map directly (but outstanding/invoices_count need special handling)
    return sortKey;
  };
  
  // Determine what ordering to apply based on view and sort params
  if (view === "default") {
    // Default view: use header sort if present, otherwise default to created_at desc
    const sortColumn = sort ? getSortColumn(sort) : "created_at";
    if (sortColumn) {
      query = query.order(sortColumn, { ascending: sort ? (dir === "asc") : false, nullsFirst: false });
      appliedOrder = sort ? `${sort} ${dir}` : "created_at desc";
      query = query.order("id", { ascending: true }); // Stable secondary sort
    }
    appliedView = "default";
  } else {
    // For highest-outstanding-first and with-overdue-invoices:
    // We'll compute outstanding from invoices and sort after, but use default ordering for initial query
    query = query.order("name", { ascending: true });
    appliedView = view;
    query = query.order("id", { ascending: true }); // Stable secondary sort
  }

  // Fetch clients - if view needs invoice data, fetch ALL (no pagination yet)
  // Otherwise, paginate directly in SQL
  const { data: clientsFromDb, error, count } = needsInvoiceData
    ? await query // Fetch all matching clients
    : await query.range(from, to); // Paginate in SQL


  // Error handling - always log full error details with actionable information
  if (error) {
    // Extract all possible error fields
    const errorDetails = {
      message: error.message || "Unknown error",
      code: error.code || null,
      status: (error as any).status || null,
      details: (error as any).details || null,
      hint: (error as any).hint || null,
      errorString: String(error),
      errorJson: JSON.stringify(error, Object.getOwnPropertyNames(error)),
    };
    
    // Match the actual select() columns used in the query
    const selectString = "id, name, company, email, status, workspace_id, country, whatsapp, whatsapp_phone, payment_terms, created_at, updated_at, archived_at, is_active";
    
    // Log comprehensive error details - never print {}
    console.error("[ClientsPage] failed to load clients (Supabase error)", {
      code: errorDetails.code,
      status: errorDetails.status,
      message: errorDetails.message,
      details: errorDetails.details,
      hint: errorDetails.hint,
      errorString: errorDetails.errorString,
      errorJson: errorDetails.errorJson,
      selectString,
      queryInputs: {
        view,
        status,
        q,
        sort,
        dir,
        page,
        pageSize,
        workspaceId,
        appliedOrder,
        appliedView,
        needsInvoiceData,
      },
    });
    
    
    // DO NOT swallow errors - throw so error boundary can handle
    throw error;
  }

  // For views needing invoice data, we need to:
  // 1. Fetch all invoices for this workspace
  // 2. Compute metrics per client (outstanding, hasOverdue)
  // 3. Apply view filtering/sorting
  // 4. Paginate in memory
  if (needsInvoiceData && clientsFromDb) {
    // Fetch all invoices for computing metrics (exclude void and draft)
    // NOTE: Use invoices_view for outstanding field (outstanding_amount was dropped from invoices table)
    const { data: invoiceRows, error: invoiceError } = await supabase
      .from("invoices_view")
      .select("id, client_id, display_status, risk_level, outstanding")
      .eq("workspace_id", workspaceId)
      .neq("display_status", "void")
      .neq("display_status", "draft");

    if (invoiceError) {
      console.error("[ClientsPage] Error loading invoices for metrics:", invoiceError);
      // Continue with empty invoice data - will use fallback values
    }

    const safeInvoiceRows = invoiceRows ?? [];

    // Compute metrics per client using deterministic logic
    const clientMetrics = new Map<string, { outstandingSum: number; isOverdue: boolean }>();
    
    for (const inv of safeInvoiceRows) {
      if (!inv.client_id) continue;
      
      // Sum outstanding_sum: COALESCE(outstanding, 0) for invoices where status NOT IN ("Draft","Void")
      const outstanding = Number(inv.outstanding ?? 0);
      const existing = clientMetrics.get(inv.client_id) ?? { outstandingSum: 0, isOverdue: false };
      
      // Sum all outstanding amounts (including 0 and negative)
      existing.outstandingSum += outstanding;
      
      // Determine overdue signal from canonical invoices_view fields only.
      if (inv.display_status === "overdue" || inv.risk_level != null) {
        existing.isOverdue = true;
      }
      
      clientMetrics.set(inv.client_id, existing);
    }

    // Enrich clients with metrics (preserve existing values if query failed)
    let enrichedClients = clientsFromDb.map((client) => {
      const metrics = clientMetrics.get(client.id);
      // If query failed and no metrics, preserve existing values or use defaults
      const existingOutstanding = typeof (client as any).outstanding === "number" ? (client as any).outstanding : undefined;
      const existingHasOverdue = typeof (client as any).hasOverdueInvoices === "boolean" ? (client as any).hasOverdueInvoices : undefined;
      
      return {
        ...client,
        outstanding: metrics?.outstandingSum ?? existingOutstanding ?? 0,
        hasOverdueInvoices: metrics?.isOverdue ?? existingHasOverdue ?? false,
      };
    });

    // Apply view-specific filtering and sorting
    // IMPORTANT: View presets map to (sort,dir) - sort by numeric outstanding from DB
    // Ensure outstanding is always numeric (not formatted strings)
    if (view === "highest-outstanding-first") {
      // Sort by outstanding descending (numeric comparison)
      // Force sort to outstanding desc regardless of UI sort selection
      enrichedClients.sort((a, b) => {
        const aOutstanding = Number(a.outstanding ?? 0);
        const bOutstanding = Number(b.outstanding ?? 0);
        return bOutstanding - aOutstanding; // Descending
      });
      appliedView = "highest-outstanding-first (sorted by outstanding desc)";
      appliedOrder = "outstanding desc";
    } else if (view === "with-overdue-invoices") {
      // Filter to only clients with overdue invoices
      // This view must still respect status filters (active/inactive/archived) which are already applied in the base query
      enrichedClients = enrichedClients.filter((c) => c.hasOverdueInvoices);
      
      // Then sort by outstanding descending (numeric comparison)
      enrichedClients.sort((a, b) => {
        const aOutstanding = Number(a.outstanding ?? 0);
        const bOutstanding = Number(b.outstanding ?? 0);
        return bOutstanding - aOutstanding; // Descending
      });
      appliedView = "with-overdue-invoices (filtered, sorted by outstanding desc)";
      appliedOrder = "outstanding desc";
    }

    // Paginate in memory
    const totalCount = enrichedClients.length;
    const paginatedClients = enrichedClients.slice(from, to + 1);

    return {
      clients: paginatedClients,
      totalCount,
      page,
      pageSize,
      view,
      status,
      sort,
      dir,
      q,
    };
  }

  // For views that don't need invoice data, we still need to compute overdue/outstanding
  // Fetch invoice data for the current page client IDs only
  if (clientsFromDb && clientsFromDb.length > 0) {
    const clientIds = clientsFromDb.map((c) => c.id);

    // NOTE: Use invoices_view for outstanding field (outstanding_amount was dropped from invoices table)
    const { data: invoiceRows, error: invoiceError } = await supabase
      .from("invoices_view")
      .select("client_id, display_status, risk_level, outstanding, due_date")
      .eq("workspace_id", workspaceId)
      .in("client_id", clientIds)
      .neq("display_status", "void")
      .neq("display_status", "draft");

    if (invoiceError) {
      console.error("[ClientsPage] Error loading invoices for overdue computation:", invoiceError);
      // Continue with empty data - will use fallback values
    }

    const safeInvoiceRows = invoiceRows ?? [];

    // Compute metrics per client using deterministic logic
    const clientMetrics = new Map<string, { outstandingSum: number; isOverdue: boolean }>();
    
    for (const inv of safeInvoiceRows) {
      if (!inv.client_id) continue;
      
      // Sum outstanding_sum: COALESCE(outstanding, 0) for invoices where status NOT IN ("Draft","Void")
      const outstanding = Number(inv.outstanding ?? 0);
      const existing = clientMetrics.get(inv.client_id) ?? { outstandingSum: 0, isOverdue: false };
      
      // Sum all outstanding amounts (including 0 and negative)
      existing.outstandingSum += outstanding;
      
      // Determine overdue signal from canonical invoices_view fields only.
      if (inv.display_status === "overdue" || inv.risk_level != null) {
        existing.isOverdue = true;
      }
      
      clientMetrics.set(inv.client_id, existing);
    }

    // Enrich clients with metrics (preserve existing values if query failed)
    const enrichedClients = clientsFromDb.map((client) => {
      const metrics = clientMetrics.get(client.id);
      // If query failed and no metrics, preserve existing values or use defaults
      const existingOutstanding = typeof (client as any).outstanding === "number" ? (client as any).outstanding : undefined;
      const existingHasOverdue = typeof (client as any).hasOverdueInvoices === "boolean" ? (client as any).hasOverdueInvoices : undefined;
      
      return {
        ...client,
        outstanding: metrics?.outstandingSum ?? existingOutstanding ?? 0,
        hasOverdueInvoices: metrics?.isOverdue ?? existingHasOverdue ?? false,
      };
    });

    return {
      clients: enrichedClients,
      totalCount: typeof count === "number" ? count : 0,
      page,
      pageSize,
      view,
      status,
      sort,
      dir,
      q,
    };
  }

  // Fallback: return clients with default values if no clients found
  return {
    clients: (clientsFromDb ?? []).map((client) => ({
      ...client,
      outstanding: typeof (client as any).outstanding === "number" ? (client as any).outstanding : 0,
      hasOverdueInvoices: false,
    })),
    totalCount: typeof count === "number" ? count : 0,
    page,
    pageSize,
    view,
    status,
    sort,
    dir,
    q,
  };
}

/**
 * Build canonical URL with all required params explicitly set
 * Canonical: status=all&view=default&sort=created_at&dir=desc&page=1&pageSize=10
 * If q exists, include it too
 */
function buildCanonicalClientsUrl(
  workspaceId: string,
  q?: string
): string {
  const params = new URLSearchParams();
  params.set("status", "all");
  params.set("view", "default");
  params.set("sort", "created_at");
  params.set("dir", "desc");
  params.set("page", "1");
  params.set("pageSize", String(CLIENTS_PAGE_SIZE));
  if (q && q.trim()) {
    params.set("q", q.trim());
  }
  return `/${workspaceId}/clients?${params.toString()}`;
}

export default async function ClientsPage({
  params,
  searchParams,
}: ClientsPageProps) {
  // Prevent caching to ensure new clients appear immediately
  noStore();
  
  const { workspaceId } = await params;
  await requireWorkspace(workspaceId);
  const resolvedSearchParams = await searchParams;
  const limitCodeParam = Array.isArray(resolvedSearchParams.limit)
    ? resolvedSearchParams.limit[0]
    : resolvedSearchParams.limit;
  
  // Check if required params are missing and redirect to canonical URL
  const hasStatus = resolvedSearchParams.status !== undefined;
  const hasView = resolvedSearchParams.view !== undefined;
  const hasSort = resolvedSearchParams.sort !== undefined;
  const hasDir = resolvedSearchParams.dir !== undefined;
  const hasPage = resolvedSearchParams.page !== undefined;
  const hasPageSize = resolvedSearchParams.pageSize !== undefined;
  
  // Extract q to preserve it in redirect
  const rawQ = Array.isArray(resolvedSearchParams.q) ? resolvedSearchParams.q[0] : resolvedSearchParams.q;
  const rawSearch = Array.isArray(resolvedSearchParams.search) ? resolvedSearchParams.search[0] : resolvedSearchParams.search;
  const q = (rawQ || rawSearch || "").trim();
  
  // Check if required params are missing or invalid, and redirect to canonical URL
  // Canonical: status=all, view=default, sort=created_at, dir=desc, page=1, pageSize=10
  const needsRedirect = !hasStatus || !hasView || !hasSort || !hasDir || !hasPage || !hasPageSize;
  
  if (needsRedirect) {
    const { redirect } = await import("next/navigation");
    const canonicalParams = new URLSearchParams();
    
    // Use existing values if valid, otherwise use defaults
    // Default status is "active" (shows only active, non-archived clients)
    const status = hasStatus
      ? (Array.isArray(resolvedSearchParams.status) ? resolvedSearchParams.status[0] : resolvedSearchParams.status)
      : "active";
    const view = hasView
      ? (Array.isArray(resolvedSearchParams.view) ? resolvedSearchParams.view[0] : resolvedSearchParams.view)
      : "default";
    const sort = hasSort
      ? (Array.isArray(resolvedSearchParams.sort) ? resolvedSearchParams.sort[0] : resolvedSearchParams.sort)
      : "created_at";
    const dir = hasDir
      ? (Array.isArray(resolvedSearchParams.dir) ? resolvedSearchParams.dir[0] : resolvedSearchParams.dir)
      : "desc";
    const page = hasPage
      ? (Array.isArray(resolvedSearchParams.page) ? resolvedSearchParams.page[0] : resolvedSearchParams.page)
      : "1";
    const pageSize = hasPageSize
      ? (Array.isArray(resolvedSearchParams.pageSize) ? resolvedSearchParams.pageSize[0] : resolvedSearchParams.pageSize)
      : String(CLIENTS_PAGE_SIZE);
    
    // Validate values match allowed options
    const validStatus = ["all", "active", "inactive", "archived"].includes(status?.toLowerCase() || "") ? status : "active";
    const validView = ["default", "highest-outstanding-first", "with-overdue-invoices"].includes(view || "") ? view : "default";
    const validSort = ["client_name", "company", "email", "outstanding", "invoices_count", "status", "created_at"].includes(sort || "") ? sort : "created_at";
    const validDir = ["asc", "desc"].includes(dir?.toLowerCase() || "") ? dir : "desc";
    const validPage = Math.max(parseInt(page || "1", 10) || 1, 1).toString();
    const validPageSize = Math.max(parseInt(pageSize || String(CLIENTS_PAGE_SIZE), 10) || CLIENTS_PAGE_SIZE, 1).toString();
    
    canonicalParams.set("status", validStatus ?? "");
    canonicalParams.set("view", validView ?? "");
    canonicalParams.set("sort", validSort ?? "");
    canonicalParams.set("dir", validDir ?? "");
    canonicalParams.set("page", validPage);
    canonicalParams.set("pageSize", validPageSize);
    if (q && q.trim()) {
      canonicalParams.set("q", q.trim());
    }
    
    redirect(`/${workspaceId}/clients?${canonicalParams.toString()}`);
  }
  
  const supabase = await supabaseServer();

  // Load clients using the refactored function
  let clientData;
  try {
    clientData = await loadClients(workspaceId, resolvedSearchParams);
  } catch (error) {
    return (
      <>
        <ClientsPreferencesGate
          workspaceId={workspaceId}
          searchParams={resolvedSearchParams}
        />
        <div className="w-full min-w-0">
          <div className="p-6">
            <ErrorState
              title="Unable to load clients"
              message="We couldn&apos;t load your clients right now. Please try again in a moment."
            />
          </div>
        </div>
      </>
    );
  }

  const { clients: safeClients, totalCount, page, view: viewParam, status: statusParam, sort, dir, q: searchTerm } = clientData;


  // Check if there are ANY clients in the workspace (without filters)
  // This distinguishes "no clients at all" from "no clients match filters"
  const { count: allClientsCount } = await supabase
    .from("clients")
    .select("*", { count: "exact", head: true })
    .eq("workspace_id", workspaceId);

  const hasAnyClients = (allClientsCount ?? 0) > 0;

  // Show global empty state ONLY when workspace has zero clients
  if (!hasAnyClients) {
    return (
      <>
        <ClientsPreferencesGate
          workspaceId={workspaceId}
          searchParams={resolvedSearchParams}
        />
        <div className="w-full min-w-0">
          <div className="p-6">
            <EmptyState
              title="No clients yet"
              message="Add your first client to start tracking invoices and payments."
              actionLabel="New client"
              actionHref={`/${workspaceId}/clients/new`}
            />
          </div>
        </div>
      </>
    );
  }

  const totalPages = Math.max(Math.ceil(totalCount / clientData.pageSize), 1);

  // Fetch invoice data for ONLY the current page client IDs
  const clientIds = safeClients.map((c) => c.id);
  
  // NOTE: Use invoices_view for outstanding field (outstanding_amount was dropped from invoices table)
  const { data: invoiceRows, error: invoiceRowsError } = await supabase
    .from("invoices_view")
    .select("client_id, display_status, risk_level, outstanding")
    .eq("workspace_id", workspaceId)
    .in("client_id", clientIds)
    .neq("display_status", "void")
    .neq("display_status", "draft");

  if (invoiceRowsError) {
    console.error("[ClientsPage] Error loading invoices:", invoiceRowsError);
    // Continue with empty data - will use fallback values
  }

  const safeInvoiceRows = invoiceRows ?? [];

  // Compute metrics per client using deterministic logic
  const clientMetrics = new Map<string, { outstandingSum: number; isOverdue: boolean; invoiceCount: number }>();
  
  for (const inv of safeInvoiceRows) {
    if (!inv.client_id) continue;
    
    // Sum outstanding_sum: COALESCE(outstanding, 0) for invoices where status NOT IN ("Draft","Void")
    const outstanding = Number(inv.outstanding ?? 0);
    const existing = clientMetrics.get(inv.client_id) ?? { outstandingSum: 0, isOverdue: false, invoiceCount: 0 };
    
    // Sum all outstanding amounts (including 0 and negative)
    existing.outstandingSum += outstanding;
    
    // Determine overdue signal from canonical invoices_view fields only.
    if (inv.display_status === "overdue" || inv.risk_level != null) {
      existing.isOverdue = true;
    }
    
    existing.invoiceCount += 1;
    clientMetrics.set(inv.client_id, existing);
  }

  // Enrich clients with metrics (preserve existing values if query failed)
  const clientsWithMetrics = safeClients.map((client) => {
    // If client already has outstanding and hasOverdueInvoices (from loadClients for view presets), use it
    if ("outstanding" in client && typeof client.outstanding === "number" && "hasOverdueInvoices" in client && typeof client.hasOverdueInvoices === "boolean") {
      const metrics = clientMetrics.get(client.id);
      return {
        ...client,
        invoicesCount: metrics?.invoiceCount ?? (client as any).invoicesCount ?? 0,
        outstanding: client.outstanding, // Use pre-computed value
        hasOverdueInvoices: client.hasOverdueInvoices, // Use pre-computed value
      };
    }
    
    // Otherwise use computed metrics or fallback to existing values
    const metrics = clientMetrics.get(client.id);
    const existingOutstanding = typeof (client as any).outstanding === "number" ? (client as any).outstanding : undefined;
    const existingHasOverdue = typeof (client as any).hasOverdueInvoices === "boolean" ? (client as any).hasOverdueInvoices : undefined;
    
    return {
      ...client,
      invoicesCount: metrics?.invoiceCount ?? (client as any).invoicesCount ?? 0,
      outstanding: metrics?.outstandingSum ?? existingOutstanding ?? 0,
      hasOverdueInvoices: metrics?.isOverdue ?? existingHasOverdue ?? false,
    };
  });

  // NO CLIENT-SIDE SORTING/FILTERING - all done server-side in loadClients()
  // The clients are already sorted/filtered according to view and sort params
  const viewClients = clientsWithMetrics;

  const safePage = Math.min(page, totalPages);
  const isClientLimitReached = limitCodeParam === "PLAN_LIMIT_CLIENTS";

  const filterSummaryParts: string[] = [];
  if (viewParam !== "default") {
    filterSummaryParts.push(
      CLIENT_VIEWS.find((v) => v.id === viewParam)?.label ?? viewParam
    );
  }
  if (statusParam !== "active") {
    filterSummaryParts.push(
      CLIENT_STATUS.find((s) => s.value === statusParam)?.label ?? statusParam
    );
  }
  const clientsFilterSummary =
    filterSummaryParts.length > 0 ? filterSummaryParts.join(" · ") : undefined;
  const activeFilterCount = Number(viewParam !== "default") + Number(statusParam !== "active");

  return (
    <>
      <ClientsPreferencesGate
        workspaceId={workspaceId}
        searchParams={resolvedSearchParams}
      />
      <div className="w-full min-w-0 space-y-4 md:space-y-6">
      {isClientLimitReached ? <PlanLimitBanner code="PLAN_LIMIT_CLIENTS" /> : null}
      <CommandBar>
        <PageHeader
          title="Clients"
          description="Manage your customers and their billing profiles."
          primaryAction={
            isClientLimitReached ? (
              <button
                type="button"
                className={primaryCtaDisabledClass}
                disabled
                title="Upgrade to create more"
              >
                New Client
              </button>
            ) : (
              <Link href={`/${workspaceId}/clients/new`} className={primaryCtaClass}>
                New Client
              </Link>
            )
          }
          headerTrailing={<ExportCsvButton workspaceId={workspaceId} module="clients" />}
        />

        <CommandBarSearch>
          <ClientsSearchInput
            workspaceId={workspaceId}
            initialSearch={searchTerm}
          />
        </CommandBarSearch>

        <CommandBarControls
          filters={
            <CommandBarFilters
              summary={clientsFilterSummary}
              activeCount={activeFilterCount}
              clearAllHref={`/${workspaceId}/clients`}
            >
              <div className="space-y-4">
                <div>
                  <p className="mb-2 text-sm font-semibold text-gray-700">
                    View
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {CLIENT_VIEWS.map((opt) => {
                      const isActive = viewParam === opt.id;
                      let viewSort: ClientSortKey | null = null;
                      let viewDir: SortDir | undefined = undefined;
                      if (opt.id === "default") {
                        viewSort = "created_at";
                        viewDir = "desc";
                      } else if (opt.id === "highest-outstanding-first") {
                        viewSort = "outstanding";
                        viewDir = "desc";
                      } else if (opt.id === "with-overdue-invoices") {
                        viewSort = "outstanding";
                        viewDir = "desc";
                      }

                      return (
                        <Link
                          key={opt.id || "default"}
                          href={buildClientsUrl(workspaceId, resolvedSearchParams, {
                            view: (opt.id || "default") as ClientListViewParam,
                            sort: viewSort,
                            dir: viewDir,
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
                    {CLIENT_STATUS.map((opt) => {
                      const isActive = statusParam === opt.value;
                      return (
                        <Link
                          key={opt.value}
                          href={buildClientsUrl(workspaceId, resolvedSearchParams, {
                            status: opt.value as ClientStatusParam,
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
              </div>
            </CommandBarFilters>
          }
          filterAdjacentActions={
            <ResetFiltersButton basePath={`/${workspaceId}/clients`} />
          }
        />
      </CommandBar>

      {/* Table / Cards */}
      {viewClients.length > 0 ? (
        <ClientsContentWrapper
          clients={viewClients}
          workspaceId={workspaceId}
          sortBy={sort ?? undefined}
          sortDir={dir ?? undefined}
          searchParams={resolvedSearchParams}
          view={viewParam !== "default" ? CLIENT_VIEWS.find((opt) => opt.id === viewParam)?.label : undefined}
          sortLabel={sortLabel(sort)}
          sortArrow={sortArrow(dir)}
          displayView={
            (() => {
              const rawDisplayView = Array.isArray(resolvedSearchParams.displayView)
                ? resolvedSearchParams.displayView[0]
                : resolvedSearchParams.displayView;
              return rawDisplayView === "list" || rawDisplayView === "cards"
                ? rawDisplayView
                : undefined;
            })()
          }
        />
      ) : (
        <EmptyState
          title={
            statusParam === "inactive"
              ? "No inactive clients yet"
              : "No clients match your filters"
          }
          message="Try clearing filters to view more clients."
          actionLabel="View all clients"
          actionHref={`/${workspaceId}/clients`}
        />
      )}

      {/* Pagination */}
      <PaginationBar
        currentPage={safePage}
        totalPages={totalPages}
        totalItems={totalCount}
        itemLabel={`client${totalCount !== 1 ? "s" : ""}`}
        basePath={`/${workspaceId}/clients`}
        queryParams={resolvedSearchParams}
      />
      </div>
    </>
  );
}
