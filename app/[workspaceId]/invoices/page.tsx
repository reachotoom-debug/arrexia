import { requireUser } from "@/lib/auth/server";
import { requireWorkspace } from "@/lib/auth/server";
import { supabaseServer } from "@/lib/supabase/server";
import Link from "next/link";
import { formatMoney } from "@/lib/utils/format-money";
import { ErrorState, EmptyState } from "@/components/ui/state";
import { SortableHeader } from "@/components/shared/sortable-header";
import { ResetSortButton } from "@/components/shared/reset-sort-button";
import { ResetFiltersButton } from "@/components/shared/reset-filters-button";
import { InvoicesPreferencesGate } from "./_components/InvoicesPreferencesGate";
import { InvoicesClientFilterBadge } from "./_components/InvoicesClientFilterBadge";
import { InvoicesSearchInput } from "./_components/InvoicesSearchInput";
// Note: invoices_view provides status (capitalized: 'Void', 'Paid', 'Partially Paid', 'Draft', 'Overdue', 'Sent'),
// is_overdue, days_overdue, and risk_level directly. No need to compute them in TypeScript.

const INVOICE_PAGE_SIZE = 10;

type InvoiceStatusParam = "all" | "draft" | "sent" | "paid" | "partial" | "overdue" | "void";
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
// Canonical contract: total, paid, outstanding, currency, is_overdue, po_number, notes
type InvoiceRow = {
  id: string;
  workspace_id: string;
  client_id: string | null;
  client_name: string | null;
  invoice_number: string | null;
  base_status: string;
  issue_date: string | null;
  due_date: string | null;
  currency: string | null;
  total: number | null; // Canonical: total (not total_amount)
  paid: number | null; // Canonical: paid (not paid_amount)
  outstanding: number | null;
  display_status: InvoiceStatus; // Canonical status from SQL view
  is_overdue: boolean | null; // Canonical: is_overdue (not overdue)
  overdue_days: number | null;
  risk_level: string | null;
  po_number: string | null;
  notes: string | null;
  [key: string]: unknown;
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
  if (!raw) return "all";
  const value = raw.toLowerCase() as InvoiceStatusParam;
  const allowed: InvoiceStatusParam[] = [
    "all",
    "draft",
    "sent",
    "paid",
    "partial",
    "overdue",
    "void",
  ];
  return allowed.includes(value) ? value : "all";
}

function sortLabel(sort: InvoiceSortKey): string {
  switch (sort) {
    case "invoice_number":
      return "Invoice #";
    case "client_name":
      return "Client Name";
    case "issue_date":
      return "Issue Date";
    case "due_date":
      return "Due Date";
    case "total":
      return "Total";
    case "outstanding":
      return "Outstanding";
    default:
      return "Issue Date";
  }
}

