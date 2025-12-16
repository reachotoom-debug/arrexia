import { requireWorkspace } from "@/lib/auth/server";
import { supabaseServer } from "@/lib/supabase/server";
import Link from "next/link";
import { ErrorState, EmptyState } from "@/components/ui/state";
import { ClientsContentWrapper } from "./_components/ClientsContentWrapper";
import { ClientsPreferencesGate } from "./_components/ClientsPreferencesGate";
import { computeInvoiceMetrics } from "@/lib/invoices/metrics";
import { ResetFiltersButton } from "@/components/shared/reset-filters-button";
import { ClientsSearchInput } from "./_components/ClientsSearchInput";

const ORGANIZATION_ID = "05d2d292-d95b-44f4-b774-22f10068124f";
const CLIENTS_PAGE_SIZE = 10;

const CLIENT_STATUS = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
];

const CLIENT_VIEWS = [
  { id: "default", label: "Default View" },
  { id: "highest-outstanding-first", label: "Highest outstanding first" },
  { id: "active-only", label: "Active only" },
  { id: "with-overdue-invoices", label: "With overdue invoices" },
];

type ClientStatusParam = "all" | "active" | "inactive";
type ClientListViewParam = "default" | "highest-outstanding-first" | "active-only" | "with-overdue-invoices";
type ClientSortKey = "client_name" | "company" | "email" | "outstanding" | "invoices_count" | "status";
type SortDir = "asc" | "desc";

