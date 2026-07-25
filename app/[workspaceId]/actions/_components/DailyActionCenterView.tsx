import Link from "next/link";
import { clsx } from "clsx";
import { formatMoney } from "@/lib/utils/format-money";
import { EmptyState } from "@/components/ui/state";
import { HorizontalScrollArea } from "@/components/table/HorizontalScrollArea";
import {
  TABLE_BASE,
  TABLE_CELL_TEXT_COL,
  TABLE_MIN_WIDTH_INNER,
  TABLE_ROW,
  TABLE_TD,
  TABLE_TD_RIGHT,
  TABLE_TH_RIGHT,
} from "@/components/table/tableShell";
import { INVOICE_NUMBER_COL_CLASS } from "@/components/tables/invoiceTableColumns";
import { SuggestedRemindersTable } from "../../reminders/_components/SuggestedRemindersTable";
import type {
  DailyActionCenterData,
  NeedsActionReason,
  SuggestedReminderRow,
} from "@/lib/actions/types";

type DailyActionCenterViewProps = {
  workspaceId: string;
  data: DailyActionCenterData;
  suggestedReminderRows: SuggestedReminderRow[];
};

function formatDate(dateString: string | null) {
  if (!dateString) return "—";
  return new Date(dateString).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function reasonBadgeLabel(reason: NeedsActionReason): string {
  switch (reason) {
    case "reminder_due":
      return "Reminder due";
    case "high_risk":
      return "High risk";
    case "newly_overdue":
      return "Newly overdue";
  }
}

function reasonBadgeClass(reason: NeedsActionReason): string {
  switch (reason) {
    case "reminder_due":
      return "bg-blue-50 text-blue-700 ring-blue-200";
    case "high_risk":
      return "bg-red-50 text-red-700 ring-red-200";
    case "newly_overdue":
      return "bg-amber-50 text-amber-800 ring-amber-200";
  }
}

function SummaryCard({
  label,
  count,
  href,
}: {
  label: string;
  count: number;
  href?: string;
}) {
  const content = (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{count}</p>
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="block transition-opacity hover:opacity-90">
        {content}
      </Link>
    );
  }

  return content;
}

