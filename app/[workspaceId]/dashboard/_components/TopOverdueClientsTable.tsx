import Link from "next/link";
import { formatCurrency } from "@/lib/format/currency";
import { HorizontalScrollArea } from "@/components/table/HorizontalScrollArea";
import {
  TABLE_BASE,
  TABLE_CELL_TEXT_COL,
  TABLE_MIN_WIDTH_INNER,
} from "@/components/table/tableShell";

interface TopOverdueClientsTableProps {
  clients: Array<{ clientName: string; overdueAmount: number }>;
  hasMore?: boolean;
  workspaceId: string;
}

export function TopOverdueClientsTable({ clients, hasMore, workspaceId }: TopOverdueClientsTableProps) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-200">
        <h2 className="text-sm font-semibold text-slate-900">Top Overdue Clients</h2>
        <p className="text-xs text-slate-500 mt-0.5">Clients with the highest overdue amounts</p>
      </div>
      {clients.length === 0 ? (
        <div className="p-6 text-center text-sm text-slate-500">No overdue clients</div>
      ) : (
        <>
          <HorizontalScrollArea
            className="relative w-full min-w-0"
            viewportClassName="overflow-x-auto scrollbar-thin scrollbar-transparent"
          >
            <div className={TABLE_MIN_WIDTH_INNER}>
              <table className={TABLE_BASE}>
                <thead>
                  <tr className="border-b border-slate-100 text-xs font-medium text-slate-500">
                    <th className={`${TABLE_CELL_TEXT_COL} px-3 py-3 text-left`}>CLIENT</th>
                    <th className="px-3 py-3 text-right whitespace-nowrap">OVERDUE AMOUNT</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {clients.map((client, idx) => (
                    <tr key={idx} className="hover:bg-slate-50 transition-colors">
                      <td className={`${TABLE_CELL_TEXT_COL} px-3 py-3 font-medium text-slate-900 break-words`} title={client.clientName}>
                        {client.clientName}
                      </td>
                      <td className="px-3 py-3 text-right font-semibold text-red-600 whitespace-nowrap tabular-nums">
                        {formatCurrency(client.overdueAmount, { currency: "USD" })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </HorizontalScrollArea>
          {hasMore && (
            <div className="px-4 py-2 border-t border-slate-200 flex justify-end">
              <Link
                href={`/${workspaceId}/invoices?view=smart-overdue`}
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
