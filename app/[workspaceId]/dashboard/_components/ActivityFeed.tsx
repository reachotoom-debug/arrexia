import Link from "next/link";
import { formatCurrency } from "@/lib/format/currency";
import { INVOICE_NUMBER_COL_CLASS } from "@/components/tables/invoiceTableColumns";
import { clsx } from "clsx";
import { HorizontalScrollArea } from "@/components/table/HorizontalScrollArea";
import {
  TABLE_BASE,
  TABLE_CELL_TEXT_COL,
  TABLE_MIN_WIDTH_INNER,
} from "@/components/table/tableShell";
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
        <div className="h-[320px] min-w-0 overflow-y-auto overflow-x-hidden">
          <HorizontalScrollArea
            className="relative w-full min-w-0"
            viewportClassName="overflow-x-auto scrollbar-thin scrollbar-transparent"
          >
            <div className={TABLE_MIN_WIDTH_INNER}>
              <table className={TABLE_BASE}>
                <thead className="sticky top-0 z-10 bg-white">
                  <tr className="border-b border-slate-100 text-xs font-medium text-slate-500">
                    <th className="bg-white px-3 py-3 text-left whitespace-nowrap">TYPE</th>
                    <th className={clsx("bg-white px-3 py-3 text-left whitespace-nowrap", INVOICE_NUMBER_COL_CLASS)}>
                      INVOICE #
                    </th>
                    <th className={clsx(TABLE_CELL_TEXT_COL, "bg-white px-3 py-3 text-left")}>CLIENT</th>
                    <th className="bg-white px-3 py-3 text-left whitespace-nowrap">DATE</th>
                    <th className="bg-white px-3 py-3 text-right whitespace-nowrap">AMOUNT</th>
                    <th className="bg-white px-3 py-3 text-left whitespace-nowrap">STATUS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {visibleItems.map((item, index) => {
                    const invId = invoiceId(item.id);
                    return (
                      <tr key={`${item.type}-${item.id}-${item.date}-${index}`} className="hover:bg-slate-50 transition-colors">
                        <td className="px-3 py-3 whitespace-nowrap">
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
                        <td className={clsx("px-3 py-3 text-slate-700 whitespace-nowrap", INVOICE_NUMBER_COL_CLASS)}>
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
                        <td className={clsx(TABLE_CELL_TEXT_COL, "px-3 py-3 text-slate-800")} title={item.clientName}>
                          {item.clientName}
                        </td>
                        <td className="px-3 py-3 text-slate-700 whitespace-nowrap">
                          {formatDate(item.date)}
                        </td>
                        <td className="px-3 py-3 text-right font-medium text-slate-900 whitespace-nowrap tabular-nums">
                          {formatCurrency(item.amount, { currency: "USD" })}
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap">
                          <span className="text-xs text-slate-600">{item.statusLabel}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </HorizontalScrollArea>
        </div>
      )}
    </div>
  );
}
