import Link from "next/link";
import { formatCurrency } from "@/lib/format/currency";
import { HorizontalScrollArea } from "@/components/table/HorizontalScrollArea";
import {
  TABLE_BASE,
  TABLE_CELL_TEXT_COL,
  TABLE_MIN_WIDTH_INNER,
} from "@/components/table/tableShell";
import type { TopHighRiskClient } from "../_types/dashboard";

interface TopHighRiskClientsCardProps {
  clients: TopHighRiskClient[];
  workspaceId: string;
  currency?: string;
}

export function TopHighRiskClientsCard({
  clients,
  workspaceId,
  currency = "USD",
}: TopHighRiskClientsCardProps) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-200">
        <h2 className="text-sm font-semibold text-slate-900">Clients to Collect First</h2>
        <p className="text-xs text-slate-500 mt-0.5">By overdue outstanding (active, non-archived clients)</p>
      </div>
      {clients.length === 0 ? (
        <div className="p-6 text-center text-sm text-slate-500">No high-risk clients</div>
      ) : (
        <HorizontalScrollArea
          className="relative w-full min-w-0"
          viewportClassName="overflow-x-auto scrollbar-thin scrollbar-transparent"
        >
          <div className={TABLE_MIN_WIDTH_INNER}>
            <table className={TABLE_BASE}>
              <thead>
                <tr className="border-b border-slate-100 text-xs font-medium text-slate-500">
                  <th className={`${TABLE_CELL_TEXT_COL} px-3 py-3 text-left`}>CLIENT</th>
                  <th className="px-3 py-3 text-right whitespace-nowrap">OVERDUE</th>
                  <th className="px-3 py-3 text-right whitespace-nowrap">MAX DAYS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {clients.map((client) => (
                  <tr key={client.clientId} className="hover:bg-slate-50 transition-colors">
                    <td className={`${TABLE_CELL_TEXT_COL} px-3 py-3 font-medium text-slate-900 break-words`} title={client.clientName}>
                      <Link
                        href={`/${workspaceId}/clients/${client.clientId}`}
                        className="text-blue-600 hover:underline"
                      >
                        {client.clientName}
                      </Link>
                    </td>
                    <td className="px-3 py-3 text-right whitespace-nowrap">
                      <span className="inline-flex items-center rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700 tabular-nums">
                        {formatCurrency(client.overdueAmount, { currency })}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right text-slate-600 whitespace-nowrap tabular-nums">
                      {client.maxOverdueDays > 0 ? client.maxOverdueDays : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </HorizontalScrollArea>
      )}
    </div>
  );
}