/**
 * Parse and validate clients query parameters with defaults
 * Defaults: page=1, pageSize=10, status="all", view="default", q="", sort="client_name", dir="asc"
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
  const rawStatus = Array.isArray(searchParams.status) ? searchParams.status[0] : searchParams.status;
  const status: ClientStatusParam = (rawStatus || "all").toLowerCase() as ClientStatusParam;
  const allowedStatus: ClientStatusParam[] = ["all", "active", "inactive"];
  const normalizedStatus = allowedStatus.includes(status) ? status : "all";

  // Extract and normalize view
  const rawView = Array.isArray(searchParams.view) ? searchParams.view[0] : searchParams.view;
  const view: ClientListViewParam = (rawView || "default") as ClientListViewParam;

  // Extract search term (q or search for backward compatibility)
  const rawQ = Array.isArray(searchParams.q) ? searchParams.q[0] : searchParams.q;
  const rawSearch = Array.isArray(searchParams.search) ? searchParams.search[0] : searchParams.search;
  const q = (rawQ || rawSearch || "").trim();

  // Extract and validate sort (nullable)
  const rawSort = Array.isArray(searchParams.sort) ? searchParams.sort[0] : searchParams.sort;
  // Also support legacy sortBy param
  const rawSortBy = Array.isArray(searchParams.sortBy) ? searchParams.sortBy[0] : searchParams.sortBy;
  const sortInput = rawSort || rawSortBy;
  const allowedSorts: ClientSortKey[] = ["client_name", "company", "email", "outstanding", "invoices_count", "status"];
  // Map "name" to "client_name" for backward compatibility
  const normalizedSortInput = sortInput === "name" ? "client_name" : sortInput;
  let sort: ClientSortKey | null = normalizedSortInput && allowedSorts.includes(normalizedSortInput as ClientSortKey)
    ? (normalizedSortInput as ClientSortKey)
    : "client_name"; // Default to "client_name"

  // Extract and validate dir (default "asc")
  const rawDir = Array.isArray(searchParams.dir) ? searchParams.dir[0] : searchParams.dir;
  // Also support legacy sortDir param
  const rawSortDir = Array.isArray(searchParams.sortDir) ? searchParams.sortDir[0] : searchParams.sortDir;
  const dirInput = rawDir || rawSortDir;
  const dir: SortDir = dirInput === "asc" || dirInput === "desc" ? dirInput : "asc";

  // If view != "default", set sort=null (ignore header sort)
  if (view !== "default") {
    sort = null;
  }

  return {
    page,
    pageSize,
    status: normalizedStatus,
    view,
    q,
    sort,
    dir,
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
  const meaningfulParams = ["status", "view", "q", "search", "sort", "dir", "pageSize"];
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
  // status="all" -> remove
  if (urlParams.get("status") === "all") {
    urlParams.delete("status");
  }
  // view="default" -> remove
  if (urlParams.get("view") === "default") {
    urlParams.delete("view");
  }
  // sort=null or empty -> remove sort and dir
  if (!urlParams.get("sort")) {
    urlParams.delete("sort");
    // dir="asc" is default, so remove it if no sort
    if (urlParams.get("dir") === "asc") {
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

  // Debug log (dev only) - match InvoicesPage style
  if (process.env.NODE_ENV === "development") {
    console.log("[ClientsPage] Query params:", {
      received: searchParams,
      parsed: { page, pageSize, status, view, q, sort, dir },
      range: { from, to },
    });
  }

  // Build base query - select all columns from clients table
  // IMPORTANT: For views that need invoice data, we fetch ALL matching clients first,
  // then apply view filtering/sorting, then paginate in memory
  // For simple views, we can paginate directly in SQL
  const needsInvoiceData = view === "highest-outstanding-first" || view === "with-overdue-invoices";
  
  let query = supabase
    .from("clients")
    .select("id, name, company, email, status, workspace_id, country, whatsapp, whatsapp_phone, payment_terms, created_at, updated_at", { count: "exact" })
    .eq("workspace_id", workspaceId);

  // Apply status filters
  // status=active => eq(status,'active')
  // status=inactive => eq(status,'archived') (database uses "archived" for inactive)
  if (status === "active") {
    query = query.eq("status", "active");
  } else if (status === "inactive") {
    query = query.eq("status", "archived");
  }
  // status="all" => no filter

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
  //   - view=active-only => status=active, sort=client_name, dir=asc
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
    // Default view: use header sort if present, otherwise default to client_name asc
    const sortColumn = sort ? getSortColumn(sort) : "name";
    if (sortColumn) {
      query = query.order(sortColumn, { ascending: sort ? (dir === "asc") : true, nullsFirst: false });
      appliedOrder = sort ? `${sort} ${dir}` : "client_name asc";
      query = query.order("id", { ascending: true }); // Stable secondary sort
    }
    appliedView = "default";
  } else if (view === "active-only") {
    // active-only: filter status active + order by name asc
    query = query.eq("status", "active");
    query = query.order("name", { ascending: true });
    appliedView = "active-only";
    query = query.order("id", { ascending: true }); // Stable secondary sort
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

  // Debug log (dev only) - match InvoicesPage style
  if (process.env.NODE_ENV === "development") {
    console.log("[ClientsPage] Query result:", {
      count: typeof count === "number" ? count : 0,
      rowsReturned: clientsFromDb?.length || 0,
      page,
      pageSize,
      totalPages: Math.ceil((typeof count === "number" ? count : 0) / pageSize),
      appliedOrder,
      appliedView,
      needsInvoiceData,
    });
  }

  // Error handling - always log full error details with actionable information
  if (error) {
    const errorDetails = {
      message: error.message || "Unknown error",
      code: error.code || null,
      details: (error as any).details || null,
      hint: (error as any).hint || null,
    };
    
    const selectString = "id, name, company, email, status, workspace_id, country, whatsapp, whatsapp_phone, payment_terms, created_at, updated_at";
    
    // Log error.code, error.message, selectString as required
    console.error("[ClientsPage] failed to load clients (Supabase error)", {
      code: errorDetails.code,
      message: errorDetails.message,
      details: errorDetails.details,
      hint: errorDetails.hint,
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
      },
    });
    
    // DO NOT swallow errors - throw so error boundary can handle
    throw error;
  }

  // For views needing invoice data, we need to:
  // 1. Fetch all invoices for this workspace
  // 2. Compute metrics per client
  // 3. Apply view filtering/sorting
  // 4. Paginate in memory
  if (needsInvoiceData && clientsFromDb) {
    // Fetch all invoices for computing metrics
    const { data: invoiceRows } = await supabase
      .from("invoices")
      .select("id, client_id, status, amount, total_paid, outstanding_amount, due_date")
      .eq("workspace_id", workspaceId)
      .neq("status", "void");

    const safeInvoiceRows = invoiceRows ?? [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Compute metrics per client
    const clientMetrics = new Map<string, { outstanding: number; hasOverdue: boolean }>();
    
    for (const inv of safeInvoiceRows) {
      if (!inv.client_id) continue;
      
      const outstanding = Number(inv.outstanding_amount ?? 0);
      const isOverdue = inv.due_date && outstanding > 0 && new Date(inv.due_date) < today;
      
      const existing = clientMetrics.get(inv.client_id) ?? { outstanding: 0, hasOverdue: false };
      existing.outstanding += outstanding;
      if (isOverdue) existing.hasOverdue = true;
      clientMetrics.set(inv.client_id, existing);
    }

    // Enrich clients with metrics
    let enrichedClients = clientsFromDb.map((client) => ({
      ...client,
      outstanding: clientMetrics.get(client.id)?.outstanding ?? 0,
      hasOverdueInvoices: clientMetrics.get(client.id)?.hasOverdue ?? false,
    }));

    // Apply view-specific filtering and sorting
    // IMPORTANT: View presets map to (sort,dir) - sort by numeric outstanding from DB
    // Ensure outstanding is always numeric (not formatted strings)
    if (view === "highest-outstanding-first") {
      // Sort by outstanding descending (numeric comparison)
      // outstanding is computed as Number() above, so it's already numeric
      enrichedClients.sort((a, b) => {
        const aOutstanding = Number(a.outstanding ?? 0);
        const bOutstanding = Number(b.outstanding ?? 0);
        return bOutstanding - aOutstanding; // Descending
      });
      appliedView = "highest-outstanding-first (sorted by outstanding desc)";
      appliedOrder = "outstanding desc";
    } else if (view === "with-overdue-invoices") {
      // Filter to only clients with overdue invoices
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

    // Debug log (dev only) - match InvoicesPage style
    if (process.env.NODE_ENV === "development") {
      console.log("[ClientsPage] After view processing:", {
        totalClients: enrichedClients.length,
        paginatedCount: paginatedClients.length,
        appliedView,
        appliedOrder,
        range: { from, to },
        count: totalCount,
      });
    }

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

  // For views that don't need invoice data, return directly (already paginated in SQL)
  return {
    clients: clientsFromDb ?? [],
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
 * Canonical: status=all&view=default&sort=client_name&dir=asc&page=1&pageSize=10
 * If q exists, include it too
 */
