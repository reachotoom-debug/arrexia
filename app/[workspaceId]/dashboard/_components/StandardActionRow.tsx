import Link from "next/link";
import { formatCurrency } from "@/lib/format/currency";
import { INVOICE_NUMBER_COL_CLASS } from "@/components/tables/invoiceTableColumns";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { clsx } from "clsx";
import { HorizontalScrollArea } from "@/components/table/HorizontalScrollArea";
import { TABLE_BASE, TABLE_MIN_WIDTH_INNER } from "@/components/table/tableShell";
import type { UpcomingDueItem, CollectionsWorkItem } from "../../_types/dashboard";

interface StandardActionRowProps {
  upcoming: UpcomingDueItem[];
  collections: CollectionsWorkItem[];
  workspaceId: string;
}

function getRiskBadge(riskLevel: string | null) {
  if (riskLevel === "high") {
    return (
      <span className="inline-flex rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-700 border border-red-200">
        H
      </span>
    );
  } else if (riskLevel === "medium") {
    return (
      <span className="inline-flex rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-medium text-orange-700 border border-orange-200">
        M
      </span>
    );
  } else if (riskLevel === "low") {
    return (
      <span className="inline-flex rounded-full bg-yellow-100 px-2 py-0.5 text-[10px] font-medium text-yellow-700 border border-yellow-200">
        L
      </span>
    );
  }
  return null;
}

export function StandardActionRow({ upcoming, collections, workspaceId }: StandardActionRowProps) {
  const formatDate = (dateString: string) => {
    if (!dateString) return "—";
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const topOverdue = collections.slice(0, 5);
  const upcomingLimited = upcoming.slice(0, 10);

  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
      {/* Upcoming Due Table */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200">
          <h2 className="text-sm font-semibold text-slate-900">Upcoming Due</h2>
          <p className="text-xs text-slate-500 mt-0.5">Next 14 days</p>
        </div>
        {upcomingLimited.length === 0 ? (
          <div className="p-6 text-center text-sm text-slate-500">No upcoming invoices</div>
        ) : (
          <HorizontalScrollArea className="w-full" viewportClassName="overflow-x-auto scrollbar-thin scrollbar-transparent">
          <div className={TABLE_MIN_WIDTH_INNER}>
          <table className={TABLE_BASE}>
            <thead>
              <tr className="border-b border-slate-100 text-xs font-medium text-slate-500">
                <th className={clsx("px-3 py-3 text-left uppercase tracking-wider", INVOICE_NUMBER_COL_CLASS)}>
                  INVOICE #
                </th>
                <th className="min-w-0 px-3 py-3 text-left">CLIENT</th>
                <th className="hidden md:table-cell px-3 py-3 text-left whitespace-nowrap">DUE DATE</th>
                <th className="px-3 py-3 text-right whitespace-nowrap">OUTSTANDING</th>
                <th className="px-3 py-3 text-left whitespace-nowrap">STATUS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {upcomingLimited.map((invoice) => (
                <tr key={invoice.id} className="hover:bg-slate-50 transition-colors">
                  <td className={clsx("px-3 py-3 text-sm text-slate-700 whitespace-nowrap", INVOICE_NUMBER_COL_CLASS)}>
                    <Link
                      href={`/${workspaceId}/invoices/${invoice.id}`}
                      className="font-medium text-blue-600 hover:underline"
                    >
                      {invoice.invoiceNumber}
                    </Link>
                  </td>
                  <td className="min-w-0 px-3 py-3 text-slate-800 break-words" title={invoice.clientName}>
                    {invoice.clientName}
                  </td>
                  <td className="hidden md:table-cell px-3 py-3 text-slate-700 whitespace-nowrap">
                    {formatDate(invoice.dueDate)}
                  </td>
                  <td className="px-3 py-3 text-right font-medium text-slate-900 whitespace-nowrap tabular-nums">
                    {formatCurrency(invoice.outstanding, { currency: "USD" })}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    <StatusBadge type="invoice" status={invoice.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          </HorizontalScrollArea>
        )}
      </div>

      {/* Top Overdue to Collect Table */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200">
          <h2 className="text-sm font-semibold text-slate-900">Top Overdue to Collect</h2>
          <p className="text-xs text-slate-500 mt-0.5">Top 5 by outstanding amount</p>
        </div>
        {topOverdue.length === 0 ? (
          <div className="p-6 text-center text-sm text-slate-500">No overdue invoices</div>
        ) : (
          <HorizontalScrollArea className="w-full" viewportClassName="overflow-x-auto scrollbar-thin scrollbar-transparent">
          <div className={TABLE_MIN_WIDTH_INNER}>
          <table className={TABLE_BASE}>
            <thead>
              <tr className="border-b border-slate-100 text-xs font-medium text-slate-500">
                <th className="hidden lg:table-cell px-3 py-3 text-left whitespace-nowrap">RISK</th>
                <th className={clsx("px-3 py-3 text-left uppercase tracking-wider whitespace-nowrap", INVOICE_NUMBER_COL_CLASS)}>
                  INVOICE #
                </th>
                <th className="min-w-0 px-3 py-3 text-left">CLIENT</th>
                <th className="hidden md:table-cell px-3 py-3 text-right whitespace-nowrap">DAYS</th>
                <th className="px-3 py-3 text-right whitespace-nowrap">OUTSTANDING</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {topOverdue.map((invoice) => (
                <tr key={invoice.id} className="hover:bg-slate-50 transition-colors">
                  <td className="hidden lg:table-cell px-3 py-3 whitespace-nowrap">{getRiskBadge(invoice.riskLevel)}</td>
                  <td className={clsx("px-3 py-3 text-sm text-slate-700 whitespace-nowrap", INVOICE_NUMBER_COL_CLASS)}>
                    <Link
                      href={`/${workspaceId}/invoices/${invoice.id}`}
                      className="font-medium text-blue-600 hover:underline"
                    >
                      {invoice.invoiceNumber}
                    </Link>
                  </td>
                  <td className="min-w-0 px-3 py-3 text-slate-800 break-words" title={invoice.clientName}>
                    {invoice.clientName}
                  </td>
                  <td className="hidden md:table-cell px-3 py-3 text-right text-red-600 font-medium whitespace-nowrap tabular-nums">
                    {invoice.overdueDays}
                  </td>
                  <td className="px-3 py-3 text-right font-semibold text-red-600 whitespace-nowrap tabular-nums">
                    {formatCurrency(invoice.outstanding, { currency: "USD" })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          </HorizontalScrollArea>
        )}
      </div>
    </div>
  );
}
