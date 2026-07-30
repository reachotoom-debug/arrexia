import Link from "next/link";
import { clsx } from "clsx";
import { formatMoney } from "@/lib/utils/format-money";
import { formatDateOnlyField } from "@/lib/datetime/formatDateTime";
import { milestoneReasonLabel } from "@/lib/actions/collectionActivity";
import {
  CAUGHT_UP_ACTIONS_EMPTY,
  FIRST_RUN_ACTIONS_EMPTY,
  hasNeverEnteredCollectionsWorkflow,
} from "@/lib/onboarding/workspaceOnboardingState";
import { EmptyState } from "@/components/ui/state";
import { PaginationBar } from "@/components/PaginationBar";
import { HorizontalScrollArea } from "@/components/table/HorizontalScrollArea";
import {
  TABLE_BASE,
  TABLE_CELL_TEXT_COL,
  TABLE_MIN_WIDTH_INNER,
  TABLE_ROW,
  TABLE_TD,
  TABLE_TD_RIGHT,
  TABLE_TH,
  TABLE_TH_RIGHT,
} from "@/components/table/tableShell";
import { CollectionActionCell } from "./CollectionActionCell";
import type {
  ActionReason,
  DailyActionCenterData,
  DailyActionCenterPagination,
} from "@/lib/actions/types";

type DailyActionCenterViewProps = {
  workspaceId: string;
  data: DailyActionCenterData;
  greeting: string;
  pagination: DailyActionCenterPagination;
  queryParams?: Record<string, string | string[] | undefined>;
};

function reasonLabel(reason: ActionReason): string {
  switch (reason.type) {
    case "reminder_due":
      return "Reminder due";
    case "newly_overdue":
      return "Newly overdue";
    case "aging_milestone":
      return milestoneReasonLabel(reason.milestoneDays);
  }
}

function reasonBadgeClass(reason: ActionReason): string {
  switch (reason.type) {
    case "reminder_due":
      return "bg-blue-50 text-blue-700 ring-blue-200";
    case "newly_overdue":
      return "bg-amber-50 text-amber-800 ring-amber-200";
    case "aging_milestone":
      return reason.milestoneDays >= 30
        ? "bg-rose-50 text-rose-800 ring-rose-200"
        : "bg-orange-50 text-orange-800 ring-orange-200";
  }
}

function SummaryMetric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums text-slate-900 sm:text-2xl">{value}</p>
      {detail ? <p className="mt-1 text-xs leading-snug text-slate-500">{detail}</p> : null}
    </div>
  );
}

function formatCashRequiringAttention(
  summary: DailyActionCenterData["summary"]
): { value: string; detail?: string } {
  const { requiringAttentionByCurrency } = summary;

  if (requiringAttentionByCurrency.length === 0) {
    return { value: formatMoney(0, summary.requiringAttentionCurrency) };
  }

  if (requiringAttentionByCurrency.length === 1) {
    const only = requiringAttentionByCurrency[0]!;
    return { value: formatMoney(only.amount, only.currency) };
  }

  return {
    value: requiringAttentionByCurrency
      .map((row) => formatMoney(row.amount, row.currency))
      .join(" · "),
    detail: "Totals shown separately by currency.",
  };
}

