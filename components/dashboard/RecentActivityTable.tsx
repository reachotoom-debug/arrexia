import Link from "next/link";
import { formatMoney } from "@/lib/invoices/utils";

interface RecentActivityTableProps {
  activities: Array<{
    id: string;
    type: "invoice" | "payment";
    invoiceNumber?: string;
    clientName: string;
    status: string;
    date: string;
    total?: number;
    paidAmount?: number;
    outstanding?: number;
  }>;
  workspaceId: string;
}

function getStatusBadge(status: string) {
  const statusLower = status.toLowerCase();
  if (statusLower === "paid") {
    return { label: "Paid", className: "bg-emerald-100 text-emerald-700 border-emerald-200" };
  } else if (statusLower === "overdue") {
    return { label: "Overdue", className: "bg-rose-100 text-rose-700 border-rose-200" };
  } else if (statusLower === "sent") {
    return { label: "Sent", className: "bg-blue-100 text-blue-700 border-blue-200" };
  } else if (statusLower === "draft") {
    return { label: "Draft", className: "bg-slate-100 text-slate-700 border-slate-200" };
  } else if (statusLower === "partially_paid" || statusLower === "partial") {
    return { label: "Partial", className: "bg-amber-100 text-amber-700 border-amber-200" };
  }
  return { label: status, className: "bg-gray-100 text-gray-600 border-gray-200" };
}

export function RecentActivityTable({ activities, workspaceId }: RecentActivityTableProps) {
  const formatDateDisplay = (dateString: string) => {
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
        <h2 className="text-sm font-semibold text-slate-900">Recent Activity</h2>
        <p className="text-xs text-slate-500 mt-0.5">Invoices and payments</p>
      </div>
      {activities.length === 0 ? (
        <div className="p-6 text-center text-sm text-slate-500">
          No recent activity
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-xs font-medium text-slate-500">
              <th className="px-4 py-3 text-left">TYPE</th>
              <th className="px-4 py-3 text-left">INVOICE #</th>
              <th className="px-4 py-3 text-left">CLIENT</th>
              <th className="px-4 py-3 text-left">DATE</th>
              <th className="px-4 py-3 text-right">AMOUNT</th>
              <th className="px-4 py-3 text-left">STATUS</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {activities.map((activity) => {
              const badge = getStatusBadge(activity.status);
              const invoiceId = activity.id.startsWith("payment-")
                ? activity.id.split("-")[1]
                : activity.id;

              return (
                <tr key={activity.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                        activity.type === "invoice"
                          ? "bg-blue-100 text-blue-700"
                          : "bg-emerald-100 text-emerald-700"
                      }`}
                    >
                      {activity.type === "invoice" ? "Invoice" : "Payment"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {activity.invoiceNumber ? (
                      <Link
                        href={`/${workspaceId}/invoices/${invoiceId}`}
                        className="font-medium text-blue-600 hover:underline"
                      >
                        {activity.invoiceNumber}
                      </Link>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-800 whitespace-nowrap truncate max-w-[150px]" title={activity.clientName}>
                    {activity.clientName}
                  </td>
                  <td className="px-4 py-3 text-slate-700 whitespace-nowrap">
                    {formatDateDisplay(activity.date)}
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-slate-900 whitespace-nowrap">
                    {activity.paidAmount
                      ? formatMoney(activity.paidAmount, "USD")
                      : activity.total
                      ? formatMoney(activity.total, "USD")
                      : "—"}
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
  );
}
