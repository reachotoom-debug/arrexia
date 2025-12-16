import Link from "next/link";
import { formatMoney } from "@/lib/invoices/utils";
import { INVOICE_NUMBER_COL_CLASS } from "@/components/tables/invoiceTableColumns";
import { clsx } from "clsx";
import type { UpcomingDueItem } from "@/app/[workspaceId]/dashboard/_types/dashboard";
import {
  getInvoiceStatusLabel,
  getInvoiceStatusBadgeClasses,
} from "@/lib/invoices/status-ui";

interface UpcomingDueTableProps {
  invoices: UpcomingDueItem[];
  workspaceId: string;
}

export function UpcomingDueTable({ invoices, workspaceId }: UpcomingDueTableProps) {
  const formatDate = (dateString: string) => {
    if (!dateString) return "—";
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-200">
        <h2 className="text-sm font-semibold text-slate-900">Upcoming Due</h2>
        <p className="text-xs text-slate-500 mt-0.5">Next 14 days</p>
      </div>
      {invoices.length === 0 ? (
        <div className="p-6 text-center text-sm text-slate-500">
          No upcoming invoices
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-xs font-medium text-slate-500">
              <th className={clsx("px-4 py-3 text-left uppercase tracking-wider", INVOICE_NUMBER_COL_CLASS)}>
                INVOICE #
              </th>
              <th className="px-4 py-3 text-left">CLIENT</th>
              <th className="px-4 py-3 text-left">DUE DATE</th>
              <th className="px-4 py-3 text-right">TOTAL</th>
              <th className="px-4 py-3 text-right">OUTSTANDING</th>
              <th className="px-4 py-3 text-left">STATUS</th>
              <th className="px-4 py-3 text-right">VIEW</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {invoices.map((invoice) => {
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
                    {formatMoney(invoice.total, "USD")}
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-slate-900 whitespace-nowrap">
                    {formatMoney(invoice.outstanding, "USD")}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${getInvoiceStatusBadgeClasses(invoice.status)}`}
                    >
                      {getInvoiceStatusLabel(invoice.status)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-sm whitespace-nowrap">
                    <Link
                      href={`/${workspaceId}/invoices/${invoice.id}`}
                      className="text-blue-600 hover:text-blue-700"
                    >
                      Open
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
