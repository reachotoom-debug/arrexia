import PaymentsTable from "@/components/payments/PaymentsTable";
import { requireWorkspace } from "@/lib/auth/server";
import { supabaseServer } from "@/lib/supabase/server";
import { ErrorState, EmptyState } from "@/components/ui/state";
import Link from "next/link";
import { PaymentsPreferencesGate } from "./_components/PaymentsPreferencesGate";

const PAYMENT_PAGE_SIZE = 10;

type PaymentStatusParam = "all" | "completed" | "pending" | "failed" | "refunded";
type PaymentListViewParam = "default" | "recent-first" | "largest-first" | "failed-first";
type PaymentSortKey = "paid_at" | "payment_date" | "amount" | "method" | "payment_provider" | "client_name" | "invoice_number" | "status" | "created_at";
type SortDir = "asc" | "desc";

// Type for a payment row with joined invoice and client data
type PaymentRow = {
  id: string;
  workspace_id: string;
  invoice_id: string | null;
  payment_date: string;
  amount: number;
  currency: string;
  method: string | null;
  status: string;
  transaction_id: string | null;
  notes: string | null;
  payment_provider: string | null;
  created_at: string;
  updated_at: string;
  invoice_number: string | null;
  client_name: string | null;
};

/**
 * Parse and validate payment query parameters with defaults
 * Defaults: status=all, view=default, sort=null (use view preset), dir=desc, page=1, pageSize=10, q=""
 */
function parsePaymentsQuery(searchParams: Record<string, string | string[] | undefined>): {
  page: number;
  pageSize: number;
  status: PaymentStatusParam;
  view: PaymentListViewParam;
  q: string;
  sort: PaymentSortKey | null;
  dir: SortDir;
} {
  // Extract and normalize page
  const rawPage = Array.isArray(searchParams.page) ? searchParams.page[0] : searchParams.page;
  const page = Math.max(parseInt(rawPage || "1", 10) || 1, 1);

  // Extract and normalize pageSize
  const rawPageSize = Array.isArray(searchParams.pageSize) ? searchParams.pageSize[0] : searchParams.pageSize;
  const pageSize = Math.max(parseInt(rawPageSize || String(PAYMENT_PAGE_SIZE), 10) || PAYMENT_PAGE_SIZE, 1);

  // Extract and normalize status (default: "all")
  const rawStatus = Array.isArray(searchParams.status) ? searchParams.status[0] : searchParams.status;
  const status = normalizeStatusParam(rawStatus || null);

  // Extract and normalize view (default: "default")
  const rawView = Array.isArray(searchParams.view) ? searchParams.view[0] : searchParams.view;
  const view: PaymentListViewParam = (rawView || "default") as PaymentListViewParam;

  // Extract search term (default: "")
  const rawQ = Array.isArray(searchParams.q) ? searchParams.q[0] : searchParams.q;
  const q = (rawQ || "").trim();

  // Extract and validate sort (optional - null means use view preset)
  // Allowlist sort keys for payments_view to prevent runtime errors
  // Only allow columns that exist in payments_view
  const rawSort = Array.isArray(searchParams.sort) ? searchParams.sort[0] : searchParams.sort;
  const allowedSorts: PaymentSortKey[] = ["paid_at", "payment_date", "amount", "client_name", "invoice_number", "status", "created_at"];
  const sort: PaymentSortKey | null = rawSort && allowedSorts.includes(rawSort as PaymentSortKey)
    ? (rawSort as PaymentSortKey)
    : null;

  // Extract and validate dir (default: "desc")
  const rawDir = Array.isArray(searchParams.dir) ? searchParams.dir[0] : searchParams.dir;
  const dir: SortDir = rawDir === "asc" || rawDir === "desc" ? rawDir : "desc";

  return {
    page,
    pageSize,
    status,
    view,
    q,
    sort,
    dir,
  };
}

function normalizeStatusParam(raw: string | null): PaymentStatusParam {
  if (!raw) return "all";
  const value = raw.toLowerCase() as PaymentStatusParam;
  const allowed: PaymentStatusParam[] = ["all", "completed", "pending", "failed", "refunded"];
  return allowed.includes(value) ? value : "all";
}

