import { requireUser } from "@/lib/auth/server";
import { requireWorkspace } from "@/lib/auth/server";
import { supabaseServer } from "@/lib/supabase/server";
import { RemindersTabs } from "./_components/RemindersTabs";
import { RemindersSearchInput } from "./_components/RemindersSearchInput";
import { SuggestedRemindersTable } from "./_components/SuggestedRemindersTable";
import { ReminderNotesCell } from "./_components/ReminderNotesCell";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { PaginationBar } from "@/components/PaginationBar";
import { EmptyState } from "@/components/ui/state";
import Link from "next/link";
import { HorizontalScrollArea } from "@/components/table/HorizontalScrollArea";
import { DataTableShell } from "@/components/layout/DataTableShell";
import {
  TABLE_BASE,
  TABLE_CELL_TEXT_COL,
  TABLE_MIN_WIDTH_INNER,
  TABLE_ROW,
  TABLE_TD,
  TABLE_TH,
} from "@/components/table/tableShell";
import {
  CommandBar,
  CommandBarControls,
  CommandBarSearch,
} from "@/components/layout/CommandBar";
import { PageHeader } from "@/components/layout/PageHeader";
import { CommandBarFilters } from "@/components/layout/CommandBarFilters";
import { ResetFiltersButton } from "@/components/shared/reset-filters-button";

// Simple date helpers (no date-fns dependency)
function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function differenceInCalendarDays(dateLeft: Date, dateRight: Date): number {
  const msPerDay = 1000 * 60 * 60 * 24;
  const left = startOfDay(dateLeft);
  const right = startOfDay(dateRight);
  return Math.round((left.getTime() - right.getTime()) / msPerDay);
}

function startOfMonth(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), 1);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfMonth(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  d.setHours(23, 59, 59, 999);
  return d;
}

function startOfNextMonth(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth() + 1, 1);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfNextMonth(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth() + 2, 0);
  d.setHours(23, 59, 59, 999);
  return d;
}

