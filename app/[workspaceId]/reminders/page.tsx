import { requireUser } from "@/lib/auth/server";
import { requireWorkspace } from "@/lib/auth/server";
import { supabaseServer } from "@/lib/supabase/server";
import { RemindersTabs } from "./_components/RemindersTabs";
import { RemindersSearchAndReset } from "./_components/RemindersSearchAndReset";
import { SuggestedRemindersTable } from "./_components/SuggestedRemindersTable";
import { RemindersPagination } from "./_components/RemindersPagination";
import Link from "next/link";

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

type RemindersPageProps = {
  params: Promise<{ workspaceId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type SuggestedRow = {
  id: string;
  invoice_number: string | null;
  status: string | null;
  due_date: string | null;
  outstanding_amount: number | null;
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
};

export default async function RemindersPage({
  params,
  searchParams,
}: RemindersPageProps) {
  const user = await requireUser();
  const resolvedParams = await params;
  const { workspace } = await requireWorkspace(resolvedParams.workspaceId);
  const workspaceId = workspace.id;

  const supabase = await supabaseServer();
  const resolvedSearchParams = (await searchParams) || {};

  // Read query params
  const view =
    (Array.isArray(resolvedSearchParams.view)
      ? resolvedSearchParams.view[0]
      : resolvedSearchParams.view) || "default";
  const statusFilter =
    (Array.isArray(resolvedSearchParams.status)
      ? resolvedSearchParams.status[0]
      : resolvedSearchParams.status) || "all";
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

  // Load suggested reminders (invoices with outstanding amounts)
  const { data, error } = await supabase
    .from("invoices")
    .select(
      `
        id,
        invoice_number,
        status,
        due_date,
        currency,
        outstanding_amount,
        client:clients (
          id,
          name,
          email
        )
      `
    )
    .eq("workspace_id", workspaceId)
    .gt("outstanding_amount", 0)
    .not("due_date", "is", null);

  // Load reminder history from reminders table
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
      invoice:invoices (
        id,
        invoice_number,
        due_date,
        amount,
        outstanding_amount,
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
    .order("created_at", { ascending: false })
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

  const today = startOfDay(new Date());

  // Transform data to SuggestedRow format
  const suggestedReminders: SuggestedRow[] = (data ?? []).map((inv: any) => {
    const dueStr = inv.due_date as string | null;
    let daysFromDue: number | null = null;
    let daysOverdue = 0;
    let tag = "";
    let isOverdue = false;

    if (dueStr) {
      const due = startOfDay(new Date(dueStr));
      const diff = differenceInCalendarDays(today, due);
      daysFromDue = diff;
      daysOverdue = diff; // positive = overdue, negative = due in future

      if (diff > 0) {
        isOverdue = true;
        tag = `${diff} day${diff === 1 ? "" : "s"} overdue`;
      } else if (diff === 0) {
        tag = "Due today";
      } else {
        const abs = Math.abs(diff);
        tag = `Due in ${abs} day${abs === 1 ? "" : "s"}`;
      }
    }

    return {
      id: inv.id,
      invoice_number: inv.invoice_number ?? null,
      status: inv.status ?? null,
      due_date: dueStr,
      outstanding_amount: inv.outstanding_amount ?? null,
      currency: inv.currency ?? null,
      client: inv.client
        ? {
            id: inv.client.id,
            name: inv.client.name ?? null,
            email: inv.client.email ?? null,
          }
        : null,
      days_from_due: daysFromDue,
      days_overdue: daysOverdue,
      tag,
      is_overdue: isOverdue,
      client_name: inv.client?.name ?? null,
      client_email: inv.client?.email ?? null,
    };
  });

  // Apply filtering
  let filteredSuggested = suggestedReminders ?? [];

  // 1) View presets
  if (view === "overdue") {
    filteredSuggested = filteredSuggested.filter((r) => r.days_overdue > 0);
  } else if (view === "due_7") {
    filteredSuggested = filteredSuggested.filter(
      (r) => r.days_overdue <= 0 && r.days_overdue >= -7
    );
  }

  // 2) Status filter (based on invoice status)
  if (statusFilter === "draft") {
    filteredSuggested = filteredSuggested.filter((r) => r.status === "draft");
  } else if (statusFilter === "sent") {
    filteredSuggested = filteredSuggested.filter((r) => r.status === "sent");
  }

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

  // 4) Sorting: default sort by due_date ascending, then days_overdue desc (more overdue higher)
  filteredSuggested = filteredSuggested.sort((a, b) => {
    const aDate = a.due_date ? new Date(a.due_date).getTime() : 0;
    const bDate = b.due_date ? new Date(b.due_date).getTime() : 0;
    if (aDate !== bDate) return aDate - bDate;
    return (b.days_overdue || 0) - (a.days_overdue || 0);
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
    if (view && view !== "default") current.set("view", view);
    if (statusFilter && statusFilter !== "all") current.set("status", statusFilter);
    if (searchQuery) current.set("search", searchQuery);
    if (currentPage > 1) current.set("page", currentPage.toString());

    // Apply overrides
    Object.entries(overrides).forEach(([key, value]) => {
      if (value === undefined || value === "") {
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
  }));

  const hasHistory = historyRows.length > 0;

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
    <div className="space-y-3">
      {/* Row 1: View presets */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={buildUrl({ view: "default", page: "1" })}
            className={
              "inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition " +
              (view === "default"
                ? "border-blue-600 bg-blue-50 text-blue-700"
                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50")
            }
          >
            Default view
          </Link>
          <Link
            href={buildUrl({ view: "overdue", page: "1" })}
            className={
              "inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition " +
              (view === "overdue"
                ? "border-blue-600 bg-blue-50 text-blue-700"
                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50")
            }
          >
            Overdue only
          </Link>
          <Link
            href={buildUrl({ view: "due_7", page: "1" })}
            className={
              "inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition " +
              (view === "due_7"
                ? "border-blue-600 bg-blue-50 text-blue-700"
                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50")
            }
          >
            Due in 7 days
          </Link>
        </div>
      </div>

      {/* Row 2: Status chips + search + reset (search aligned right) */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        {/* Status chips on the left (All / Draft / Sent) */}
        <div className="flex items-center gap-2">
          <Link
            href={buildUrl({ status: "all", page: "1" })}
            className={
              "inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition " +
              (statusFilter === "all"
                ? "border-blue-600 bg-blue-50 text-blue-700"
                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50")
            }
          >
            All
          </Link>
          <Link
            href={buildUrl({ status: "draft", page: "1" })}
            className={
              "inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition " +
              (statusFilter === "draft"
                ? "border-blue-600 bg-blue-50 text-blue-700"
                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50")
            }
          >
            Draft invoices
          </Link>
          <Link
            href={buildUrl({ status: "sent", page: "1" })}
            className={
              "inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition " +
              (statusFilter === "sent"
                ? "border-blue-600 bg-blue-50 text-blue-700"
                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50")
            }
          >
            Sent invoices
          </Link>
        </div>

        {/* Search + Reset, aligned right */}
        <RemindersSearchAndReset
          workspaceId={workspaceId}
          searchQuery={searchQuery}
        />
      </div>

      {/* Row 3: "Sorted by" like Clients */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <span>Sorted by</span>
          <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
            Due date ↑
          </span>
        </div>
      </div>

      {/* Table + pagination */}
      {!hasAnyReminders ? (
        <div className="rounded-xl border border-slate-200 bg-white">
          <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
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
                  d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                />
              </svg>
            </div>
            <h3 className="text-base font-semibold text-foreground">
              No invoices currently require reminders
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              All caught up 🎉
            </p>
          </div>
        </div>
      ) : (
        <>
          <SuggestedRemindersTable
            workspaceId={workspaceId}
            reminders={pagedSuggested}
          />
          <RemindersPagination
            workspaceId={workspaceId}
            searchParams={resolvedSearchParams}
            page={currentPage}
            pageCount={pageCount}
            total={totalSuggested}
          />
        </>
      )}
    </div>
  );

  // History content (keep existing logic, just adjust styling)
  const historyContent = (
    <>
      {!hasHistory ? (
        <div className="rounded-xl border border-slate-200 bg-white px-6 py-16 text-center">
          <h3 className="text-base font-semibold text-foreground">
            No reminders sent yet
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Once you send reminders, they will appear in this history tab.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-200 px-6 py-3">
            <div className="text-sm font-medium text-slate-900">
              Reminder history
            </div>
          </div>
          <div className="px-6 py-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs font-medium text-muted-foreground">
                  <th className="py-2 text-left">Sent at</th>
                  <th className="py-2 text-left">Client</th>
                  <th className="py-2 text-left">Invoice</th>
                  <th className="py-2 text-left">Channel</th>
                  <th className="py-2 text-left">Status</th>
                  <th className="py-2 text-left">Notes</th>
                </tr>
              </thead>
              <tbody>
                {historyRows.map((row) => {
                  const channel = row.channel ?? "Email";
                  const status = row.status ?? "sent";

                  return (
                    <tr
                      key={row.id}
                      className="border-b hover:bg-slate-50/70 transition-colors"
                    >
                      {/* SENT AT */}
                      <td className="py-2 align-middle text-sm text-slate-700">
                        {row.sent_at ? formatDateTime(row.sent_at) : "—"}
                      </td>

                      {/* CLIENT */}
                      <td className="py-2 align-middle text-sm">
                        <div className="font-medium text-slate-800">
                          {row.client?.name ?? "—"}
                        </div>
                      </td>

                      {/* INVOICE */}
                      <td className="py-2 align-middle text-sm text-slate-700">
                        {row.invoice?.invoice_number ?? "—"}
                      </td>

                      {/* CHANNEL */}
                      <td className="py-2 align-middle text-sm text-slate-700 capitalize">
                        {channel}
                      </td>

                      {/* STATUS CHIP */}
                      <td className="py-2 align-middle">
                        <span
                          className={
                            "inline-flex items-center rounded-full px-3 py-1 text-xs font-medium " +
                            (status === "sent"
                              ? "bg-emerald-100 text-emerald-700"
                              : status === "failed"
                              ? "bg-red-100 text-red-700"
                              : status === "queued"
                              ? "bg-amber-100 text-amber-700"
                              : "bg-slate-100 text-slate-700")
                          }
                        >
                          {status}
                        </span>
                      </td>

                      {/* NOTES / ERROR */}
                      <td className="py-2 align-middle text-xs text-muted-foreground">
                        {row.body || row.last_error || "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );

  return (
    <div className="max-w-5xl mx-auto py-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Reminders</h1>
          <p className="text-sm text-muted-foreground">
            Suggested follow-ups and history for invoice reminder emails.
          </p>
        </div>
      </div>

      {/* Tabs */}
      <RemindersTabs
        defaultValue="suggested"
        suggestedContent={suggestedContent}
        historyContent={historyContent}
      />
    </div>
  );
}
