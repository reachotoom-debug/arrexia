import Link from "next/link";
import { formatMoney } from "@/lib/invoices/utils";
import { INVOICE_NUMBER_COL_CLASS, OVERDUE_INVOICE_CELL, OVERDUE_INVOICE_HEADER_CELL } from "@/components/tables/invoiceTableColumns";
import { clsx } from "clsx";

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
  riskLevel: string | null;
};

interface OverdueInvoicesTableProps {
  invoices: DashboardOverdueInvoice[];
  workspaceId: string;
  hasMore?: boolean;
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

export function OverdueInvoicesTable({
  invoices,
  workspaceId,
  hasMore,
}: OverdueInvoicesTableProps) {
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
          Top overdue invoices by outstanding amount
        </p>
      </div>
      {invoices.length === 0 ? (
        <div className="p-6 text-center text-sm text-slate-500">
          No overdue invoices
        </div>
      ) : (
        <>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100">
                <th className={clsx(OVERDUE_INVOICE_HEADER_CELL, "text-left")}>INVOICE #</th>
                <th className={clsx(OVERDUE_INVOICE_HEADER_CELL, "text-left")}>CLIENT</th>
                <th className={clsx(OVERDUE_INVOICE_HEADER_CELL, "text-left")}>STATUS</th>
                <th className={clsx(OVERDUE_INVOICE_HEADER_CELL, "text-left")}>DAYS OVERDUE</th>
                <th className={clsx(OVERDUE_INVOICE_HEADER_CELL, "text-right")}>OUTSTANDING</th>
                <th className={clsx(OVERDUE_INVOICE_HEADER_CELL, "text-left")}>RISK</th>
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
                    <td className={clsx(OVERDUE_INVOICE_CELL, "text-slate-700", INVOICE_NUMBER_COL_CLASS)}>
                      <Link
                        href={`/${workspaceId}/invoices/${invoice.id}`}
                        className="font-medium text-blue-600 hover:underline"
                      >
                        {invoice.invoiceNumber}
                      </Link>
                    </td>
                    <td className={clsx(OVERDUE_INVOICE_CELL, "text-slate-800")}>
                      {invoice.clientName || "—"}
                    </td>
                    <td className={OVERDUE_INVOICE_CELL}>
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium border ${badge.className}`}
                      >
                        {badge.label}
                      </span>
                    </td>
                    <td className={OVERDUE_INVOICE_CELL}>
                      <span className="font-medium text-red-600">
                        {invoice.overdueDays} {invoice.overdueDays === 1 ? "day" : "days"}
                      </span>
                    </td>
                    <td className={clsx(OVERDUE_INVOICE_CELL, "text-right font-medium text-slate-900")}>
                      {formatMoney(invoice.outstanding, "USD")}
                    </td>
                    <td className={OVERDUE_INVOICE_CELL}>
                      {getRiskBadge(invoice.riskLevel)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {hasMore && (
            <div className="px-4 py-2 border-t border-slate-200 flex justify-end">
              <Link
                href={`/${workspaceId}/invoices?status=overdue`}
                className="text-[11px] text-slate-500 hover:text-slate-700 hover:underline"
              >
                View all
              </Link>
            </div>
          )}
        </>
      )}
    </div>
  );
}