type RemindersPageProps = {
  params: Promise<{ workspaceId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type SuggestedRow = {
  id: string;
  invoice_number: string | null;
  status: string | null;
  due_date: string | null;
  outstanding: number | null; // From invoices_view.outstanding
  currency: string | null;
  client: {
    id: string;
    name: string | null;
    email: string | null;
  } | null;
  days_from_due: number | null;
  days_overdue: number; // For filtering (positive = overdue, negative = due in future)
  tag: string;
  is_overdue: boolean;
  client_name: string | null;
  client_email: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export default async function RemindersPage({
  params,
  searchParams,
}: RemindersPageProps) {
  const { workspaceId } = await params;
  const { workspace } = await requireWorkspace(workspaceId);

  const supabase = await supabaseServer();
  const resolvedSearchParams = (await searchParams) || {};

  // Read query params with effective defaults
  const effectiveView =
    (Array.isArray(resolvedSearchParams.view)
      ? resolvedSearchParams.view[0]
      : resolvedSearchParams.view) || "default";
  const effectiveStatus =
    (Array.isArray(resolvedSearchParams.status)
      ? resolvedSearchParams.status[0]
      : resolvedSearchParams.status) || "all";
  
  // Keep view and statusFilter for filter logic (backwards compatibility)
  const view = effectiveView;
  const statusFilter = effectiveStatus;
  const searchQuery = (
    (Array.isArray(resolvedSearchParams.search)
      ? resolvedSearchParams.search[0]
      : resolvedSearchParams.search) || ""
  ).trim();
  const page = Math.max(
    parseInt(
      (Array.isArray(resolvedSearchParams.page)
        ? resolvedSearchParams.page[0]
        : resolvedSearchParams.page) || "1",
      10
    ),
    1
  );
  const pageSize = 10;
  const historyPage = Math.max(
    parseInt(
      (Array.isArray(resolvedSearchParams.historyPage)
        ? resolvedSearchParams.historyPage[0]
        : resolvedSearchParams.historyPage) || "1",
      10
    ),
    1
  );
  const historyPageSize = 10;
  
  // Read sort params
  const sortParam = (Array.isArray(resolvedSearchParams.sort)
    ? resolvedSearchParams.sort[0]
    : resolvedSearchParams.sort) || undefined;
  const sortDir = (Array.isArray(resolvedSearchParams.dir)
    ? resolvedSearchParams.dir[0]
    : resolvedSearchParams.dir) as "asc" | "desc" | undefined;

  // Load suggested reminders (invoices with outstanding amounts)
  // CONSISTENCY: Match Collections/invoices logic - use is_overdue and overdue_days from view
  // Reminders eligibility: only invoices with outstanding > 0 and not archived
  // This uses invoices_view as the single source of truth.
  // client_name is available directly from invoices_view, client_email via clients relation
  let baseQuery = supabase
    .from("invoices_view")
    .select(
      `
        id,
        invoice_number,
        display_status,
        due_date,
        currency,
        outstanding,
        client_id,
        client_name,
        client_is_active,
        client_archived_at,
        is_overdue,
        overdue_days,
        clients (
          id,
          email
        )
      `
    )
    .eq("workspace_id", workspaceId)
    .is("archived_at", null)
    .gt("outstanding", 0)
    .not("due_date", "is", null)
    // Reminders eligibility: clients must be active AND not archived
    .eq("client_is_active", true)
    .is("client_archived_at", null);

  // CONSISTENCY: For default/overdue view, match Collections exactly (is_overdue = true)
  // For other views (due_7, due_14, etc.), include upcoming invoices too
  if (view === "default" || view === "overdue") {
    baseQuery = baseQuery.eq("is_overdue", true);
  }

  const { data, error } = await baseQuery;

  // Load reminder history from reminders table
  // Default newest-first by created_at
  const { data: reminderRows, error: reminderRowsError } = await supabase
    .from("reminders")
    .select(
      `
      id,
      status,
      type,
      channel,
      subject,
      body,
      created_at,
      scheduled_at,
      sent_at,
      last_error,
      error_message,
      invoice:invoices (
        id,
        invoice_number,
        due_date,
        amount,
        status
      ),
      client:clients (
        id,
        name,
        email,
        whatsapp
      )
    `
    )
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false, nullsFirst: false })
    .order("updated_at", { ascending: false, nullsFirst: false })
    .limit(50);

  if (error) {
    console.error("[RemindersPage] invoices load error", {
      message: (error as any)?.message,
      code: (error as any)?.code,
      details: (error as any)?.details,
      hint: (error as any)?.hint,
    });
  }

  if (reminderRowsError) {
    console.error("[RemindersPage] history load error", {
      raw: reminderRowsError,
      message: reminderRowsError.message,
      code: reminderRowsError.code,
      details: (reminderRowsError as any)?.details,
      hint: (reminderRowsError as any)?.hint,
    });

    throw reminderRowsError;
  }

  const safeHistory = reminderRows ?? [];
  const suggestedInvoiceIds = (data ?? []).map((inv: any) => inv.id).filter(Boolean);
  const invoiceMetaById = new Map<string, { created_at: string | null; updated_at: string | null }>();

  if (suggestedInvoiceIds.length > 0) {
    const { data: invoiceMetaRows } = await supabase
      .from("invoices")
      .select("id, created_at, updated_at")
      .eq("workspace_id", workspaceId)
      .in("id", suggestedInvoiceIds);

    for (const row of invoiceMetaRows ?? []) {
      invoiceMetaById.set(row.id, {
        created_at: row.created_at ?? null,
        updated_at: row.updated_at ?? null,
      });
    }
  }

  const today = startOfDay(new Date());

  // Transform data to SuggestedRow format
  // CONSISTENCY: Use overdue_days from invoices_view instead of calculating in JS
  const suggestedReminders: SuggestedRow[] = (data ?? []).map((inv: any) => {
    const dueStr = inv.due_date as string | null;
    const overdueDays = inv.overdue_days ?? 0;
    const isOverdue = inv.is_overdue ?? false;
    
    // Calculate days from due for upcoming invoices (negative = days until due)
    let daysFromDue: number | null = null;
    let tag = "";
    
    if (dueStr) {
      const due = startOfDay(new Date(dueStr));
      const diff = differenceInCalendarDays(today, due);
      daysFromDue = diff;

      if (isOverdue && overdueDays > 0) {
        // Overdue: use overdue_days from view
        tag = `${overdueDays} day${overdueDays === 1 ? "" : "s"} overdue`;
      } else if (diff === 0) {
        tag = "Due today";
      } else if (diff < 0) {
        // Upcoming: days until due
        const abs = Math.abs(diff);
        tag = `Due in ${abs} day${abs === 1 ? "" : "s"}`;
      } else {
        // Should not happen if overdue_days is correct, but fallback
        tag = `${diff} day${diff === 1 ? "" : "s"} overdue`;
      }
    }

    // Handle clients relation - it might be an object or an array
    // Extract client info from relation (for client_email, since client_name comes from view)
    const clientRelation = Array.isArray(inv.clients) 
      ? (inv.clients.length > 0 ? inv.clients[0] : null)
      : inv.clients;
    
    const clientId = inv.client_id ?? null;
    const clientName = inv.client_name ?? null;
    const clientEmail = clientRelation?.email ?? null;
    const invoiceMeta = invoiceMetaById.get(inv.id) ?? { created_at: null, updated_at: null };

    return {
      id: inv.id,
      invoice_number: inv.invoice_number ?? null,
      status: inv.display_status ?? null,
      due_date: dueStr,
      outstanding: Number(inv.outstanding ?? 0),
      currency: inv.currency ?? null,
      client: clientId && (clientName || clientEmail)
        ? {
            id: clientId,
            name: clientName,
            email: clientEmail,
          }
        : null,
      days_from_due: daysFromDue,
      days_overdue: overdueDays, // Use overdue_days from view
      tag,
      is_overdue: isOverdue, // Use is_overdue from view
      client_name: clientName,
      client_email: clientEmail,
      created_at: invoiceMeta.created_at,
      updated_at: invoiceMeta.updated_at,
    };
  });

  // Apply filtering
  let filteredSuggested = suggestedReminders ?? [];

  // 1) View presets (time-based)
  const todayStart = startOfDay(today);
  const currentMonthStart = startOfMonth(today);
  const currentMonthEnd = endOfMonth(today);
  const nextMonthStart = startOfNextMonth(today);
  const nextMonthEnd = endOfNextMonth(today);

  // CONSISTENCY: Overdue view already filtered by is_overdue=true in query, so no additional filtering needed
  // For other views, apply date range filters client-side (since query includes both overdue and upcoming)
  if (view === "overdue") {
    // Already filtered by is_overdue=true in query - just ensure we're using overdue_days from view
    // No additional filtering needed
  } else if (view === "due_7") {
    // Due in 7 days: due_date between today..today+7
    const sevenDaysFromNow = new Date(todayStart);
    sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);
    filteredSuggested = filteredSuggested.filter((r) => {
      if (!r.due_date) return false;
      const due = startOfDay(new Date(r.due_date));
      return due >= todayStart && due <= sevenDaysFromNow;
    });
  } else if (view === "due_14") {
    // Due in 14 days: due_date between today..today+14
    const fourteenDaysFromNow = new Date(todayStart);
    fourteenDaysFromNow.setDate(fourteenDaysFromNow.getDate() + 14);
    filteredSuggested = filteredSuggested.filter((r) => {
      if (!r.due_date) return false;
      const due = startOfDay(new Date(r.due_date));
      return due >= todayStart && due <= fourteenDaysFromNow;
    });
  } else if (view === "due_this_month") {
    // Due this month: due_date between start_of_current_month..end_of_current_month
    filteredSuggested = filteredSuggested.filter((r) => {
      if (!r.due_date) return false;
      const due = startOfDay(new Date(r.due_date));
      return due >= currentMonthStart && due <= currentMonthEnd;
    });
  } else if (view === "due_next_month") {
    // Due next month: due_date between start_of_next_month..end_of_next_month
    filteredSuggested = filteredSuggested.filter((r) => {
      if (!r.due_date) return false;
      const due = startOfDay(new Date(r.due_date));
      return due >= nextMonthStart && due <= nextMonthEnd;
    });
  }
  // Default view: no time-based filtering (all eligible invoices)

  // 2) Status filter (based on invoice status)
  if (statusFilter === "sent") {
    filteredSuggested = filteredSuggested.filter((r) => r.status === "sent");
  }
  // No status filter (or "all"): show all statuses

  // 3) Search (client name/email/invoice number)
  if (searchQuery.length > 0) {
    const q = searchQuery.toLowerCase();
    filteredSuggested = filteredSuggested.filter((r) => {
      return (
        r.invoice_number?.toLowerCase().includes(q) ||
        r.client_name?.toLowerCase().includes(q) ||
        r.client_email?.toLowerCase().includes(q)
      );
    });
  }

  // 4) Sorting: apply sort based on query params, default to newest-first
  const sortBy = sortParam || "created_at";
  const direction = sortDir || "desc";
  
  filteredSuggested = filteredSuggested.sort((a, b) => {
    let compareResult = 0;
    
    if (sortBy === "client_name") {
      const aName = (a.client_name || "").toLowerCase();
      const bName = (b.client_name || "").toLowerCase();
      compareResult = aName.localeCompare(bName);
    } else if (sortBy === "due_date") {
      const aDate = a.due_date ? new Date(a.due_date).getTime() : 0;
      const bDate = b.due_date ? new Date(b.due_date).getTime() : 0;
      compareResult = aDate - bDate;
    } else if (sortBy === "days_overdue") {
      // Sort by days_overdue (use overdue_days from view for overdue, days_from_due for upcoming)
      const aDays = a.is_overdue ? a.days_overdue : (a.days_from_due ?? 0);
      const bDays = b.is_overdue ? b.days_overdue : (b.days_from_due ?? 0);
      compareResult = aDays - bDays;
    } else if (sortBy === "outstanding") {
      const aOutstanding = a.outstanding ?? 0;
      const bOutstanding = b.outstanding ?? 0;
      compareResult = aOutstanding - bOutstanding;
    } else if (sortBy === "created_at") {
      const aCreated = a.created_at ? new Date(a.created_at).getTime() : 0;
      const bCreated = b.created_at ? new Date(b.created_at).getTime() : 0;
      compareResult = aCreated - bCreated;
    } else if (sortBy === "updated_at") {
      const aUpdated = a.updated_at ? new Date(a.updated_at).getTime() : 0;
      const bUpdated = b.updated_at ? new Date(b.updated_at).getTime() : 0;
      compareResult = aUpdated - bUpdated;
    } else {
      // Fallback: due_date
      const aDate = a.due_date ? new Date(a.due_date).getTime() : 0;
      const bDate = b.due_date ? new Date(b.due_date).getTime() : 0;
      compareResult = aDate - bDate;
    }
    
    return direction === "desc" ? -compareResult : compareResult;
  });

  // 5) Pagination
  const totalSuggested = filteredSuggested.length;
  const pageCount = Math.max(Math.ceil(totalSuggested / pageSize), 1);
  const currentPage = Math.min(page, pageCount);
  const start = (currentPage - 1) * pageSize;
  const end = start + pageSize;
  const pagedSuggested = filteredSuggested.slice(start, end);

  // Helper to build URLs with updated params
  const buildUrl = (overrides: Record<string, string | undefined>) => {
    const url = new URL(`/${workspaceId}/reminders`, "http://localhost");
    const current = new URLSearchParams();
    // Start with current effective values (or defaults if not set)
    if (effectiveView && effectiveView !== "default") current.set("view", effectiveView);
    if (effectiveStatus && effectiveStatus !== "all") current.set("status", effectiveStatus);
    if (searchQuery) current.set("search", searchQuery);
    if (currentPage > 1) current.set("page", currentPage.toString());
    // Preserve sort params if they exist and aren't default
    if (sortParam && sortParam !== "created_at") {
      current.set("sort", sortParam);
      if (sortDir && sortDir !== "desc") {
        current.set("dir", sortDir);
      }
    } else if (sortDir && sortDir !== "desc") {
      current.set("sort", "created_at");
      current.set("dir", sortDir);
    }

    // Apply overrides
    Object.entries(overrides).forEach(([key, value]) => {
      if (value === undefined || value === "") {
        current.delete(key);
      } else if (value === "default" && key === "view") {
        current.delete(key);
      } else if (value === "all" && key === "status") {
        current.delete(key);
      } else {
        current.set(key, value);
      }
    });

    url.search = current.toString();
    return url.pathname + (url.search ? `?${url.searchParams.toString()}` : "");
  };

  const hasAnyReminders = suggestedReminders.length > 0;

  // Process history data
  type HistoryRow = {
    id: string;
    sent_at: string | null;
    status: string | null;
    channel: string | null;
    body: string | null;
    subject: string | null;
    invoice: {
      id: string;
      invoice_number: string | null;
    } | null;
    client: {
      id: string;
      name: string | null;
      email: string | null;
    } | null;
    last_error: string | null;
    error_message: string | null;
  };

  const historyRows: HistoryRow[] = safeHistory.map((item: any) => ({
    id: item.id,
    sent_at: item.sent_at,
    status: item.status,
    channel: item.channel,
    body: item.body,
    subject: item.subject,
    invoice: Array.isArray(item.invoice) && item.invoice.length > 0 
      ? item.invoice[0] 
      : item.invoice || null,
    client: Array.isArray(item.client) && item.client.length > 0 
      ? item.client[0] 
      : item.client || null,
    last_error: item.last_error,
    error_message: item.error_message,
  }));

  const hasHistory = historyRows.length > 0;
  const historyTotalPages = Math.max(Math.ceil(historyRows.length / historyPageSize), 1);
  const safeHistoryPage = Math.min(historyPage, historyTotalPages);
  const historyStart = (safeHistoryPage - 1) * historyPageSize;
  const pagedHistoryRows = historyRows.slice(historyStart, historyStart + historyPageSize);

  const remindersFilterParts: string[] = [];
  if (effectiveView === "overdue") {
    remindersFilterParts.push("Overdue");
  } else if (effectiveView !== "default") {
    const reminderViewLabels: Record<string, string> = {
      due_7: "Due in 7 days",
      due_14: "Due in 14 days",
      due_this_month: "Due this month",
      due_next_month: "Due next month",
    };
    remindersFilterParts.push(
      reminderViewLabels[effectiveView] ?? effectiveView
    );
  }
  if (effectiveStatus !== "all" && effectiveView !== "overdue") {
    remindersFilterParts.push(
      effectiveStatus === "sent" ? "Sent" : effectiveStatus
    );
  }
  const sortLabels: Record<string, string> = {
    created_at: "Created",
    updated_at: "Updated",
    due_date: "Due date",
    client_name: "Client",
    days_overdue: "Days overdue",
    outstanding: "Outstanding",
  };
  const currentSortKey = sortParam || "created_at";
  const currentSortDir = sortDir || "desc";
  const sortIsNonDefault =
    currentSortKey !== "created_at" || currentSortDir !== "desc";
  if (sortIsNonDefault) {
    remindersFilterParts.push(
      `${sortLabels[currentSortKey] ?? currentSortKey} ${
        currentSortDir === "asc" ? "↑" : "↓"
      }`
    );
  }
  const remindersFilterSummary =
    remindersFilterParts.length > 0
      ? remindersFilterParts.join(" · ")
      : undefined;
  const activeFilterCount =
    Number(effectiveView !== "default") +
    Number(effectiveStatus !== "all") +
    Number(sortIsNonDefault);

  // Format date/time helper
  function formatDateTime(dateString: string | null): string {
    if (!dateString) return "—";
    const date = new Date(dateString);
    return date.toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  // Suggested reminders content
  const suggestedContent = (
    <div className="space-y-1.5 md:space-y-3">
      <CommandBar>
        <CommandBarSearch>
          <RemindersSearchInput
            workspaceId={workspaceId}
            initialSearch={searchQuery}
          />
        </CommandBarSearch>

        <CommandBarControls
          filters={
            <CommandBarFilters
              summary={remindersFilterSummary}
              activeCount={activeFilterCount}
              clearAllHref={`/${workspaceId}/reminders`}
            >
              <div className="space-y-4">
                <div>
                  <p className="mb-2 text-sm font-semibold text-gray-700">
                    Time range
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Link
                      href={buildUrl({
                        view: "default",
                        status:
                          effectiveStatus === "all" ? undefined : effectiveStatus,
                        page: "1",
                      })}
                      className={
                        "inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition " +
                        (effectiveView === "default"
                          ? "border-blue-600 bg-blue-100 text-blue-800 shadow-sm ring-1 ring-blue-200"
                          : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50")
                      }
                    >
                      Default
                    </Link>
                    <Link
                      href={buildUrl({
                        view: "due_7",
                        status:
                          effectiveStatus === "all" ? undefined : effectiveStatus,
                        page: "1",
                      })}
                      className={
                        "inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition " +
                        (effectiveView === "due_7"
                          ? "border-blue-600 bg-blue-100 text-blue-800 shadow-sm ring-1 ring-blue-200"
                          : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50")
                      }
                    >
                      Due in 7 days
                    </Link>
                    <Link
                      href={buildUrl({
                        view: "due_14",
                        status:
                          effectiveStatus === "all" ? undefined : effectiveStatus,
                        page: "1",
                      })}
                      className={
                        "inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition " +
                        (effectiveView === "due_14"
                          ? "border-blue-600 bg-blue-100 text-blue-800 shadow-sm ring-1 ring-blue-200"
                          : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50")
                      }
                    >
                      Due in 14 days
                    </Link>
                    <Link
                      href={buildUrl({
                        view: "due_this_month",
                        status:
                          effectiveStatus === "all" ? undefined : effectiveStatus,
                        page: "1",
                      })}
                      className={
                        "inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition " +
                        (effectiveView === "due_this_month"
                          ? "border-blue-600 bg-blue-100 text-blue-800 shadow-sm ring-1 ring-blue-200"
                          : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50")
                      }
                    >
                      Due this month
                    </Link>
                    <Link
                      href={buildUrl({
                        view: "due_next_month",
                        status:
                          effectiveStatus === "all" ? undefined : effectiveStatus,
                        page: "1",
                      })}
                      className={
                        "inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition " +
                        (effectiveView === "due_next_month"
                          ? "border-blue-600 bg-blue-100 text-blue-800 shadow-sm ring-1 ring-blue-200"
                          : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50")
                      }
                    >
                      Due next month
                    </Link>
                  </div>
                </div>
                <div>
                  <p className="mb-2 text-sm font-semibold text-gray-700">
                    Status
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Link
                      href={buildUrl({
                        status: "all",
                        view:
                          effectiveView === "overdue" ? "default" : undefined,
                        page: "1",
                      })}
                      className={
                        "inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition " +
                        (effectiveStatus === "all" && effectiveView !== "overdue"
                          ? "border-blue-600 bg-blue-100 text-blue-800 shadow-sm ring-1 ring-blue-200"
                          : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50")
                      }
                    >
                      All
                    </Link>
                    <Link
                      href={buildUrl({
                        status: "sent",
                        view:
                          effectiveView === "overdue" ? "default" : undefined,
                        page: "1",
                      })}
                      className={
                        "inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition " +
                        (effectiveStatus === "sent" && effectiveView !== "overdue"
                          ? "border-blue-600 bg-blue-100 text-blue-800 shadow-sm ring-1 ring-blue-200"
                          : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50")
                      }
                    >
                      Sent
                    </Link>
                    <Link
                      href={buildUrl({ view: "overdue", status: "all", page: "1" })}
                      className={
                        "inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition " +
                        (effectiveView === "overdue"
                          ? "border-blue-600 bg-blue-100 text-blue-800 shadow-sm ring-1 ring-blue-200"
                          : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50")
                      }
                    >
                      Overdue
                    </Link>
                  </div>
                </div>
              </div>
            </CommandBarFilters>
          }
          filterAdjacentActions={
            <ResetFiltersButton basePath={`/${workspaceId}/reminders`} />
          }
        />
      </CommandBar>

      {/* Table + pagination */}
      {!hasAnyReminders ? (
        <EmptyState
          title="No invoices need reminders"
          message="You're all caught up."
          actionLabel="View invoices"
          actionHref={`/${workspaceId}/invoices`}
        />
      ) : (
        <>
          <SuggestedRemindersTable
            workspaceId={workspaceId}
            reminders={pagedSuggested}
            currentView={view}
            searchParams={resolvedSearchParams}
          />
          <PaginationBar
            currentPage={currentPage}
            totalPages={pageCount}
            totalItems={totalSuggested}
            itemLabel={`reminder${totalSuggested !== 1 ? "s" : ""}`}
            basePath={`/${workspaceId}/reminders`}
            queryParams={resolvedSearchParams}
            pageParamKey="page"
          />
        </>
      )}
    </div>
  );

  // History content (keep existing logic, just adjust styling)
  const historyContent = (
    <>
      {!hasHistory ? (
        <EmptyState
          title="No reminders sent yet"
          message="When you send reminders, they'll appear here."
          actionLabel="View suggested"
          actionHref={`/${workspaceId}/reminders`}
        />
      ) : (
        <DataTableShell disableInnerScroll>
        <HorizontalScrollArea
          className="relative w-full min-w-0"
          viewportClassName="overflow-x-auto scrollbar-thin scrollbar-transparent"
        >
          <div className={TABLE_MIN_WIDTH_INNER}>
            <table className={TABLE_BASE}>
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className={TABLE_TH}>Sent at</th>
                  <th className={`${TABLE_CELL_TEXT_COL} ${TABLE_TH}`}>Client</th>
                  <th className={TABLE_TH}>Invoice</th>
                  <th className={TABLE_TH}>Channel</th>
                  <th className={TABLE_TH}>Status</th>
                  <th className={`${TABLE_CELL_TEXT_COL} ${TABLE_TH}`}>Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {pagedHistoryRows.map((row) => {
                  const channel = row.channel ?? "email";
                  const status = row.status ?? "sent";

                  return (
                    <tr key={row.id} className={TABLE_ROW}>
                      {/* SENT AT */}
                      <td className={`${TABLE_TD} whitespace-nowrap`}>
                        <div className="text-sm text-slate-900">
                          {row.sent_at ? formatDateTime(row.sent_at) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </div>
                      </td>

                      {/* CLIENT */}
                      <td className={`${TABLE_CELL_TEXT_COL} ${TABLE_TD}`}>
                        <div className="break-words text-sm font-medium text-slate-900">
                          {row.client?.name ?? <span className="text-slate-400">—</span>}
                        </div>
                      </td>

                      {/* INVOICE */}
                      <td className={`${TABLE_TD} whitespace-nowrap`}>
                        <div className="text-sm text-slate-900">
                          {row.invoice?.invoice_number ?? <span className="text-slate-400">—</span>}
                        </div>
                      </td>

                      {/* CHANNEL BADGE */}
                      <td className={`${TABLE_TD} whitespace-nowrap`}>
                        <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-xs font-medium bg-blue-50 text-blue-700 capitalize">
                          {channel}
                        </span>
                      </td>

                      {/* STATUS BADGE */}
                      <td className={`${TABLE_TD} whitespace-nowrap`}>
                        <StatusBadge type="reminder_delivery" status={status} />
                      </td>

                      {/* NOTES / ERROR - with expand/collapse */}
                      <td className={`${TABLE_CELL_TEXT_COL} ${TABLE_TD}`}>
                        <ReminderNotesCell 
                          body={row.body} 
                          error={row.error_message || row.last_error || null} 
                          status={status} 
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </HorizontalScrollArea>
        </DataTableShell>
      )}
      <PaginationBar
        currentPage={safeHistoryPage}
        totalPages={historyTotalPages}
        totalItems={historyRows.length}
        itemLabel={`reminder${historyRows.length !== 1 ? "s" : ""}`}
        basePath={`/${workspaceId}/reminders`}
        queryParams={resolvedSearchParams}
        pageParamKey="historyPage"
      />
    </>
  );

  return (
    <div className="w-full min-w-0 space-y-4 md:space-y-6">
      <CommandBar>
        <PageHeader
          title="Reminders"
          description="Suggested follow-ups and history for invoice reminder emails."
        />
      </CommandBar>

      {/* Tabs */}
      <RemindersTabs
        defaultValue="suggested"
        suggestedContent={suggestedContent}
        historyContent={historyContent}
      />
    </div>
  );
}
