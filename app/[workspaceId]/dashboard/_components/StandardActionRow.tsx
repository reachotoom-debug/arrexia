import Link from "next/link";
import { formatMoney } from "@/lib/invoices/utils";
import { INVOICE_NUMBER_COL_CLASS } from "@/components/tables/invoiceTableColumns";
import { clsx } from "clsx";
import type { UpcomingDueItem, CollectionsWorkItem } from "../../_types/dashboard";

interface StandardActionRowProps {
  upcoming: UpcomingDueItem[];
  collections: CollectionsWorkItem[];
  workspaceId: string;
}

function getStatusBadge(status: string) {
  const statusLower = status.toLowerCase();
  if (statusLower === "sent") {
    return { label: "Sent", className: "bg-blue-100 text-blue-700 border-blue-200" };
  } else if (statusLower === "partially_paid" || statusLower === "partial") {
    return { label: "Partially paid", className: "bg-amber-100 text-amber-700 border-amber-200" };
  } else if (statusLower === "draft") {
    return { label: "Draft", className: "bg-slate-100 text-slate-700 border-slate-200" };
  }
  return { label: status, className: "bg-gray-100 text-gray-600 border-gray-200" };
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
    <div className="grid gap-6 md:grid-cols-2">
      {/* Upcoming Due Table */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200">
          <h2 className="text-sm font-semibold text-slate-900">Upcoming Due</h2>
          <p className="text-xs text-slate-500 mt-0.5">Next 14 days</p>
        </div>
        {upcomingLimited.length === 0 ? (
          <div className="p-6 text-center text-sm text-slate-500">No upcoming invoices</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs font-medium text-slate-500">
                <th className={clsx("px-4 py-3 text-left uppercase tracking-wider", INVOICE_NUMBER_COL_CLASS)}>
                  INVOICE #
                </th>
                <th className="px-4 py-3 text-left">CLIENT</th>
                <th className="px-4 py-3 text-left">DUE DATE</th>
                <th className="px-4 py-3 text-right">OUTSTANDING</th>
                <th className="px-4 py-3 text-left">STATUS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {upcomingLimited.map((invoice) => {
                const badge = getStatusBadge(invoice.status);
                return (
                  <tr key={invoice.id} className="hover:bg-slate-50 transition-colors">
                    <td className={clsx("px-4 py-3 text-sm text-slate-700", INVOICE_NUMBER_COL_CLASS)}>
                      <Link
                        href={`/${workspaceId}/invoices/${invoice.id}`}
                        className="font-medium text-blue-600 hover:underline"
                      >
                        {invoice.invoiceNumber}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-slate-800 whitespace-nowrap truncate max-w-[150px]" title={invoice.clientName}>
                      {invoice.clientName}
                    </td>
                    <td className="px-4 py-3 text-slate-700 whitespace-nowrap">
                      {formatDate(invoice.dueDate)}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-slate-900 whitespace-nowrap">
                      {formatMoney(invoice.outstanding, "USD")}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${badge.className}`}
                      >
                        {badge.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
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
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs font-medium text-slate-500">
                <th className="px-4 py-3 text-left">RISK</th>
                <th className={clsx("px-4 py-3 text-left uppercase tracking-wider", INVOICE_NUMBER_COL_CLASS)}>
                  INVOICE #
                </th>
                <th className="px-4 py-3 text-left">CLIENT</th>
                <th className="px-4 py-3 text-right">DAYS</th>
                <th className="px-4 py-3 text-right">OUTSTANDING</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {topOverdue.map((invoice) => (
                <tr key={invoice.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3">{getRiskBadge(invoice.riskLevel)}</td>
                  <td className={clsx("px-4 py-3 text-sm text-slate-700", INVOICE_NUMBER_COL_CLASS)}>
                    <Link
                      href={`/${workspaceId}/invoices/${invoice.id}`}
                      className="font-medium text-blue-600 hover:underline"
                    >
                      {invoice.invoiceNumber}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-800 whitespace-nowrap truncate max-w-[150px]" title={invoice.clientName}>
                    {invoice.clientName}
                  </td>
                  <td className="px-4 py-3 text-right text-red-600 font-medium whitespace-nowrap">
                    {invoice.overdueDays}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-red-600 whitespace-nowrap">
                    {formatMoney(invoice.outstanding, "USD")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