export function DailyActionCenterView({
  workspaceId,
  data,
  greeting,
  pagination,
  queryParams,
}: DailyActionCenterViewProps) {
  const { summary, collectionActions, businessName } = data;
  const priorityOffset = (pagination.currentPage - 1) * pagination.pageSize;

  if (summary.actionsTodayCount === 0) {
    const onboardingSignals = {
      invoiceCount: summary.sentInvoiceCount,
      sentInvoiceCount: summary.sentInvoiceCount,
    };
    const emptyCopy = hasNeverEnteredCollectionsWorkflow(onboardingSignals)
      ? FIRST_RUN_ACTIONS_EMPTY
      : CAUGHT_UP_ACTIONS_EMPTY;

    return (
      <div className="space-y-6">
        <header className="space-y-1">
          <p className="text-sm font-medium text-slate-600">{greeting}</p>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Today&apos;s Collections
          </h1>
          <p className="text-sm text-slate-500">
            Here&apos;s what needs your attention today.
          </p>
        </header>
        <EmptyState
          title={emptyCopy.title}
          message={emptyCopy.message}
          actionLabel={
            hasNeverEnteredCollectionsWorkflow(onboardingSignals) ? "Create invoice" : undefined
          }
          actionHref={
            hasNeverEnteredCollectionsWorkflow(onboardingSignals)
              ? `/${workspaceId}/invoices/new`
              : undefined
          }
        />
      </div>
    );
  }

  const cashAttention = formatCashRequiringAttention(summary);

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <p className="text-sm font-medium text-slate-600">{greeting}</p>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Today&apos;s Collections
        </h1>
        <p className="text-sm text-slate-500">
          Here&apos;s what needs your attention today.
        </p>
      </header>

      <section aria-label="Today's collection summary" className="space-y-3">
        <h2 className="sr-only">Collection summary</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <SummaryMetric
            label="Actions today"
            value={String(summary.actionsTodayCount)}
            detail={
              summary.actionsTodayCount === 1
                ? "Invoice requires action"
                : "Invoices require action"
            }
          />
          <SummaryMetric
            label="Reminders ready"
            value={String(summary.remindersDueCount)}
            detail={
              summary.remindersDueCount === 1
                ? "Scheduled reminder due"
                : "Scheduled reminders due"
            }
          />
          <SummaryMetric
            label="High-risk customers"
            value={String(summary.highRiskCustomerCount)}
            detail={
              summary.highRiskCustomerCount === 1 ? "Client to prioritize" : "Clients to prioritize"
            }
          />
          <SummaryMetric
            label="Cash requiring attention"
            value={cashAttention.value}
            detail={cashAttention.detail}
          />
        </div>
      </section>

      <section
        aria-label="Prioritized collection work queue"
        className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden"
      >
        <div className="border-b border-slate-200 px-4 py-2.5 sm:px-5">
          <h2 className="text-sm font-semibold text-slate-900">Prioritized work queue</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Who owes us, why today, and how to follow up.
          </p>
        </div>
        <HorizontalScrollArea
          className="w-full min-w-0"
          viewportClassName="overflow-x-auto scrollbar-thin scrollbar-transparent"
        >
          <div className={TABLE_MIN_WIDTH_INNER}>
            <table className={TABLE_BASE}>
              <thead className="bg-slate-50/80">
                <tr className="border-b border-slate-100 text-[11px] font-medium uppercase tracking-wide text-slate-500">
                  <th className={`${TABLE_TH} py-2 whitespace-nowrap`}>Priority</th>
                  <th className={`min-w-[10rem] ${TABLE_TH} py-2 text-left`}>Client / Invoice</th>
                  <th className={`${TABLE_TH} py-2 whitespace-nowrap text-left`}>Why now</th>
                  <th className={`hidden md:table-cell ${TABLE_TH} py-2 whitespace-nowrap text-left`}>
                    Due / Aging
                  </th>
                  <th className={clsx(TABLE_TH, TABLE_TH_RIGHT, "py-2 whitespace-nowrap")}>
                    Outstanding
                  </th>
                  <th className={`hidden lg:table-cell ${TABLE_TH} py-2 text-left`}>
                    Recommended
                  </th>
                  <th className={`${TABLE_TH} py-2 whitespace-nowrap text-left min-w-[11rem]`}>
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {collectionActions.map((item, index) => (
                  <tr key={item.id} className={clsx(TABLE_ROW, "align-top")}>
                    <td className={`${TABLE_TD} py-2.5 text-sm whitespace-nowrap`}>
                      <div className="flex flex-col gap-0.5">
                        <span className="font-medium tabular-nums text-slate-700">
                          #{priorityOffset + index + 1}
                        </span>
                        {item.isHighRisk ? (
                          <span className="inline-flex w-fit rounded-full bg-red-50 px-1.5 py-0.5 text-[10px] font-medium text-red-700 ring-1 ring-inset ring-red-200">
                            High risk
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className={clsx(TABLE_TD, TABLE_CELL_TEXT_COL, "py-2.5 text-sm")}>
                      <div className="font-medium text-slate-900 break-words">
                        {item.clientName ?? "—"}
                      </div>
                      <Link
                        href={`/${workspaceId}/invoices/${item.id}`}
                        className="mt-0.5 inline-block text-sm font-medium text-blue-600 hover:underline"
                      >
                        {item.invoiceNumber ?? item.id.slice(0, 8)}
                      </Link>
                    </td>
                    <td className={`${TABLE_TD} py-2.5`}>
                      <div className="flex flex-wrap gap-1 max-w-[14rem]">
                        {item.reasons.map((reason) => (
                          <span
                            key={`${reason.type}-${
                              reason.type === "aging_milestone" ? reason.milestoneDays : "base"
                            }`}
                            className={clsx(
                              "inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset",
                              reasonBadgeClass(reason)
                            )}
                          >
                            {reasonLabel(reason)}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td
                      className={clsx(
                        "hidden md:table-cell",
                        TABLE_TD,
                        "py-2.5 text-sm text-slate-700 whitespace-nowrap"
                      )}
                    >
                      <div>{formatDateOnlyField(item.dueDate)}</div>
                      <div className="text-xs text-red-600">
                        {item.overdueDays > 0
                          ? `${item.overdueDays} day${item.overdueDays === 1 ? "" : "s"} overdue`
                          : "Not overdue"}
                      </div>
                    </td>
                    <td
                      className={clsx(
                        TABLE_TD,
                        TABLE_TD_RIGHT,
                        "py-2.5 text-sm font-semibold tabular-nums text-slate-900 whitespace-nowrap"
                      )}
                    >
                      {formatMoney(item.outstanding, item.currency ?? "USD")}
                    </td>
                    <td
                      className={clsx(
                        "hidden lg:table-cell",
                        TABLE_TD,
                        "py-2.5 text-sm font-medium text-slate-800 max-w-[10rem]"
                      )}
                    >
                      {item.recommendedAction ?? "—"}
                    </td>
                    <td className={clsx(TABLE_TD, "py-2.5 text-sm whitespace-nowrap")}>
                      {item.execution ? (
                        <CollectionActionCell
                          workspaceId={workspaceId}
                          invoiceId={item.id}
                          invoiceNumber={item.invoiceNumber}
                          clientName={item.clientName}
                          clientPhone={item.clientPhone}
                          clientCountry={item.clientCountry}
                          businessName={businessName}
                          outstanding={item.outstanding}
                          currency={item.currency}
                          dueDate={item.dueDate}
                          daysOverdue={item.overdueDays}
                          execution={item.execution}
                        />
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </HorizontalScrollArea>
        {pagination.totalPages > 1 ? (
          <div className="border-t border-slate-100 px-4 py-3 sm:px-5">
            <PaginationBar
              currentPage={pagination.currentPage}
              totalPages={pagination.totalPages}
              totalItems={pagination.totalItems}
              itemLabel={`action${pagination.totalItems !== 1 ? "s" : ""}`}
              basePath={`/${workspaceId}/actions`}
              queryParams={queryParams}
            />
          </div>
        ) : null}
      </section>

      <p className="text-sm text-slate-500">
        <Link
          href={`/${workspaceId}/collections`}
          className="font-medium text-blue-600 hover:underline"
        >
          View full overdue portfolio →
        </Link>
      </p>
    </div>
  );
}