function sortArrow(dir: SortDir): "↑" | "↓" {
  return dir === "asc" ? "↑" : "↓";
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
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  // Debug log (dev only)
  if (process.env.NODE_ENV === "development") {
    console.log("[InvoicesPage] Query params:", {
      received: searchParams,
      parsed: { page, pageSize, status, view, search, sort, dir },
      range: { from, to },
    });
  }

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
      // "all" or anything unknown = no extra filter
      break;
  }

  // Build base query - select all columns from invoices_view using canonical contract
  let query = supabase
    .from("invoices_view")
    .select(
      "id, workspace_id, client_id, client_name, invoice_number, base_status, issue_date, due_date, currency, total, paid, outstanding, display_status, is_overdue, overdue_days, risk_level, po_number, notes",
      { count: "exact" }
    )
    .eq("workspace_id", workspaceId);

  // Apply status filters
  if (baseStatusFilter) {
    query = query.eq("base_status", baseStatusFilter);
  }

  if (displayStatusFilter) {
    // Normalize the filter value to snake_case
    const normalizedFilter = normalizeDisplayStatus(displayStatusFilter);
    // Convert to capitalized format (e.g., "partially_paid" -> "Partially Paid")
    const capitalizedFilter = normalizedFilter
      .split("_")
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
    // Use or() to handle both lowercase snake_case and capitalized space-separated formats from DB
    query = query.or(`display_status.eq.${normalizedFilter},display_status.eq.${capitalizedFilter}`);
  }

  // Apply search filter (server-side) - search across invoice_number, po_number, notes, client_name
  if (search) {
    // Escape special characters in search term for PostgREST ILIKE
    // PostgREST uses % for wildcards and _ for single character, so we need to escape them
    const escapedSearch = search.replace(/%/g, "\\%").replace(/_/g, "\\_");
    const searchPattern = `%${escapedSearch}%`;
    // Use PostgREST or() syntax for multiple ILIKE conditions
    query = query.or(
      `invoice_number.ilike.${searchPattern},client_name.ilike.${searchPattern},po_number.ilike.${searchPattern},notes.ilike.${searchPattern}`
    );
  }

  // Apply view-specific ordering and filtering
  // Note: If view is "default" and sort params exist, use those instead
  if (view === "default" && sort) {
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
          .order("is_overdue", { ascending: false })      // true first
          .order("due_date", { ascending: true })         // earlier due dates first
          .order("issue_date", { ascending: false });     // then by issue date desc
        query = query.order("id", { ascending: true }); // Stable secondary sort
        break;
      }

      case "smart-high-risk": {
        query = query
          .eq("risk_level", "high")
          .eq("is_overdue", true)
          .order("outstanding", { ascending: false })
          .order("overdue_days", { ascending: false });
        query = query.order("id", { ascending: true }); // Stable secondary sort
        break;
      }

      case "smart-medium-risk": {
        query = query
          .eq("risk_level", "medium")
          .eq("is_overdue", true)
          .order("overdue_days", { ascending: false })
          .order("outstanding", { ascending: false });
        query = query.order("id", { ascending: true }); // Stable secondary sort
        break;
      }

      case "smart-low-risk": {
        query = query
          .eq("risk_level", "low")
          .eq("is_overdue", true)
          .order("overdue_days", { ascending: false })
          .order("outstanding", { ascending: false });
        query = query.order("id", { ascending: true }); // Stable secondary sort
        break;
      }

      case "default":
      default: {
        // Default sort by issue_date descending
        query = query.order("issue_date", { ascending: false });
        query = query.order("id", { ascending: true }); // Stable secondary sort
        break;
      }
    }
  }

  // Apply pagination (AFTER all filtering, search, and ordering)
  // IMPORTANT: All filtering (.eq, .or), search (.or with ilike), and ordering (.order)
  // must happen BEFORE .range() to ensure sorting/search/filtering apply across ALL pages
  const { data: invoicesFromView, error, count } = await query.range(from, to);

  // Debug log (dev only)
  if (process.env.NODE_ENV === "development") {
    console.log("[InvoicesPage] Query result:", {
      count: typeof count === "number" ? count : 0,
      rowsReturned: invoicesFromView?.length || 0,
      page,
      pageSize,
      totalPages: Math.ceil((typeof count === "number" ? count : 0) / pageSize),
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
    
    const selectString = "id, workspace_id, client_id, client_name, invoice_number, base_status, issue_date, due_date, currency, total, paid, outstanding, display_status, is_overdue, overdue_days, risk_level, po_number, notes";
    
    // Log error.code, error.message, selectString as required
    console.error("[InvoicesPage] failed to load invoices (Supabase error)", {
      code: errorDetails.code,
      message: errorDetails.message,
      details: errorDetails.details,
      hint: errorDetails.hint,
      selectString,
      queryInputs: {
        view,
        status,
        search,
        sort,
        dir,
        page,
        pageSize,
        workspaceId,
      },
    });
    
    // DO NOT swallow errors - throw so error boundary can handle
    throw error;
  }

  return {
    invoices: invoicesFromView ?? [],
    totalCount: typeof count === "number" ? count : 0,
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
] as const;

const VIEW_OPTIONS = [
  { value: "", label: "Default View" },
  { value: "overdue-first", label: "Overdue First" },
  { value: "highest-outstanding-first", label: "Highest Outstanding First" },
];

const SMART_INVOICE_VIEWS = [
  { id: "smart-high-risk", label: "Smart: High risk overdue" },
  { id: "smart-medium-risk", label: "Smart: Medium risk" },
  { id: "smart-low-risk", label: "Smart: Low risk" },
];

export default async function InvoicesPage({
  params,
  searchParams,
}: InvoicesPageProps) {
  const user = await requireUser();
  const resolvedParams = await params;
  const { workspace } = await requireWorkspace(resolvedParams.workspaceId);
  const workspaceId = workspace.id;

  const resolvedSearchParams = (await searchParams) || {};

  // Load invoices using the refactored function
  let invoiceData;
  try {
    invoiceData = await loadInvoices(workspaceId, resolvedSearchParams);
  } catch (error) {
    return (
      <>
        <InvoicesPreferencesGate
          workspaceId={workspaceId}
          searchParams={resolvedSearchParams}
        />
        <div className="max-w-5xl mx-auto py-6">
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

  const { invoices, totalCount, page, view: viewParam, status: statusParam, sort, dir, search: searchTerm } = invoiceData;
  const invoiceRows = invoices ?? [];

  // Extract clientId for UI
  const rawClientId = Array.isArray(resolvedSearchParams.clientId)
    ? resolvedSearchParams.clientId[0]
    : resolvedSearchParams.clientId;
  const clientId = rawClientId || undefined;

  // Show empty state if no invoices
  if (invoiceRows.length === 0 && totalCount === 0) {
    return (
      <>
        <InvoicesPreferencesGate
          workspaceId={workspaceId}
          searchParams={resolvedSearchParams}
        />
        <div className="max-w-5xl mx-auto py-6">
          <div className="p-6">
            <EmptyState
              title="No invoices yet"
              message="Create your first invoice to start tracking receivables."
            />
          </div>
        </div>
      </>
    );
  }

  // Enrich invoices - use fields directly from invoices_view (canonical contract)
  // No client-side sorting/filtering - all done server-side
  const enrichedInvoices = invoiceRows.map((invoice: InvoiceRow) => {
    // Use canonical column names: total, paid, outstanding, is_overdue
    const outstanding = Number(invoice.outstanding ?? 0);
    const amount = Number(invoice.total ?? 0);
    const totalPaid = Number(invoice.paid ?? 0);
    
    // Normalize display_status to canonical format (handles both formats from DB)
    const displayStatusNormalized = normalizeDisplayStatus(invoice.display_status || "sent");
    const daysOverdue = invoice.overdue_days ?? 0;
    const risk = invoice.risk_level || null;
    const invoiceIsOverdue = invoice.is_overdue ?? false;
    
    // invoice_number and client_name are now available from invoices_view
    const invoiceNumber = invoice.invoice_number ?? null;
    const clientName = invoice.client_name ?? null;
    const currency = invoice.currency ?? "USD";
    
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
      days_overdue: daysOverdue,
      risk: risk || "none",
      daysOverdue,
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

  const getStatusBadge = (status: string) => {
    const statusLower = status.toLowerCase();
    if (statusLower === "paid") {
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    } else if (statusLower === "overdue") {
      return "bg-red-50 text-red-700 border-red-200";
    } else if (statusLower === "sent") {
      return "bg-blue-50 text-blue-700 border-blue-200";
    } else if (statusLower === "partial") {
      return "bg-amber-50 text-amber-700 border-amber-200";
    } else if (statusLower === "void") {
      return "bg-slate-100 text-slate-500 border-slate-200";
    }
    return "bg-slate-50 text-slate-700 border-slate-200";
  };

  const getRiskBadge = (risk: "high" | "medium" | "low" | "none") => {
    if (risk === "high") {
      return "bg-red-100 text-red-700 border-red-300";
    } else if (risk === "medium") {
      return "bg-orange-100 text-orange-700 border-orange-300";
    } else if (risk === "low") {
      return "bg-yellow-100 text-yellow-700 border-yellow-300";
    }
    return "";
  };

  const canPrev = safePage > 1;
  const canNext = safePage < totalPages;

  return (
    <>
      <InvoicesPreferencesGate
        workspaceId={workspaceId}
        searchParams={resolvedSearchParams}
      />
      <div className="max-w-5xl mx-auto py-6 space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Invoices</h1>
          <p className="text-sm text-slate-500">
            View and manage all invoices for this organization.
          </p>
        </div>

        <Link
          href={`/${workspaceId}/invoices/new`}
          className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700"
        >
          New Invoice
        </Link>
      </div>

      {/* View Presets */}
      <div className="flex flex-wrap gap-2">
        {VIEW_OPTIONS.map((opt) => {
          const isActive = viewParam === opt.value;
          return (
            <Link
              key={opt.value || "default"}
              href={buildInvoicesUrl(workspaceId, resolvedSearchParams, { 
                view: (opt.value || "default") as InvoiceListViewParam,
                status: "all", // Reset status to "all" when changing view
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

      {/* Smart Views */}
      <div className="flex flex-wrap items-center gap-2 px-4 py-1">
        <span className="text-xs font-semibold text-slate-500">Smart views</span>
        <div className="flex flex-wrap gap-2">
          {SMART_INVOICE_VIEWS.map((v) => {
            const isActive = viewParam === v.id;
            const href = buildInvoicesUrl(workspaceId, resolvedSearchParams, { 
              view: v.id as InvoiceListViewParam,
              status: "all", // Reset status to "all" when changing view
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

      {/* Filters + Search */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Status pills */}
        <div className="flex flex-wrap gap-2">
          {statusFilters.map((filter) => {
            const isActive = statusParam === filter.value;
            return (
              <Link
                key={filter.value}
                href={buildInvoicesUrl(workspaceId, resolvedSearchParams, { 
                  status: filter.value as InvoiceStatusParam,
                })}
                className={
                  "inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition " +
                  (isActive
                    ? "border-blue-600 bg-blue-50 text-blue-700"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50")
                }
              >
                {filter.label}
              </Link>
            );
          })}
        </div>

        {/* Search + Reset */}
        <div className="flex flex-wrap items-center gap-2">
          <InvoicesSearchInput
            workspaceId={workspaceId}
            initialSearch={searchTerm}
          />
          <ResetFiltersButton basePath={`/${workspaceId}/invoices`} />
        </div>
      </div>

      {/* Client Filter Badge */}
      {clientId && (
        <InvoicesClientFilterBadge
          clientId={clientId}
          clientName={clientFilterName}
          workspaceId={workspaceId}
        />
      )}

      {/* Table or Empty State */}
      {enrichedInvoices.length > 0 ? (
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2 text-xs text-slate-500">
          <div className="flex items-center gap-2">
            {viewParam !== "default" ? (
              <>
                <span>View:</span>
                <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-[11px] font-medium text-slate-700">
                  {VIEW_OPTIONS.find((opt) => opt.value === viewParam)?.label || viewParam}
                </span>
              </>
            ) : (
              <>
                <span>Sorted by</span>
                <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-[11px] font-medium text-slate-700">
                  {sortLabel(sort)} {sortArrow(dir)}
                </span>
              </>
            )}
          </div>
        </div>
        <table className="min-w-full table-auto text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr className="text-xs uppercase tracking-wide text-slate-500">
              <th className="px-3 py-2 text-left">
                <SortableHeader
                  label="Invoice #"
                  sortKey="invoice_number"
                  workspaceId={workspaceId}
                  currentParams={resolvedSearchParams}
                />
              </th>
              <th className="px-3 py-2 text-left">
                <SortableHeader
                  label="Client"
                  sortKey="client_name"
                  workspaceId={workspaceId}
                  currentParams={resolvedSearchParams}
                />
              </th>
              <th className="px-3 py-2 text-left">Status</th>
              <th className="px-3 py-2 text-left">
                <SortableHeader
                  label="Issue Date"
                  sortKey="issue_date"
                  workspaceId={workspaceId}
                  currentParams={resolvedSearchParams}
                />
              </th>
              <th className="px-3 py-2 text-left">
                <SortableHeader
                  label="Due Date"
                  sortKey="due_date"
                  workspaceId={workspaceId}
                  currentParams={resolvedSearchParams}
                />
              </th>
              <th className="px-3 py-2 text-right">
                <SortableHeader
                  label="Total"
                  sortKey="total"
                  workspaceId={workspaceId}
                  currentParams={resolvedSearchParams}
                  align="right"
                />
              </th>
              <th className="px-3 py-2 text-right">Amount Paid</th>
              <th className="px-3 py-2 text-right">
                <SortableHeader
                  label="Outstanding"
                  sortKey="outstanding"
                  workspaceId={workspaceId}
                  currentParams={resolvedSearchParams}
                  align="right"
                />
              </th>
              <th className="px-3 py-2 text-right">View</th>
            </tr>
          </thead>
          <tbody>
            {enrichedInvoices.map((inv) => {
              const currency = inv.currency || "USD";
              const riskBadgeClass = getRiskBadge(inv.risk as "high" | "medium" | "low" | "none");
              return (
                <tr
                  key={inv.id}
                  className="border-b border-slate-100 hover:bg-slate-50/70 transition-colors"
                >
                  <td className="px-3 py-2 font-medium text-slate-900">
                    <div className="flex items-center gap-2">
                      {inv.invoice_number ?? "—"}
                      {riskBadgeClass && (
                        <span
                          className={`inline-flex rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${riskBadgeClass}`}
                          title={`Risk: ${inv.risk}`}
                        >
                          {inv.risk === "high" ? "!" : inv.risk === "medium" ? "~" : "•"}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-slate-800">
                    {inv.client_name ?? "—"}
                  </td>
                  <td className="px-3 py-2 align-middle">
                    {(() => {
                      // Use normalized status for consistent badge styling and paid ratio
                      const status = inv.displayStatusNormalized || "sent";
                      const statusStyles: Record<string, string> = {
                        draft: "bg-slate-100 text-slate-700",
                        sent: "bg-blue-100 text-blue-700",
                        paid: "bg-emerald-100 text-emerald-700",
                        partially_paid: "bg-amber-100 text-amber-700",
                        overdue: "bg-red-100 text-red-700",
                        void: "bg-neutral-100 text-neutral-600",
                      };
                      const statusStyle = statusStyles[status] || "bg-slate-100 text-slate-700";
                      // Format status for display (replace underscore with space, capitalize)
                      const statusDisplay = status.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
                      const totalAmount = inv.total ?? 0;
                      const amountPaid = inv.totalPaid ?? Math.max(inv.total - (inv.outstanding ?? 0), 0);
                      const paidRatio = totalAmount > 0 ? Math.round((amountPaid / totalAmount) * 100) : 0;
                      return (
                        <div className="flex flex-col gap-1">
                          <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${statusStyle}`}>
                            {statusDisplay}
                          </span>
                          <span className="text-[11px] text-muted-foreground">{paidRatio}% paid</span>
                        </div>
                      );
                    })()}
                  </td>
                  <td className="px-3 py-2 text-sm text-slate-700">
                    {inv.issue_date ? new Date(inv.issue_date).toLocaleDateString() : "—"}
                  </td>
                  <td className="px-3 py-2 text-sm text-slate-700">
                    {inv.due_date ? new Date(inv.due_date).toLocaleDateString() : "—"}
                  </td>
                  <td className="px-3 py-2 text-blue-600 text-right">
                    {formatMoney(inv.total, currency)}
                  </td>
                  <td className="px-3 py-2 text-emerald-600 font-medium text-right">
                    {formatMoney(inv.totalPaid ?? Math.max(inv.total - (inv.outstanding ?? 0), 0), currency)}
                  </td>
                  <td className={`px-3 py-2 ${inv.outstanding > 0 ? "text-red-600 text-right" : "text-muted-foreground text-right"}`}>
                    {formatMoney(Math.abs(inv.outstanding), currency)}
                  </td>
                  <td className="px-3 py-2 text-right text-sm">
                    <Link
                      href={`/${workspaceId}/invoices/${inv.id}`}
                      className="text-blue-600 hover:text-blue-700"
                    >
                      Open
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
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
              No invoices match your filters
            </h3>

            {/* Subtitle */}
            <p className="mt-1 text-sm text-muted-foreground">
              Try clearing search or filters to see more invoices.
            </p>
          </div>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2 text-xs text-slate-600">
          <div>
            Page {safePage} of {totalPages} · {totalCount} invoice{totalCount !== 1 ? "s" : ""}
          </div>
          <div className="flex items-center gap-2">
            {canPrev && (
              <Link
                href={buildInvoicesUrl(workspaceId, resolvedSearchParams, { 
                  page: safePage - 1,
                })}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium hover:bg-slate-50"
              >
                Previous
              </Link>
            )}
            {canNext && (
              <Link
                href={buildInvoicesUrl(workspaceId, resolvedSearchParams, { 
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