function buildCanonicalClientsUrl(
  workspaceId: string,
  q?: string
): string {
  const params = new URLSearchParams();
  params.set("status", "all");
  params.set("view", "default");
  params.set("sort", "client_name");
  params.set("dir", "asc");
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
  const { workspaceId } = await params;
  await requireWorkspace(workspaceId);
  const resolvedSearchParams = await searchParams;
  
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
  // Canonical: status=all, view=default, sort=client_name, dir=asc, page=1, pageSize=10
  const needsRedirect = !hasStatus || !hasView || !hasSort || !hasDir || !hasPage || !hasPageSize;
  
  if (needsRedirect) {
    const { redirect } = await import("next/navigation");
    const canonicalParams = new URLSearchParams();
    
    // Use existing values if valid, otherwise use defaults
    const status = hasStatus 
      ? (Array.isArray(resolvedSearchParams.status) ? resolvedSearchParams.status[0] : resolvedSearchParams.status)
      : "all";
    const view = hasView
      ? (Array.isArray(resolvedSearchParams.view) ? resolvedSearchParams.view[0] : resolvedSearchParams.view)
      : "default";
    const sort = hasSort
      ? (Array.isArray(resolvedSearchParams.sort) ? resolvedSearchParams.sort[0] : resolvedSearchParams.sort)
      : "client_name";
    const dir = hasDir
      ? (Array.isArray(resolvedSearchParams.dir) ? resolvedSearchParams.dir[0] : resolvedSearchParams.dir)
      : "asc";
    const page = hasPage
      ? (Array.isArray(resolvedSearchParams.page) ? resolvedSearchParams.page[0] : resolvedSearchParams.page)
      : "1";
    const pageSize = hasPageSize
      ? (Array.isArray(resolvedSearchParams.pageSize) ? resolvedSearchParams.pageSize[0] : resolvedSearchParams.pageSize)
      : String(CLIENTS_PAGE_SIZE);
    
    // Validate values match allowed options
    const validStatus = ["all", "active", "inactive"].includes(status?.toLowerCase() || "") ? status : "all";
    const validView = ["default", "highest-outstanding-first", "active-only", "with-overdue-invoices"].includes(view || "") ? view : "default";
    const validSort = ["client_name", "company", "email", "outstanding", "invoices_count", "status"].includes(sort || "") ? sort : "client_name";
    const validDir = ["asc", "desc"].includes(dir?.toLowerCase() || "") ? dir : "asc";
    const validPage = Math.max(parseInt(page || "1", 10) || 1, 1).toString();
    const validPageSize = Math.max(parseInt(pageSize || String(CLIENTS_PAGE_SIZE), 10) || CLIENTS_PAGE_SIZE, 1).toString();
    
    canonicalParams.set("status", validStatus);
    canonicalParams.set("view", validView);
    canonicalParams.set("sort", validSort);
    canonicalParams.set("dir", validDir);
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
        <div className="max-w-5xl mx-auto py-6">
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
        <div className="max-w-5xl mx-auto py-6">
          <div className="p-6">
            <EmptyState
              title="No clients yet"
              message="Add your first client to start tracking invoices and payments."
            />
          </div>
        </div>
      </>
    );
  }

  const totalPages = Math.max(Math.ceil(totalCount / clientData.pageSize), 1);

  // Fetch all invoices with derived fields for this workspace
  // Simplified query with only scalar columns (no relations)
  // MUST filter by workspace_id to match the Invoices list page
  const { data: invoiceRows, error: invoiceRowsError } = await supabase
    .from("invoices")
    .select(
      `
      id,
      client_id,
      workspace_id,
      status,
      amount,
      total_paid,
      outstanding_amount,
      payment_state,
      issue_date,
      due_date
    `
    )
    .eq("workspace_id", workspaceId)
    .neq("status", "void");

  if (invoiceRowsError) {
    // TEMPORARY: Verbose error logging to see actual Supabase error
    console.error(
      "[ClientsPage] invoiceRowsError:",
      invoiceRowsError,
      "message:",
      (invoiceRowsError as any).message,
      "code:",
      (invoiceRowsError as any).code,
      "details:",
      (invoiceRowsError as any).details,
      "hint:",
      (invoiceRowsError as any).hint
    );
  }

  // Safe invoice rows array
  const safeInvoiceRows = invoiceRows ?? [];

  // Aggregate invoice metrics by client using centralized calculation
  const invoiceMetricsByClient = new Map<
    string,
    {
      totalAmount: number;
      totalPaid: number;
      outstanding: number;
      overdueCount: number;
      invoiceCount: number;
    }
  >();

  for (const inv of safeInvoiceRows) {
    const clientId = inv.client_id;
    if (!clientId) continue;

    // Use centralized metrics calculation
    const metrics = computeInvoiceMetrics({
      invoice: {
        id: inv.id,
        status: inv.status,
        amount: inv.amount,
        due_date: inv.due_date,
        outstanding_amount: inv.outstanding_amount,
        total_paid: inv.total_paid,
      },
    });

    const clientMetrics = invoiceMetricsByClient.get(clientId) ?? {
      totalAmount: 0,
      totalPaid: 0,
      outstanding: 0,
      overdueCount: 0,
      invoiceCount: 0,
    };

    clientMetrics.totalAmount += metrics.total;
    clientMetrics.totalPaid += metrics.paidAmount;
    clientMetrics.outstanding += metrics.outstanding;
    clientMetrics.invoiceCount += 1;
    if (metrics.isOverdue) {
      clientMetrics.overdueCount += 1;
    }

    invoiceMetricsByClient.set(clientId, clientMetrics);
  }

  // Build invoicesByClient Map for view filtering (client_id -> array of invoices)
  // Use dynamic overdue logic: (due_date < today) AND (outstanding_amount > 0)
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const invoicesByClient = new Map<
    string,
    Array<{ id: string; client_id: string | null; due_date: string | null; status: string | null; isOverdue: boolean }>
  >();
  safeInvoiceRows.forEach((inv) => {
    if (!inv.client_id) return;
    // Calculate overdue dynamically: (due_date < today) AND (outstanding_amount > 0)
    let isOverdue = false;
    if (inv.due_date && Number(inv.outstanding_amount ?? 0) > 0) {
      const dueDate = new Date(inv.due_date);
      dueDate.setHours(0, 0, 0, 0);
      isOverdue = dueDate < today;
    }
    const list = invoicesByClient.get(inv.client_id) ?? [];
    list.push({
      id: inv.id,
      client_id: inv.client_id,
      due_date: inv.due_date,
      status: inv.status,
      isOverdue,
    });
    invoicesByClient.set(inv.client_id, list);
  });

  // Enrich clients with metrics from aggregated invoice data for display
  // Note: For views that need invoice data (highest-outstanding-first, with-overdue-invoices),
  // the metrics are already computed in loadClients() and included in safeClients.
  // For other views, we still need to compute metrics for display purposes.
  const clientsWithMetrics = safeClients.map((client) => {
    // If client already has outstanding (from loadClients for view presets), use it
    if ("outstanding" in client && typeof client.outstanding === "number") {
      const metrics = invoiceMetricsByClient.get(client.id) ?? {
        totalAmount: 0,
        totalPaid: 0,
        outstanding: client.outstanding,
        overdueCount: 0,
        invoiceCount: 0,
      };
      return {
        ...client,
        invoicesCount: metrics.invoiceCount,
        outstanding: client.outstanding,
        hasOverdueInvoices: client.hasOverdueInvoices ?? metrics.overdueCount > 0,
      };
    }
    
    // Otherwise compute metrics from invoice data
    const metrics = invoiceMetricsByClient.get(client.id) ?? {
      totalAmount: 0,
      totalPaid: 0,
      outstanding: 0,
      overdueCount: 0,
      invoiceCount: 0,
    };

    return {
      ...client,
      invoicesCount: metrics.invoiceCount,
      outstanding: metrics.outstanding,
      hasOverdueInvoices: metrics.overdueCount > 0,
    };
  });

  // NO CLIENT-SIDE SORTING/FILTERING - all done server-side in loadClients()
  // The clients are already sorted/filtered according to view and sort params
  const viewClients = clientsWithMetrics;

  const safePage = Math.min(page, totalPages);
  const canPrev = safePage > 1;
  const canNext = safePage < totalPages;

  return (
    <>
      <ClientsPreferencesGate
        workspaceId={workspaceId}
        searchParams={resolvedSearchParams}
      />
      <div className="max-w-6xl mx-auto py-6 space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Clients</h1>
          <p className="text-sm text-slate-500">
            Manage your customers and their billing profiles.
          </p>
        </div>

        <Link
          href={`/${workspaceId}/clients/new`}
          className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700"
        >
          New Client
        </Link>
      </div>

      {/* View Presets */}
      <div className="flex flex-wrap gap-2">
        {CLIENT_VIEWS.map((opt) => {
          const isActive = viewParam === opt.id;
          // Map view presets to (sort,dir) for canonical URL structure
          // Server will ignore sort/dir when view != "default", but we set them for canonical structure
          let viewSort: ClientSortKey | null = null;
          let viewDir: SortDir | undefined = undefined;
          if (opt.id === "default") {
            viewSort = "client_name";
            viewDir = "asc";
          } else if (opt.id === "highest-outstanding-first") {
            viewSort = "outstanding";
            viewDir = "desc";
          } else if (opt.id === "active-only") {
            viewSort = "client_name";
            viewDir = "asc";
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
                  ? "border-blue-600 bg-blue-50 text-blue-700"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50")
              }
            >
              {opt.label}
            </Link>
          );
        })}
      </div>

      {/* Filters + Search */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Status pills */}
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
                    ? "border-blue-600 bg-blue-50 text-blue-700"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50")
                }
              >
                {opt.label}
              </Link>
            );
          })}
        </div>

        {/* Search + Reset */}
        <div className="flex flex-wrap items-center gap-2">
          <ClientsSearchInput
            workspaceId={workspaceId}
            initialSearch={searchTerm}
          />
          <ResetFiltersButton basePath={`/${workspaceId}/clients`} />
        </div>
      </div>

      {/* Table / Cards */}
      {viewClients.length > 0 ? (
        <ClientsContentWrapper
          clients={viewClients}
          workspaceId={workspaceId}
          sortBy={sort}
          sortDir={dir}
          searchParams={resolvedSearchParams}
          view={viewParam !== "default" ? CLIENT_VIEWS.find((opt) => opt.id === viewParam)?.label : undefined}
          sortLabel={sortLabel(sort)}
          sortArrow={sortArrow(dir)}
        />
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white">
          <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
            {/* Icon */}
            <div className="mb-3 rounded-full bg-muted p-3">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5 text-muted-foreground"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3 7l1.664 9.148A2 2 0 006.646 18h10.708a2 2 0 001.982-1.852L21 7H3z"
                />
              </svg>
            </div>

            {/* Title */}
            <h3 className="text-base font-semibold text-foreground">
              {statusParam === "inactive"
                ? "No inactive clients yet"
                : "No clients match your filters"}
            </h3>

            {/* Subtitle */}
            <p className="mt-1 text-sm text-muted-foreground">
              Try clearing filters to view more clients.
            </p>
          </div>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2 text-xs text-slate-600">
          <div>
            Page {safePage} of {totalPages} · {totalCount} client{totalCount !== 1 ? "s" : ""}
          </div>
          <div className="flex items-center gap-2">
            {canPrev && (
              <Link
                href={buildClientsUrl(workspaceId, resolvedSearchParams, { 
                  page: safePage - 1,
                })}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium hover:bg-slate-50"
              >
                Previous
              </Link>
            )}
            {canNext && (
              <Link
                href={buildClientsUrl(workspaceId, resolvedSearchParams, { 
                  page: safePage + 1,
                })}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium hover:bg-slate-50"
              >
                Next
              </Link>
            )}
          </div>
        </div>
      )}
      </div>
    </>
  );
}
