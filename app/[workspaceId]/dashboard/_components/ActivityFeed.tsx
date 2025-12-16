import Link from "next/link";
import { formatMoney } from "@/lib/invoices/utils";
import { INVOICE_NUMBER_COL_CLASS } from "@/components/tables/invoiceTableColumns";
import { clsx } from "clsx";
import type { ActivityItem } from "../_types/dashboard";

interface ActivityFeedProps {
  items: ActivityItem[];
  workspaceId: string;
  hasMore?: boolean;
}

export function ActivityFeed({ items, workspaceId, hasMore }: ActivityFeedProps) {
  // Show all items (already limited to 20 in data loader)
  const visibleItems = items;

  const formatDate = (dateString: string) => {
    if (!dateString) return "—";
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const invoiceId = (id: string) => {
    return id.startsWith("payment-") ? id.split("-")[1] : id;
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-200">
        <h2 className="text-sm font-semibold text-slate-900">Recent Activity</h2>
        <p className="text-xs text-slate-500 mt-0.5">Invoices and payments</p>
      </div>
      {visibleItems.length === 0 ? (
        <div className="p-6 text-center text-sm text-slate-500">No recent activity</div>
      ) : (
        <div className="h-[320px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white z-10">
              <tr className="border-b border-slate-100 text-xs font-medium text-slate-500">
                <th className="px-4 py-3 text-left bg-white">TYPE</th>
                <th className={clsx("px-4 py-3 text-left bg-white", INVOICE_NUMBER_COL_CLASS)}>INVOICE #</th>
                <th className="px-4 py-3 text-left bg-white">CLIENT</th>
                <th className="px-4 py-3 text-left bg-white">DATE</th>
                <th className="px-4 py-3 text-right bg-white">AMOUNT</th>
                <th className="px-4 py-3 text-left bg-white">STATUS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visibleItems.map((item, index) => {
                const invId = invoiceId(item.id);
                return (
                  <tr key={`${item.type}-${item.id}-${item.date}-${index}`} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                          item.type === "invoice"
                            ? "bg-blue-100 text-blue-700"
                            : "bg-emerald-100 text-emerald-700"
                        }`}
                      >
                        {item.type === "invoice" ? "Invoice" : "Payment"}
                      </span>
                    </td>
                    <td className={clsx("px-4 py-3 text-slate-700", INVOICE_NUMBER_COL_CLASS)}>
                      {item.invoiceNumber ? (
                        <Link
                          href={`/${workspaceId}/invoices/${invId}`}
                          className="font-medium text-blue-600 hover:underline"
                        >
                          {item.invoiceNumber}
                        </Link>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-800 whitespace-nowrap truncate max-w-[150px]" title={item.clientName}>
                      {item.clientName}
                    </td>
                    <td className="px-4 py-3 text-slate-700 whitespace-nowrap">
                      {formatDate(item.date)}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-slate-900 whitespace-nowrap">
                      {formatMoney(item.amount, "USD")}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-slate-600">{item.statusLabel}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
