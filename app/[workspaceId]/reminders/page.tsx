import { requireWorkspace } from "@/lib/auth/server";
import { supabaseServer } from "@/lib/supabase/server";
import { getEligibleReminders } from "@/lib/reminders/getEligibleReminders";
import { RemindersTabs } from "./_components/RemindersTabs";
import { RemindersSearchInput } from "./_components/RemindersSearchInput";
import { SuggestedRemindersTable } from "./_components/SuggestedRemindersTable";
import { ReminderNotesCell } from "./_components/ReminderNotesCell";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { PaginationBar } from "@/components/PaginationBar";
import { EmptyState } from "@/components/ui/state";
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
  CommandBarSearch,
} from "@/components/layout/CommandBar";
import { PageHeader } from "@/components/layout/PageHeader";

type RemindersPageProps = {
  params: Promise<{ workspaceId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type SuggestedRow = {
  id: string;
  invoice_id: string;
  invoice_number: string | null;
  status: string | null;
  due_date: string | null;
  outstanding: number | null;
  currency: string | null;
  client: {
    id: string;
    name: string | null;
    email: string | null;
  } | null;
  days_from_due: number | null;
  tag: string;
  is_overdue: boolean;
  client_name: string | null;
  client_email: string | null;
  rule_id: string;
  rule_name: string;
  rule_label: string;
  template_id: string | null;
  scheduled_date: string;
};

export default async function RemindersPage({
  params,
  searchParams,
}: RemindersPageProps) {
  const { workspaceId } = await params;
  await requireWorkspace(workspaceId);

  const supabase = await supabaseServer();
  const resolvedSearchParams = (await searchParams) || {};

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

  const sortParam = (Array.isArray(resolvedSearchParams.sort)
    ? resolvedSearchParams.sort[0]
    : resolvedSearchParams.sort) || undefined;
  const sortDir = (Array.isArray(resolvedSearchParams.dir)
    ? resolvedSearchParams.dir[0]
    : resolvedSearchParams.dir) as "asc" | "desc" | undefined;

  const eligibleCandidates = await getEligibleReminders(workspaceId);

  const suggestedReminders: SuggestedRow[] = eligibleCandidates.map((c) => ({
    id: c.id,
    invoice_id: c.invoiceId,
    invoice_number: c.invoiceNumber,
    status: c.displayStatus,
    due_date: c.dueDate,
    outstanding: c.outstanding,
    currency: c.currency,
    client:
      c.clientId && (c.clientName || c.clientEmail)
        ? {
            id: c.clientId,
            name: c.clientName,
            email: c.clientEmail,
          }
        : null,
    days_from_due: c.daysFromDueDate,
    tag: c.ruleLabel,
    is_overdue: c.isOverdue,
    client_name: c.clientName,
    client_email: c.clientEmail,
    rule_id: c.ruleId,
    rule_name: c.ruleName,
    rule_label: c.ruleLabel,
    template_id: c.templateId,
    scheduled_date: c.scheduledDate,
  }));

  let filteredSuggested = suggestedReminders;

  if (searchQuery.length > 0) {
    const q = searchQuery.toLowerCase();
    filteredSuggested = filteredSuggested.filter((r) => {
      return (
        r.invoice_number?.toLowerCase().includes(q) ||
        r.client_name?.toLowerCase().includes(q) ||
        r.client_email?.toLowerCase().includes(q) ||
        r.rule_name.toLowerCase().includes(q)
      );
    });
  }

  const sortBy = sortParam || "due_date";
  const direction = sortDir || "asc";

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
      const aDays = a.days_from_due ?? 0;
      const bDays = b.days_from_due ?? 0;
      compareResult = aDays - bDays;
    } else if (sortBy === "outstanding") {
      compareResult = (a.outstanding ?? 0) - (b.outstanding ?? 0);
    } else if (sortBy === "rule_name") {
      compareResult = a.rule_name.localeCompare(b.rule_name);
    } else {
      const aDate = a.due_date ? new Date(a.due_date).getTime() : 0;
      const bDate = b.due_date ? new Date(b.due_date).getTime() : 0;
      compareResult = aDate - bDate;
    }

    return direction === "desc" ? -compareResult : compareResult;
  });

  const totalSuggested = filteredSuggested.length;
  const pageCount = Math.max(Math.ceil(totalSuggested / pageSize), 1);
  const currentPage = Math.min(page, pageCount);
  const start = (currentPage - 1) * pageSize;
  const end = start + pageSize;
  const pagedSuggested = filteredSuggested.slice(start, end);

  const hasAnyEligible = suggestedReminders.length > 0;

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

  if (reminderRowsError) {
    console.error("[RemindersPage] history load error", {
      raw: reminderRowsError,
      message: reminderRowsError.message,
      code: reminderRowsError.code,
      details: (reminderRowsError as { details?: string })?.details,
      hint: (reminderRowsError as { hint?: string })?.hint,
    });

    throw reminderRowsError;
  }

  const safeHistory = reminderRows ?? [];

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

  function normalizeRelation<T>(value: T | T[] | null | undefined): T | null {
    if (Array.isArray(value)) {
      return value.length > 0 ? value[0] : null;
    }
    return value ?? null;
  }

  const historyRows: HistoryRow[] = safeHistory.map((item) => ({
    id: item.id,
    sent_at: item.sent_at,
    status: item.status,
    channel: item.channel,
    body: item.body,
    subject: item.subject,
    invoice: normalizeRelation(item.invoice),
    client: normalizeRelation(item.client),
    last_error: item.last_error,
    error_message: item.error_message,
  }));

  const hasHistory = historyRows.length > 0;
  const historyTotalPages = Math.max(
    Math.ceil(historyRows.length / historyPageSize),
    1
  );
  const safeHistoryPage = Math.min(historyPage, historyTotalPages);
  const historyStart = (safeHistoryPage - 1) * historyPageSize;
  const pagedHistoryRows = historyRows.slice(
    historyStart,
    historyStart + historyPageSize
  );

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

  const suggestedContent = (
    <div className="space-y-1.5 md:space-y-3">
      <CommandBar>
        <CommandBarSearch>
          <RemindersSearchInput
            workspaceId={workspaceId}
            initialSearch={searchQuery}
          />
        </CommandBarSearch>
      </CommandBar>

      {!hasAnyEligible ? (
        <EmptyState
          title="No reminders are due today"
          message="Arrexia checks your enabled reminder rules and shows invoices that are due for contact today."
          actionLabel="Manage reminder rules"
          actionHref={`/${workspaceId}/settings`}
        />
      ) : (
        <>
          <SuggestedRemindersTable
            workspaceId={workspaceId}
            reminders={pagedSuggested}
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
                    <th className={`${TABLE_CELL_TEXT_COL} ${TABLE_TH}`}>
                      Client
                    </th>
                    <th className={TABLE_TH}>Invoice</th>
                    <th className={TABLE_TH}>Channel</th>
                    <th className={TABLE_TH}>Status</th>
                    <th className={`${TABLE_CELL_TEXT_COL} ${TABLE_TH}`}>
                      Notes
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {pagedHistoryRows.map((row) => {
                    const channel = row.channel ?? "email";
                    const status = row.status ?? "sent";

                    return (
                      <tr key={row.id} className={TABLE_ROW}>
                        <td className={`${TABLE_TD} whitespace-nowrap`}>
                          <div className="text-sm text-slate-900">
                            {row.sent_at ? (
                              formatDateTime(row.sent_at)
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </div>
                        </td>

                        <td className={`${TABLE_CELL_TEXT_COL} ${TABLE_TD}`}>
                          <div className="break-words text-sm font-medium text-slate-900">
                            {row.client?.name ?? (
                              <span className="text-slate-400">—</span>
                            )}
                          </div>
                        </td>

                        <td className={`${TABLE_TD} whitespace-nowrap`}>
                          <div className="text-sm text-slate-900">
                            {row.invoice?.invoice_number ?? (
                              <span className="text-slate-400">—</span>
                            )}
                          </div>
                        </td>

                        <td className={`${TABLE_TD} whitespace-nowrap`}>
                          <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-xs font-medium bg-blue-50 text-blue-700 capitalize">
                            {channel}
                          </span>
                        </td>

                        <td className={`${TABLE_TD} whitespace-nowrap`}>
                          <StatusBadge
                            type="reminder_delivery"
                            status={status}
                          />
                        </td>

                        <td className={`${TABLE_CELL_TEXT_COL} ${TABLE_TD}`}>
                          <ReminderNotesCell
                            body={row.body}
                            error={
                              row.error_message || row.last_error || null
                            }
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

      <RemindersTabs
        defaultValue="suggested"
        suggestedContent={suggestedContent}
        historyContent={historyContent}
      />
    </div>
  );
}