/**
 * Build URL for payments page with query parameters
 * Starts from current search params, applies overrides, deletes keys when value is undefined
 * Removes default values from URL: status="all", view="default", sort=null, dir="desc", page=1
 * Forces page=1 when changing anything except page itself
 */
function buildPaymentsUrl(
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

  // Start from current params (excluding page/pageSize - we'll handle them separately)
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

  // Apply overrides - undefined means delete the param, null for sort means remove it
  Object.entries(overrides).forEach(([key, value]) => {
    if (value === undefined || value === null) {
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
  // status="all" -> remove
  if (urlParams.get("status") === "all") {
    urlParams.delete("status");
  }
  // view="default" -> remove
  if (urlParams.get("view") === "default") {
    urlParams.delete("view");
  }
  // dir="desc" without sort -> remove (default dir)
  if (urlParams.get("dir") === "desc" && !urlParams.get("sort")) {
    urlParams.delete("dir");
  }
  // page=1 -> remove (default page)
  if (urlParams.get("page") === "1") {
    urlParams.delete("page");
  }

  const queryString = urlParams.toString();
  return `/${workspaceId}/payments${queryString ? `?${queryString}` : ""}`;
}

function sortLabel(sort: PaymentSortKey | null): string {
  if (!sort) return "Default sort";
  switch (sort) {
    case "payment_date":
      return "Date";
    case "client_name":
      return "Client";
    case "invoice_number":
      return "Invoice #";
    case "amount":
      return "Amount";
    case "method":
      return "Method";
    case "payment_provider":
      return "Provider";
    default:
      return "Default sort";
  }
}

function sortArrow(dir: SortDir): "↑" | "↓" {
  return dir === "asc" ? "↑" : "↓";
}

interface PaymentsPageProps {
  params: Promise<{ workspaceId: string }>;
  searchParams: Promise<{
    [key: string]: string | string[] | undefined;
  }>;
}

async function loadPayments(
  workspaceId: string,
  searchParams: Record<string, string | string[] | undefined>
): Promise<{
  payments: PaymentRow[];
  totalCount: number;
  page: number;
  pageSize: number;
  view: PaymentListViewParam;
  status: PaymentStatusParam;
  sort: PaymentSortKey | null;
  dir: SortDir;
  q: string;
}> {
  const supabase = await supabaseServer();

  // Parse query parameters with defaults
  const { page, pageSize, status, view, q, sort, dir } = parsePaymentsQuery(searchParams);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  // Debug log (dev only)
  if (process.env.NODE_ENV === "development") {
    console.log("[PaymentsPage] Query params:", {
      received: searchParams,
      parsed: { page, pageSize, status, view, q, sort, dir },
      range: { from, to },
    });
  }

  // Build base query using payments_view (includes client_name, invoice_number, is_failed, paid_at)
  // This enables server-side sorting/searching across all pages
  let query = supabase
    .from("payments_view")
    .select(
      `
      id,
      workspace_id,
      invoice_id,
      payment_date,
      amount,
      currency,
      method,
      status,
      transaction_id,
      notes,
      payment_provider,
      created_at,
      updated_at,
      invoice_number,
      client_name,
      is_failed,
      paid_at
    `,
      { count: "exact" }
    )
    .eq("workspace_id", workspaceId);

  // Build count query with same filters (for accurate total count)
  // Use head:true to get count without data, ensuring consistency
  let countQuery = supabase
    .from("payments_view")
    .select("*", { count: "exact", head: true })
    .eq("workspace_id", workspaceId);

  // Apply status filter (server-side)
  if (status !== "all") {
    query = query.eq("status", status);
    countQuery = countQuery.eq("status", status);
  }

  // Apply search filter (server-side) - search across client_name, invoice_number, transaction_id (reference), notes
  if (q) {
    // Escape special characters in search term for PostgREST ILIKE
    const escapedQ = q.replace(/%/g, "\\%").replace(/_/g, "\\_");
    const searchPattern = `%${escapedQ}%`;
    // Use PostgREST or() syntax for multiple ILIKE conditions
    // payments_view includes client_name and invoice_number as direct columns, so we can search them
    const searchFilter = `client_name.ilike.${searchPattern},invoice_number.ilike.${searchPattern},transaction_id.ilike.${searchPattern},notes.ilike.${searchPattern}`;
    query = query.or(searchFilter);
    countQuery = countQuery.or(searchFilter);
  }

  // Apply view-specific ordering and filtering
  // If sort is explicitly set, use that; otherwise use view preset
  if (sort) {
    // User-specified sort - all columns are now available in payments_view
    // Map "payment_date" to "paid_at" for consistent sorting (paid_at is the raw payment_date for sorting)
    // Note: payment_date in view is COALESCE(payment_date, created_at::date) for display
    //       paid_at in view is p.payment_date (can be null) for sorting
    const sortColumn = sort === "payment_date" ? "paid_at" : sort;
    query = query.order(sortColumn, { ascending: dir === "asc", nullsFirst: false });
    // Add stable secondary sort by id
    query = query.order("id", { ascending: true });
  } else {
    // Apply view-specific ordering
    switch (view) {
      case "recent-first": {
        // Order by paid_at (payment_date or created_at) descending
        query = query.order("paid_at", { ascending: false, nullsFirst: false });
        query = query.order("id", { ascending: true }); // Stable secondary sort
        break;
      }

      case "largest-first": {
        // Order by amount descending, then paid_at descending
        query = query.order("amount", { ascending: false, nullsFirst: false });
        query = query.order("paid_at", { ascending: false, nullsFirst: false });
        query = query.order("id", { ascending: true }); // Stable secondary sort
        break;
      }

      case "failed-first": {
        // Order by is_failed descending (failed=true first), then paid_at descending (most recent first)
        query = query.order("is_failed", { ascending: false, nullsFirst: false });
        query = query.order("paid_at", { ascending: false, nullsFirst: false });
        query = query.order("id", { ascending: true }); // Stable secondary sort
        break;
      }

      case "default":
      default: {
        // Default sort by paid_at descending (payment_date or created_at)
        query = query.order("paid_at", { ascending: false, nullsFirst: false });
        query = query.order("id", { ascending: true }); // Stable secondary sort
        break;
      }
    }
  }

  // Apply pagination (AFTER all filtering, search, and ordering)
  // IMPORTANT: All filtering (.eq, .or), search (.or with ilike), and ordering (.order)
  // must happen BEFORE .range() to ensure sorting/search/filtering apply across ALL pages
  const { data: paymentsFromDb, error } = await query.range(from, to);
  
  // Get count with same filters (but no ordering/pagination)
  const { count, error: countError } = await countQuery;
  
  // If count query fails, log but don't fail the whole request
  if (countError) {
    console.error("[PaymentsPage] count query failed:", {
      code: countError.code,
      message: countError.message,
    });
  }

  // Debug log (dev only)
  if (process.env.NODE_ENV === "development") {
    console.log("[PaymentsPage] Query result:", {
      count: typeof count === "number" ? count : 0,
      rowsReturned: paymentsFromDb?.length || 0,
      page,
      pageSize,
      totalPages: Math.ceil((typeof count === "number" ? count : 0) / pageSize),
    });
  }

  // Error handling - structured logging like invoices
  if (error) {
    // Log raw error object and JSON for debugging
    console.error("[PaymentsPage] RAW error object:", error);
    console.error("[PaymentsPage] error JSON:", JSON.stringify(error, null, 2));

    const errorDetails = {
      message: error.message || "Unknown error",
      code: error.code || null,
      details: (error as any).details || null,
      hint: (error as any).hint || null,
    };

    const selectString = "id, workspace_id, invoice_id, payment_date, amount, currency, method, status, transaction_id, notes, payment_provider, created_at, updated_at, invoice_number, client_name, is_failed, paid_at";

    console.error("[PaymentsPage] failed to load payments (Supabase error)", {
      code: errorDetails.code ?? (error as any)?.code ?? null,
      message: errorDetails.message ?? error?.message ?? "Unknown error",
      details: errorDetails.details ?? (error as any)?.details ?? null,
      hint: errorDetails.hint ?? (error as any)?.hint ?? null,
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
      },
    });

    throw error;
  }

  // Map DB result into PaymentRow shape
  // payments_view already includes client_name and invoice_number as direct columns
  const mappedPayments: PaymentRow[] = (paymentsFromDb ?? []).map((payment: any) => {
    return {
      id: payment.id,
      workspace_id: payment.workspace_id,
      invoice_id: payment.invoice_id,
      payment_date: payment.payment_date || payment.created_at,
      amount: Number(payment.amount ?? 0),
      currency: payment.currency || "USD",
      method: payment.method,
      status: payment.status,
      transaction_id: payment.transaction_id,
      notes: payment.notes,
      payment_provider: payment.payment_provider,
      created_at: payment.created_at,
      updated_at: payment.updated_at,
      invoice_number: payment.invoice_number || null,
      client_name: payment.client_name || null,
    };
  });

  // No client-side sorting/filtering needed - all operations are server-side via payments_view

  return {
    payments: mappedPayments,
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

export default async function PaymentsPage({ params, searchParams }: PaymentsPageProps) {
  const { workspaceId } = await params;
  const { workspace } = await requireWorkspace(workspaceId);
  const resolvedSearchParams = await searchParams;
  const supabase = await supabaseServer();

  // Load payments using the refactored function
  let paymentData;
  try {
    paymentData = await loadPayments(workspaceId, resolvedSearchParams);
  } catch (error) {
    return (
      <>
        <PaymentsPreferencesGate
          workspaceId={workspaceId}
          searchParams={resolvedSearchParams}
        />
        <div className="max-w-5xl mx-auto py-6">
          <div className="p-8">
            <ErrorState
              title="Could not load payments"
              message="Please refresh the page or try again later."
            />
          </div>
        </div>
      </>
    );
  }

  const { payments, totalCount, page, pageSize, view: viewParam, status: statusParam, sort, dir, q: searchTerm } = paymentData;
  const paymentRows = payments ?? [];

  // Show empty state if no payments
  if (paymentRows.length === 0 && totalCount === 0) {
    return (
      <>
        <PaymentsPreferencesGate
          workspaceId={workspaceId}
          searchParams={resolvedSearchParams}
        />
        <div className="max-w-5xl mx-auto py-6 space-y-6">
          {/* Header */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-xl font-semibold text-slate-900">Payments</h1>
              <p className="text-sm text-slate-500">
                Track and manage all payments for this organization.
              </p>
            </div>
            <Link
              href={`/${workspaceId}/payments/new`}
              className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700"
            >
              Record Payment
            </Link>
          </div>
          <div className="p-8">
            <EmptyState
              title="No payments recorded"
              message="Record a payment against an invoice to see it here."
            />
          </div>
        </div>
      </>
    );
  }

  // Calculate total pages
  const totalPages = Math.max(Math.ceil(totalCount / pageSize), 1);
  const safePage = Math.min(page, totalPages);

  return (
    <>
      <PaymentsPreferencesGate
        workspaceId={workspaceId}
        searchParams={resolvedSearchParams}
      />
      <div className="max-w-5xl mx-auto py-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">Payments</h1>
            <p className="text-sm text-slate-500">
              Track and manage all payments for this organization.
            </p>
          </div>
          <Link
            href={`/${workspaceId}/payments/new`}
            className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700"
          >
            Record Payment
          </Link>
        </div>

        {/* Table */}
        <PaymentsTable
          rows={paymentRows}
          workspaceId={workspaceId}
          searchParams={resolvedSearchParams}
          currentPage={safePage}
          totalPages={totalPages}
          totalCount={totalCount}
          view={viewParam}
          status={statusParam}
          sort={sort}
          dir={dir}
          q={searchTerm}
        />
      </div>
    </>
  );
}
