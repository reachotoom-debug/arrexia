import Link from "next/link";
import { formatCurrency } from "@/lib/format/currency";
import { INVOICE_NUMBER_COL_CLASS, OVERDUE_INVOICE_CELL, OVERDUE_INVOICE_HEADER_CELL } from "@/components/tables/invoiceTableColumns";
import { clsx } from "clsx";
import { HorizontalScrollArea } from "@/components/table/HorizontalScrollArea";
import {
  TABLE_BASE,
  TABLE_CELL_TEXT_COL,
  TABLE_MIN_WIDTH_INNER,
} from "@/components/table/tableShell";

type DashboardOverdueInvoice = {
  id: string;
  invoiceNumber: string;
  clientName: string;
  status: "draft" | "sent" | "paid" | "partially_paid" | "overdue" | "void";
  issueDate: string | null;
  dueDate: string | null;
  totalAmount: number;
  amountPaid: number;
  outstanding: number;
  overdueDays: number;
};

// Legacy interface for backward compatibility (if needed elsewhere)
interface OverdueInvoice {
  id: string;
  invoice_number: string;
  due_date: string;
  status: string;
  clients: { name: string } | null;
  amount?: number;
  total?: number; // Legacy/computed field
  outstanding?: number;
  outstanding_amount?: number | null;
}

interface OverdueInvoicesListProps {
  invoices: DashboardOverdueInvoice[];
  workspaceId: string;
}

function getStatusBadge(status: DashboardOverdueInvoice["status"]) {
  const normalized = (status ?? "draft").toLowerCase();

  switch (normalized) {
    case "overdue":
      return {
        label: "Overdue",
        className: "bg-rose-100 text-rose-700 border-rose-200",
      };
    case "paid":
      return { label: "Paid", className: "bg-emerald-100 text-emerald-700 border-emerald-200" };
    case "partially_paid":
      return { label: "Partially Paid", className: "bg-amber-100 text-amber-700 border-amber-200" };
    case "sent":
      return { label: "Sent", className: "bg-blue-100 text-blue-700 border-blue-200" };
    case "void":
      return { label: "Void", className: "bg-gray-100 text-gray-600 border-gray-200" };
    case "draft":
    default:
      return { label: "Draft", className: "bg-slate-100 text-slate-700 border-slate-200" };
  }
}

export function OverdueInvoicesList({
  invoices,
  workspaceId,
}: OverdueInvoicesListProps) {
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-200">
        <h2 className="text-sm font-semibold text-slate-900">
          Overdue Invoices
        </h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Invoices past due date with outstanding amounts
        </p>
      </div>
      {invoices.length === 0 ? (
        <div className="p-6 text-center text-sm text-slate-500">
          No overdue invoices
        </div>
      ) : (
        <HorizontalScrollArea
          className="relative w-full min-w-0"
          viewportClassName="overflow-x-auto scrollbar-thin scrollbar-transparent"
        >
        <div className={TABLE_MIN_WIDTH_INNER}>
        <table className={TABLE_BASE}>
          <thead>
            <tr className="border-b border-slate-100">
              <th className={clsx(OVERDUE_INVOICE_HEADER_CELL, "text-left")}>INVOICE #</th>
              <th className={clsx(TABLE_CELL_TEXT_COL, "align-middle text-xs font-medium text-slate-500 uppercase tracking-wide px-3 py-3 text-left")}>
                CLIENT
              </th>
              <th className={clsx(OVERDUE_INVOICE_HEADER_CELL, "text-left")}>STATUS</th>
              <th className={clsx(OVERDUE_INVOICE_HEADER_CELL, "text-left")}>DUE DATE</th>
              <th className={clsx(OVERDUE_INVOICE_HEADER_CELL, "text-left")}>DAYS OVERDUE</th>
              <th className={clsx(OVERDUE_INVOICE_HEADER_CELL, "text-right")}>OUTSTANDING</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {invoices.map((invoice) => {
              const daysOverdue = invoice.overdueDays;
              const badge = getStatusBadge(invoice.status);
              const dueDate = invoice.dueDate ?? "";
              
              return (
                <tr
                  key={invoice.id}
                  className="hover:bg-slate-50 transition-colors"
                >
                  <td className={clsx(OVERDUE_INVOICE_CELL, "text-slate-700", INVOICE_NUMBER_COL_CLASS)}>
                    <Link
                      href={`/${workspaceId}/invoices/${invoice.id}`}
                      className="font-medium text-blue-600 hover:underline"
                    >
                      {invoice.invoiceNumber}
                    </Link>
                  </td>
                  <td className={clsx(TABLE_CELL_TEXT_COL, "px-3 py-3 align-middle text-sm text-slate-800")}>
                    {invoice.clientName || "—"}
                  </td>
                  <td className={OVERDUE_INVOICE_CELL}>
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium border ${badge.className}`}
                    >
                      {badge.label}
                    </span>
                  </td>
                  <td className={clsx(OVERDUE_INVOICE_CELL, "text-slate-700 whitespace-nowrap")}>
                    {dueDate ? formatDate(dueDate) : "—"}
                  </td>
                  <td className={OVERDUE_INVOICE_CELL}>
                    <span className="font-medium text-red-600">
                      {daysOverdue} {daysOverdue === 1 ? "day" : "days"}
                    </span>
                  </td>
                  <td className={clsx(OVERDUE_INVOICE_CELL, "text-right font-medium text-slate-900")}>
                    {formatCurrency(invoice.outstanding, { currency: "USD" })}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
        </HorizontalScrollArea>
      )}
    </div>
  );
}

