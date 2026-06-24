import { SupabaseClient } from "@supabase/supabase-js";

export type PaymentSort = "default" | "recentFirst" | "largestFirst" | "failedFirst";
export type PaymentStatus = "all" | "completed" | "pending" | "failed" | "refunded" | "archived";

export interface PaymentsQueryState {
  sort: PaymentSort;
  status: PaymentStatus;
  search: string;
  page: number;
  pageSize: number;
}

export interface PaymentRow {
  id: string;
  workspace_id: string;
  invoice_id: string | null;
  payment_date: string | null;
  amount: number;
  currency: string;
  method: string | null;
  status: string;
  transaction_id: string | null;
  notes: string | null;
  payment_provider: string | null;
  created_at: string;
  updated_at: string;
}

export interface GetPaymentsResult {
  payments: PaymentRow[];
  totalCount: number;
}

export async function getPayments(
  supabase: SupabaseClient,
  workspaceId: string,
  state: PaymentsQueryState
): Promise<GetPaymentsResult> {
  const { sort, status, search, page, pageSize } = state;

  // AR-Professional Archive Behavior:
  // - All active tabs (All/Completed/Pending/Failed/Refunded) MUST exclude archived payments
  // - Archived tab shows payments where archived_at IS NOT NULL
  // - Archived payments must NOT affect invoice paid totals or outstanding calculations
  const isArchivedFilter = status === "archived";
  
  let query;
  if (isArchivedFilter) {
    // Archived tab: Query base table with archived_at IS NOT NULL
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
        updated_at
      `,
        { count: "exact" }
      )
      .eq("workspace_id", workspaceId)
      .not("archived_at", "is", null);
  } else {
    // Active tabs: Query base table with archived_at IS NULL
    // ✅ CRITICAL: Exclude archived payments (p.archived_at IS NULL)
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
        updated_at
      `,
        { count: "exact" }
      )
      .eq("workspace_id", workspaceId)
      .is("archived_at", null);  // ✅ CRITICAL: Exclude archived payments for financial integrity
  }

  // Apply status filter (only for non-archived)
  if (!isArchivedFilter && status !== "all") {
    query = query.eq("status", status);
  }

  // Apply sorting
  switch (sort) {
    case "recentFirst":
      // Order by payment_date DESC, fallback to created_at DESC
      query = query.order("payment_date", { ascending: false, nullsFirst: false });
      break;
    case "largestFirst":
      // Order by amount DESC, then by created_at DESC
      query = query.order("amount", { ascending: false });
      query = query.order("created_at", { ascending: false });
      break;
    case "failedFirst":
      // For failedFirst, we'll sort in-memory after fetching
      // For now, order by created_at DESC as base
      query = query.order("created_at", { ascending: false });
      break;
    case "default":
    default:
      // Default sort: created_at DESC
      query = query.order("created_at", { ascending: false });
      break;
  }

  // Note: We don't apply pagination here because search is applied in-memory
  // The caller will handle pagination after applying search filter
  // Fetch all matching payments (pagination will be applied in page.tsx after search)
  
  const { data, error, count } = await query;

  if (error) {
    throw error;
  }

  const payments = (data ?? []) as PaymentRow[];

  // Apply "failedFirst" sorting in-memory if needed
  let sortedPayments = payments;
  if (sort === "failedFirst") {
    sortedPayments = [...payments].sort((a, b) => {
      const aIsFailed = a.status === "failed" ? 1 : 0;
      const bIsFailed = b.status === "failed" ? 1 : 0;
      if (aIsFailed !== bIsFailed) {
        return bIsFailed - aIsFailed; // Failed first (1 before 0)
      }
      // If both same failed status, sort by created_at descending
      const aDate = a.created_at ? new Date(a.created_at).getTime() : 0;
      const bDate = b.created_at ? new Date(b.created_at).getTime() : 0;
      return bDate - aDate;
    });
  }

  return {
    payments: sortedPayments,
    totalCount: count ?? 0,
  };
}