export function DailyActionCenterView({
  workspaceId,
  data,
  suggestedReminderRows,
}: DailyActionCenterViewProps) {
  const { summary, needsAction, highRisk } = data;
  const isFullyClear =
    summary.needsActionCount === 0 &&
    summary.remindersDueCount === 0 &&
    summary.highRiskCount === 0 &&
    summary.overdueCount === 0;

  if (isFullyClear) {
    return (
      <EmptyState
        title="Nothing needs immediate attention today."
        message="Your collections queue is up to date."
      />
    );
  }

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryCard label="Needs Action" count={summary.needsActionCount} />
        <SummaryCard label="Reminders Due" count={summary.remindersDueCount} />
        <SummaryCard label="High Risk" count={summary.highRiskCount} />
        <SummaryCard
          label="Overdue"
          count={summary.overdueCount}
          href={`/${workspaceId}/collections`}
        />
      </div>

      <section className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-900">Needs Action Today</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Invoices requiring follow-up based on reminders, risk, or aging.
          </p>
        </div>
        {needsAction.length === 0 ? (
          <p className="p-6 text-center text-sm text-slate-500">No priority actions today.</p>
        ) : (
          <HorizontalScrollArea
            className="w-full"
            viewportClassName="overflow-x-auto scrollbar-thin scrollbar-transparent"
          >
            <div className={TABLE_MIN_WIDTH_INNER}>
              <table className={TABLE_BASE}>
                <thead>
                  <tr className="border-b border-slate-100 text-xs font-medium text-slate-500">
                    <th
                      className={clsx(
                        "px-3 py-3 text-left uppercase tracking-wider",
                        INVOICE_NUMBER_COL_CLASS
                      )}
                    >
                      Invoice
                    </th>
                    <th className="min-w-0 px-3 py-3 text-left">Client</th>
                    <th className="hidden md:table-cell px-3 py-3 text-left whitespace-nowrap">
                      Due
                    </th>
                    <th className="px-3 py-3 text-right whitespace-nowrap">Outstanding</th>
                    <th className="px-3 py-3 text-left whitespace-nowrap">Reasons</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {needsAction.map((item) => (
                    <tr key={item.id} className={TABLE_ROW}>
                      <td
                        className={clsx(
                          "px-3 py-3 text-sm whitespace-nowrap",
                          INVOICE_NUMBER_COL_CLASS
                        )}
                      >
                        <Link
                          href={`/${workspaceId}/invoices/${item.id}`}
                          className="font-medium text-blue-600 hover:underline"
                        >
                          {item.invoiceNumber ?? item.id.slice(0, 8)}
                        </Link>
                      </td>
                      <td
                        className={clsx("min-w-0 px-3 py-3 text-sm text-slate-800", TABLE_CELL_TEXT_COL)}
                        title={item.clientName ?? undefined}
                      >
                        {item.clientName ?? "—"}
                      </td>
                      <td className="hidden md:table-cell px-3 py-3 text-sm text-slate-700 whitespace-nowrap">
                        {formatDate(item.dueDate)}
                      </td>
                      <td className={clsx("px-3 py-3 text-sm text-right font-medium tabular-nums", TABLE_TD_RIGHT)}>
                        {formatMoney(item.outstanding, item.currency ?? "USD")}
                      </td>
                      <td className={clsx("px-3 py-3", TABLE_TD)}>
                        <div className="flex flex-wrap gap-1">
                          {item.reasons.map((reason) => (
                            <span
                              key={reason}
                              className={clsx(
                                "inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset",
                                reasonBadgeClass(reason)
                              )}
                            >
                              {reasonBadgeLabel(reason)}
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </HorizontalScrollArea>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-900">Reminders Due Today</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Enabled reminder rules matching today&apos;s workspace date.
          </p>
        </div>
        {suggestedReminderRows.length === 0 ? (
          <p className="p-6 text-center text-sm text-slate-500">No reminders due today.</p>
        ) : (
          <SuggestedRemindersTable
            workspaceId={workspaceId}
            reminders={suggestedReminderRows}
          />
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-900">High Risk</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Overdue invoices classified as high risk by invoices_view.
          </p>
        </div>
        {highRisk.length === 0 ? (
          <p className="p-6 text-center text-sm text-slate-500">No high-risk invoices.</p>
        ) : (
          <HorizontalScrollArea
            className="w-full"
            viewportClassName="overflow-x-auto scrollbar-thin scrollbar-transparent"
          >
            <div className={TABLE_MIN_WIDTH_INNER}>
              <table className={TABLE_BASE}>
                <thead>
                  <tr className="border-b border-slate-100 text-xs font-medium text-slate-500">
                    <th
                      className={clsx(
                        "px-3 py-3 text-left uppercase tracking-wider",
                        INVOICE_NUMBER_COL_CLASS
                      )}
                    >
                      Invoice
                    </th>
                    <th className="min-w-0 px-3 py-3 text-left">Client</th>
                    <th className="hidden md:table-cell px-3 py-3 text-right whitespace-nowrap">
                      Days
                    </th>
                    <th className={clsx("px-3 py-3 text-right whitespace-nowrap", TABLE_TH_RIGHT)}>
                      Outstanding
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {highRisk.map((item) => (
                    <tr key={item.id} className={TABLE_ROW}>
                      <td
                        className={clsx(
                          "px-3 py-3 text-sm whitespace-nowrap",
                          INVOICE_NUMBER_COL_CLASS
                        )}
                      >
                        <Link
                          href={`/${workspaceId}/invoices/${item.id}`}
                          className="font-medium text-blue-600 hover:underline"
                        >
                          {item.invoiceNumber ?? item.id.slice(0, 8)}
                        </Link>
                      </td>
                      <td
                        className={clsx("min-w-0 px-3 py-3 text-sm text-slate-800", TABLE_CELL_TEXT_COL)}
                        title={item.clientName ?? undefined}
                      >
                        {item.clientName ?? "—"}
                      </td>
                      <td className="hidden md:table-cell px-3 py-3 text-right text-sm font-medium text-red-600 tabular-nums">
                        {item.overdueDays}
                      </td>
                      <td className={clsx("px-3 py-3 text-sm text-right font-semibold text-red-600 tabular-nums", TABLE_TD_RIGHT)}>
                        {formatMoney(item.outstanding, item.currency ?? "USD")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </HorizontalScrollArea>
        )}
      </section>
    </div>
  );
}
