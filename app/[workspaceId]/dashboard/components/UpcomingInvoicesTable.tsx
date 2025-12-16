import Link from "next/link";
import { formatMoney } from "@/lib/invoices/utils";
import { INVOICE_NUMBER_COL_CLASS } from "@/components/tables/invoiceTableColumns";
import { clsx } from "clsx";

interface UpcomingInvoice {
  id: string;
  invoice_number: string;
  status: string;
  issue_date: string;
  due_date: string;
  client_name?: string;
  clients: { name: string } | null;
  amount: number;
  total: number;
  currency: string;
}

interface UpcomingInvoicesTableProps {
  invoices: UpcomingInvoice[];
  workspaceId: string;
}

type DashboardStatus =
  | "draft"
  | "sent"
  | "void"
  | "paid"
  | "partially_paid"
  | "overdue";

function getStatusBadge(rawStatus?: string) {
  if (!rawStatus) {
    return {
      label: "—",
      className: "bg-gray-100 text-gray-500 border-gray-200",
    };
  }

  const status = rawStatus.toLowerCase() as DashboardStatus;

  switch (status) {
    case "draft":
      return { label: "Draft", className: "bg-slate-100 text-slate-700 border-slate-200" };
    case "sent":
      return { label: "Sent", className: "bg-blue-100 text-blue-700 border-blue-200" };
    case "void":
      return { label: "Void", className: "bg-gray-100 text-gray-600 border-gray-200" };
    case "paid":
      return { label: "Paid", className: "bg-emerald-100 text-emerald-700 border-emerald-200" };
    case "partially_paid":
      return { label: "Partially paid", className: "bg-amber-100 text-amber-700 border-amber-200" };
    case "overdue":
      return { label: "Overdue", className: "bg-rose-100 text-rose-700 border-rose-200" };
    default:
      return {
        label: rawStatus,
        className: "bg-gray-100 text-gray-600 border-gray-200",
      };
  }
}

export function UpcomingInvoicesTable({ invoices, workspaceId }: UpcomingInvoicesTableProps) {
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
        <p className="text-xs text-slate-500 mt-0.5">
          Invoices due soon
        </p>
      </div>
      {invoices.length === 0 ? (
        <div className="p-6 text-center text-sm text-slate-500">
          No upcoming invoices
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-xs font-medium text-slate-500">
              <th className={clsx("px-4 py-3 text-left uppercase tracking-wider", INVOICE_NUMBER_COL_CLASS)}>INVOICE #</th>
              <th className="px-4 py-3 text-left">CLIENT</th>
              <th className="px-4 py-3 text-left">STATUS</th>
              <th className="px-4 py-3 text-left">DUE DATE</th>
              <th className="px-4 py-3 text-right">TOTAL</th>
              <th className="px-4 py-3 text-right">VIEW</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {invoices.map((invoice) => {
              const badge = getStatusBadge(invoice.status);
              return (
                <tr
                  key={invoice.id}
                  className="hover:bg-slate-50 transition-colors"
                >
                  <td className={clsx("px-4 py-3 text-sm text-slate-700", INVOICE_NUMBER_COL_CLASS)}>
                    <Link
                      href={`/${workspaceId}/invoices/${invoice.id}`}
                      className="font-medium text-blue-600 hover:underline"
                    >
                      {invoice.invoice_number}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-800">
                    {invoice.clients?.name ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium border ${badge.className}`}
                    >
                      {badge.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {formatDate(invoice.due_date)}
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-slate-900">
                    {formatMoney(invoice.total)}
                  </td>
                  <td className="px-4 py-3 text-right text-sm">
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
