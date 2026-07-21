import PaymentsTable from "@/components/payments/PaymentsTable";
import { requireWorkspace } from "@/lib/auth/server";
import { supabaseServer } from "@/lib/supabase/server";
import { createRoutePerf, perfTime } from "@/lib/perf/server";
import { ErrorState, EmptyState } from "@/components/ui/state";
import Link from "next/link";
import { PaymentsPreferencesGate } from "./_components/PaymentsPreferencesGate";
import { PaymentsSearchInput } from "./_components/PaymentsSearchInput";
import {
  PaymentsFilterLinks,
  PAYMENTS_SORT_PRESET_LABELS,
  PAYMENTS_STATUS_LABELS,
} from "./_components/PaymentsFilterLinks";
import { ExportCsvButton } from "../_components/ExportCsvButton";
import { unstable_noStore as noStore } from "next/cache";
import {
  CommandBar,
  CommandBarControls,
  CommandBarSearch,
} from "@/components/layout/CommandBar";
import { PageHeader } from "@/components/layout/PageHeader";
import { CommandBarFilters } from "@/components/layout/CommandBarFilters";
import { ResetFiltersButton } from "@/components/shared/reset-filters-button";
import { primaryCtaClass } from "@/components/ui/cta-styles";
import type {
  PaymentListViewParam,
  PaymentSortKey,
  PaymentStatusParam,
  SortDir,
} from "./_lib/buildPaymentsUrl";

