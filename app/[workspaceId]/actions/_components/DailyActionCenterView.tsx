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
import { CollectionActionCell } from "./CollectionActionCell";
import type { ActionReason, DailyActionCenterData } from "@/lib/actions/types";

type DailyActionCenterViewProps = {
  workspaceId: string;
  data: DailyActionCenterData;
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

function SummaryCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{value}</p>
      {detail ? <p className="mt-1 text-xs text-slate-500">{detail}</p> : null}
    </div>
  );
}

export function DailyActionCenterView({ workspaceId, data }: DailyActionCenterViewProps) {
  const { summary, collectionActions } = data;

  if (summary.actionsTodayCount === 0) {
    const onboardingSignals = {
      invoiceCount: summary.sentInvoiceCount,
      sentInvoiceCount: summary.sentInvoiceCount,
    };
    const emptyCopy = hasNeverEnteredCollectionsWorkflow(onboardingSignals)
      ? FIRST_RUN_ACTIONS_EMPTY
      : CAUGHT_UP_ACTIONS_EMPTY;

    return (
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
    );
  }

  const attentionAmountLabel =
    summary.requiringAttentionAmount != null
      ? formatMoney(
          summary.requiringAttentionAmount,
          summary.requiringAttentionCurrency
        )
      : "—";

  const attentionDetail = summary.requiringAttentionMixedCurrency
    ? `Total shown in ${summary.requiringAttentionCurrency} only (multiple currencies in queue).`
    : undefined;

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SummaryCard
          label="Actions today"
          value={String(summary.actionsTodayCount)}
        />
        <SummaryCard
          label="Requiring attention"
          value={attentionAmountLabel}
          detail={attentionDetail}
        />
        <SummaryCard
          label="Reminders due"
          value={String(summary.remindersDueCount)}
        />
        <SummaryCard
          label="Newly overdue"
          value={String(summary.newlyOverdueCount)}
        />
      </div>

      <section className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-900">Today&apos;s Collection Actions</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Prioritized collection work requiring attention now.
          </p>
        </div>
        <HorizontalScrollArea
          className="w-full"
          viewportClassName="overflow-x-auto scrollbar-thin scrollbar-transparent"
        >
          <div className={TABLE_MIN_WIDTH_INNER}>
            <table className={TABLE_BASE}>
              <thead>
                <tr className="border-b border-slate-100 text-xs font-medium text-slate-500">
                  <th className="px-3 py-3 text-left whitespace-nowrap">Priority</th>
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
                    Due / Days
                  </th>
                  <th className={clsx("px-3 py-3 text-right whitespace-nowrap", TABLE_TH_RIGHT)}>
                    Outstanding
                  </th>
                  <th className="px-3 py-3 text-left whitespace-nowrap">Why now</th>
                  <th className="px-3 py-3 text-left whitespace-nowrap">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {collectionActions.map((item, index) => (
                    <tr key={item.id} className={TABLE_ROW}>
                      <td className="px-3 py-3 text-sm whitespace-nowrap">
                        <div className="flex flex-col gap-1">
                          <span className="font-medium text-slate-700">#{index + 1}</span>
                          {item.isHighRisk ? (
                            <span className="inline-flex w-fit rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-medium text-red-700 ring-1 ring-inset ring-red-200">
                              High risk
                            </span>
                          ) : null}
                        </div>
                      </td>
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
                        className={clsx(
                          "min-w-0 px-3 py-3 text-sm text-slate-800",
                          TABLE_CELL_TEXT_COL
                        )}
                        title={item.clientName ?? undefined}
                      >
                        {item.clientName ?? "—"}
                      </td>
                      <td className="hidden md:table-cell px-3 py-3 text-sm text-slate-700 whitespace-nowrap">
                        <div>{formatDateOnlyField(item.dueDate)}</div>
                        <div className="text-xs text-red-600">
                          {item.overdueDays > 0
                            ? `${item.overdueDays} day${item.overdueDays === 1 ? "" : "s"} overdue`
                            : "Not overdue"}
                        </div>
                      </td>
                      <td
                        className={clsx(
                          "px-3 py-3 text-sm text-right font-medium tabular-nums",
                          TABLE_TD_RIGHT
                        )}
                      >
                        {formatMoney(item.outstanding, item.currency ?? "USD")}
                      </td>
                      <td className={clsx("px-3 py-3", TABLE_TD)}>
                        <div className="flex flex-wrap gap-1">
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
                      <td className={clsx("px-3 py-3 text-sm whitespace-nowrap", TABLE_TD)}>
                        {item.execution ? (
                          <CollectionActionCell
                            workspaceId={workspaceId}
                            invoiceId={item.id}
                            invoiceNumber={item.invoiceNumber}
                            clientName={item.clientName}
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
