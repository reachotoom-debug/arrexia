import Link from "next/link";
import { formatMoney } from "@/lib/invoices/utils";

interface ProblemClientsTableProps {
  clients: Array<{
    clientName: string;
    avgDaysOverdue: number;
    outstanding: number;
    invoiceCount: number;
  }>;
  hasMore?: boolean;
  workspaceId: string;
}

export function ProblemClientsTable({ clients, hasMore, workspaceId }: ProblemClientsTableProps) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-200">
        <h2 className="text-sm font-semibold text-slate-900">At-Risk Clients</h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Clients with highest average days overdue and outstanding amounts
        </p>
      </div>
      {clients.length === 0 ? (
        <div className="p-6 text-center text-sm text-slate-500">No at-risk clients</div>
      ) : (
        <>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs font-medium text-slate-500">
                <th className="px-4 py-3 text-left">CLIENT</th>
                <th className="px-4 py-3 text-right">AVG DAYS OVERDUE</th>
                <th className="px-4 py-3 text-right">OUTSTANDING</th>
                <th className="px-4 py-3 text-right">INVOICES</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {clients.map((client, idx) => (
                <tr key={idx} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-slate-900 whitespace-nowrap truncate max-w-[200px]" title={client.clientName}>
                    {client.clientName}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-red-600 whitespace-nowrap">
                    {client.avgDaysOverdue}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-red-600 whitespace-nowrap">
                    {formatMoney(client.outstanding, "USD")}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-600 whitespace-nowrap">
                    {client.invoiceCount}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {hasMore && (
            <div className="px-4 py-2 border-t border-slate-200 flex justify-end">
              <Link
                href={`/${workspaceId}/clients`}
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