const PAYMENT_PAGE_SIZE = 10;

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
  archived_at: string | null;
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
  const allowed: PaymentStatusParam[] = ["all", "completed", "pending", "failed", "refunded", "archived"];
  return allowed.includes(value) ? value : "all";
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
  anyPaymentsCount: number;
  page: number;
  pageSize: number;
  view: PaymentListViewParam;
  status: PaymentStatusParam;
  sort: PaymentSortKey | null;
  dir: SortDir;
  q: string;
}> {
  const supabase = await supabaseServer();
  
  // Get workspace payment existence count (for empty state logic)
  // Query base payments table to check if ANY payments exist in workspace
  const { count: anyPaymentsCount } = await perfTime(
    "payments-list",
    "anyPaymentsCount",
    async () =>
      supabase
        .from("payments")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", workspaceId),
    (result) => `count=${result.count ?? 0}`
  );
  
  const workspacePaymentCount = typeof anyPaymentsCount === "number" ? anyPaymentsCount : 0;

  // Parse query parameters with defaults
  const { page, pageSize, status, view, q, sort, dir } = parsePaymentsQuery(searchParams);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  // ============================================================================
  // DATA SOURCE SELECTION (Active vs Archived)
  // ============================================================================
  // payments_view is active-only (WHERE archived_at IS NULL) - use for active tabs
  // Archived tab must query base payments table with nested selects for invoice/client data
  // ============================================================================
  const isArchivedFilter = status === "archived";
  
  let query;
  let countQuery;
  
  if (isArchivedFilter) {
    // ========================================================================
    // ARCHIVED TAB: Query base payments table with nested selects
    // ========================================================================
    query = supabase
      .from("payments")
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
        archived_at,
        invoices(invoice_number, client_id, clients(name))
      `,
        { count: "exact" }
      )
      .eq("workspace_id", workspaceId)
      .not("archived_at", "is", null);

    countQuery = supabase
      .from("payments")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .not("archived_at", "is", null);
  } else {
    // ========================================================================
    // ACTIVE TABS: Query payments_view (includes joined columns)
    // ========================================================================
    query = supabase
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
        archived_at,
        invoice_number,
        client_name,
        is_failed,
        paid_at
      `,
        { count: "exact" }
      )
      .eq("workspace_id", workspaceId);

    countQuery = supabase
      .from("payments_view")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId);
  }

  // ============================================================================
  // HARDENED PAYMENT STATUS FILTER RULES (Archive Behavior)
  // ============================================================================
  // Rule 1: status=all → archived_at IS NULL (use payments_view, no status filter)
  // Rule 2: status=archived → archived_at IS NOT NULL (use base payments table, NO status filter)
  // Rule 3: status=completed/pending/failed/refunded → archived_at IS NULL AND payments.status = selected status
  //         (use payments_view with status filter)
  //
  // CRITICAL: Archived payments MUST NEVER leak into non-archived filters
  // ============================================================================
  
  
  if (!isArchivedFilter) {
    // ========================================================================
    // ACTIVE TABS: status === "all" | "completed" | "pending" | "failed" | "refunded"
    // ========================================================================
    // payments_view already excludes archived (WHERE archived_at IS NULL at SQL level)
    // No need to filter archived_at explicitly - view contract handles it
    
    if (status === "all") {
      // Rule 1: status=all → no status filter (payments_view already excludes archived)
    } else {
      // Rule 3: status=completed/pending/failed/refunded → apply status filter
      const validActiveStatuses: PaymentStatusParam[] = ["completed", "pending", "failed", "refunded"];
      if (validActiveStatuses.includes(status)) {
        query = query.eq("status", status);  // ✅ Apply status filter
        countQuery = countQuery.eq("status", status);  // ✅ Apply status filter to count
      }
    }
  }
  // Archived tab: No status filter needed - shows all archived payments regardless of status

  // Apply search filter (server-side)
  if (q) {
    // Escape special characters in search term for PostgREST ILIKE
    const escapedQ = q.replace(/%/g, "\\%").replace(/_/g, "\\_");
    const searchPattern = `%${escapedQ}%`;
    
    if (isArchivedFilter) {
      // Archived tab: Search only base columns (transaction_id, notes)
      // Note: Can't search nested invoice/client fields with ILIKE in PostgREST easily
      const searchFilter = `transaction_id.ilike.${searchPattern},notes.ilike.${searchPattern}`;
      query = query.or(searchFilter);
      countQuery = countQuery.or(searchFilter);
    } else {
      // Active tabs: Search across client_name, invoice_number, transaction_id, notes
      // payments_view includes client_name and invoice_number as direct columns
      const searchFilter = `client_name.ilike.${searchPattern},invoice_number.ilike.${searchPattern},transaction_id.ilike.${searchPattern},notes.ilike.${searchPattern}`;
      query = query.or(searchFilter);
      countQuery = countQuery.or(searchFilter);
    }
  }

  // Apply ordering (AFTER all filtering)
  if (isArchivedFilter) {
    // ========================================================================
    // ARCHIVED TAB ORDERING: Use base table columns (payment_date, created_at)
    // ========================================================================
    if (sort) {
      // User-specified sort - map to base table columns
      // For archived tab, use payment_date/created_at instead of paid_at (computed column doesn't exist)
      if (sort === "paid_at" || sort === "payment_date") {
        // Sort by payment_date, fallback to created_at via COALESCE not available, so use payment_date with nulls last
        query = query.order("payment_date", { ascending: dir === "asc", nullsFirst: false });
        query = query.order("created_at", { ascending: dir === "asc", nullsFirst: false });
      } else {
        // Other columns (amount, method, status, etc.) are available in base table
        query = query.order(sort, { ascending: dir === "asc", nullsFirst: false });
      }
      query = query.order("id", { ascending: true }); // Stable secondary sort
    } else {
      // Apply view-specific ordering (use base columns)
      switch (view) {
        case "recent-first": {
          // Order by payment_date descending, fallback to created_at
          query = query.order("payment_date", { ascending: false, nullsFirst: false });
          query = query.order("created_at", { ascending: false, nullsFirst: false });
          query = query.order("id", { ascending: true }); // Stable secondary sort
          break;
        }
        case "largest-first": {
          // Order by amount descending, then payment_date descending
          query = query.order("amount", { ascending: false, nullsFirst: false });
          query = query.order("payment_date", { ascending: false, nullsFirst: false });
          query = query.order("id", { ascending: true }); // Stable secondary sort
          break;
        }
        case "failed-first": {
          // Archived tab: is_failed column not available, so just sort by payment_date descending
          // (failed-first view is primarily for active tabs where is_failed is available)
          query = query.order("payment_date", { ascending: false, nullsFirst: false });
          query = query.order("created_at", { ascending: false, nullsFirst: false });
          query = query.order("id", { ascending: true }); // Stable secondary sort
          break;
        }
        case "default":
        default: {
          // Default sort: payment_date DESC, then created_at DESC, then id DESC
          query = query.order("payment_date", { ascending: false, nullsFirst: false });
          query = query.order("created_at", { ascending: false, nullsFirst: false });
          query = query.order("id", { ascending: false });
          break;
        }
      }
    }
  } else {
    // ========================================================================
    // ACTIVE TABS ORDERING: Use payments_view columns (paid_at, is_failed, etc.)
    // ========================================================================
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
          // Default sort: payment_date DESC, then created_at DESC, then id DESC
          query = query.order("payment_date", { ascending: false, nullsFirst: false });
          query = query.order("created_at", { ascending: false, nullsFirst: false });
          query = query.order("id", { ascending: false });
          break;
        }
      }
    }
  }

  // Apply pagination (AFTER all filtering, search, and ordering)
  // IMPORTANT: All filtering (.eq, .or), search (.or with ilike), and ordering (.order)
  // must happen BEFORE .range() to ensure sorting/search/filtering apply across ALL pages
  const { data: paymentsFromDb, error } = await perfTime(
    "payments-list",
    "paymentRows",
    async () => query.range(from, to),
    (result) => `rows=${result.data?.length ?? 0}`
  );
  
  // Get count with same filters (but no ordering/pagination)
  const { count, error: countError } = await perfTime(
    "payments-list",
    "filteredCount",
    async () => countQuery,
    (result) => `count=${result.count ?? 0}`
  );
  
  // If count query fails, log but don't fail the whole request
  if (countError) {
    if (process.env.NODE_ENV === "development") {
      console.error("[PaymentsPage] count query failed:", countError.message);
    }
  }

  // Error handling
  if (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("[PaymentsPage] failed to load payments:", error.message);
    }
    throw error;
  }

  // Map DB result into PaymentRow shape
  const mappedPayments: PaymentRow[] = (paymentsFromDb ?? []).map((payment: any) => {
    // Extract invoice_number and client_name based on data source
    let invoice_number: string | null = null;
    let client_name: string | null = null;
    
    if (isArchivedFilter) {
      // Archived tab: Extract from nested invoices relation
      invoice_number = payment.invoices?.invoice_number ?? null;
      client_name = payment.invoices?.clients?.name ?? null;
    } else {
      // Active tabs: Use direct columns from payments_view
      invoice_number = payment.invoice_number ?? null;
      client_name = payment.client_name ?? null;
    }
    
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
      archived_at: payment.archived_at || null,
      invoice_number,
      client_name,
    };
  });

  // No client-side sorting/filtering needed - all operations are server-side via payments_view

  return {
    payments: mappedPayments,
    totalCount: typeof count === "number" ? count : 0,
    anyPaymentsCount: workspacePaymentCount,
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
  noStore();
  const perf = createRoutePerf("payments-list");
  const { workspaceId } = await params;
  await perf.time("requireWorkspace", () => requireWorkspace(workspaceId));
  const resolvedSearchParams = await searchParams;
  const supabase = await supabaseServer();

  // Load payments using the refactored function
  let paymentData;
  try {
    paymentData = await perf.time("loadPayments", () =>
      loadPayments(workspaceId, resolvedSearchParams)
    );
  } catch (error) {
    perf.finish({ status: "error" });
    return (
      <>
        <PaymentsPreferencesGate
          workspaceId={workspaceId}
          searchParams={resolvedSearchParams}
        />
        <div className="w-full min-w-0">
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

  const { payments, totalCount, anyPaymentsCount, page, pageSize, view: viewParam, status: statusParam, sort, dir, q: searchTerm } = paymentData;
  const paymentRows = payments ?? [];

  // Calculate total pages
  const totalPages = Math.max(Math.ceil(totalCount / pageSize), 1);
  const safePage = Math.min(page, totalPages);

  const paymentsFilterSummaryParts: string[] = [];
  if (viewParam !== "default") {
    paymentsFilterSummaryParts.push(
      PAYMENTS_SORT_PRESET_LABELS.find((p) => p.key === viewParam)?.label ??
        viewParam
    );
  }
  if (statusParam !== "all") {
    paymentsFilterSummaryParts.push(
      PAYMENTS_STATUS_LABELS.find((s) => s.key === statusParam)?.label ??
        statusParam
    );
  }
  if (sort) {
    paymentsFilterSummaryParts.push(`${sortLabel(sort)} ${sortArrow(dir)}`);
  }
  const paymentsFilterSummary =
    paymentsFilterSummaryParts.length > 0
      ? paymentsFilterSummaryParts.join(" · ")
      : undefined;
  const activeFilterCount =
    Number(viewParam !== "default") +
    Number(statusParam !== "all") +
    Number(Boolean(sort));

  // Show empty state ONLY when workspace has no payments at all
  // If workspace has payments but filters return empty, let PaymentsTable render filters + empty state
  if (anyPaymentsCount === 0) {
    perf.finish({ anyPaymentsCount: 0 });
    return (
      <>
        <PaymentsPreferencesGate
          workspaceId={workspaceId}
          searchParams={resolvedSearchParams}
        />
        <div className="w-full min-w-0 space-y-4 md:space-y-6">
          <CommandBar>
            <PageHeader
              title="Payments"
              description="Track and manage all payments for this organization."
              primaryAction={
                <Link href={`/${workspaceId}/payments/new`} className={primaryCtaClass}>
                  Record Payment
                </Link>
              }
            />
          </CommandBar>
          <div className="p-8">
            <EmptyState
              title="No payments recorded"
              message="Record a payment against an invoice to see it here."
              actionLabel="Record payment"
              actionHref={`/${workspaceId}/payments/new`}
            />
          </div>
        </div>
      </>
    );
  }

  perf.finish({ rows: paymentRows.length, totalCount });

  return (
    <>
      <PaymentsPreferencesGate
        workspaceId={workspaceId}
        searchParams={resolvedSearchParams}
      />
      <div className="w-full min-w-0 space-y-4 md:space-y-6">
        <CommandBar>
          <PageHeader
            title="Payments"
            description="Track and manage all payments for this organization."
            primaryAction={
              <Link href={`/${workspaceId}/payments/new`} className={primaryCtaClass}>
                Record Payment
              </Link>
            }
            headerTrailing={<ExportCsvButton workspaceId={workspaceId} module="payments" />}
          />
          <CommandBarSearch>
            <PaymentsSearchInput
              workspaceId={workspaceId}
              initialQ={searchTerm}
            />
          </CommandBarSearch>
          <CommandBarControls
            filters={
              <CommandBarFilters
                summary={paymentsFilterSummary}
                activeCount={activeFilterCount}
                clearAllHref={`/${workspaceId}/payments`}
              >
                <PaymentsFilterLinks
                  workspaceId={workspaceId}
                  searchParams={resolvedSearchParams}
                  view={viewParam}
                  status={statusParam}
                  columnSort={sort}
                />
              </CommandBarFilters>
            }
            filterAdjacentActions={
              <ResetFiltersButton basePath={`/${workspaceId}/payments`} />
            }
          />
        </CommandBar>

        <PaymentsTable
          rows={paymentRows}
          workspaceId={workspaceId}
          searchParams={resolvedSearchParams}
          currentPage={safePage}
          totalPages={totalPages}
          totalCount={totalCount}
          anyPaymentsCount={anyPaymentsCount}
          view={viewParam}
          status={statusParam}
          sort={sort === "status" || sort === "created_at" || sort === "paid_at" ? null : (sort as "payment_date" | "amount" | "method" | "payment_provider" | "client_name" | "invoice_number" | null) || null}
          dir={dir}
          q={searchTerm}
        />
      </div>
    </>
  );
}
