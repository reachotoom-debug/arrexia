import { formatMoney } from "@/lib/invoices/utils";
import type { ClientPerformanceRow } from "@/app/[workspaceId]/dashboard/_types/dashboard";

interface BestClientsTableProps {
  clients: ClientPerformanceRow[];
}

export function BestClientsTable({ clients }: BestClientsTableProps) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-200">
        <h2 className="text-sm font-semibold text-slate-900">Best Clients</h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Clients with highest collected amounts and fastest payment
        </p>
      </div>
      {clients.length === 0 ? (
        <div className="p-6 text-center text-sm text-slate-500">No client data available</div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-xs font-medium text-slate-500">
              <th className="px-4 py-3 text-left">CLIENT</th>
              <th className="px-4 py-3 text-right">COLLECTED</th>
              <th className="px-4 py-3 text-right">AVG DAYS</th>
              <th className="px-4 py-3 text-right">INVOICES</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {clients.map((client) => (
              <tr key={client.clientId} className="hover:bg-slate-50 transition-colors">
                <td className="px-4 py-3 font-medium text-slate-900 whitespace-nowrap truncate max-w-[200px]" title={client.clientName}>
                  {client.clientName}
                </td>
                <td className="px-4 py-3 text-right font-semibold text-emerald-600 whitespace-nowrap">
                  {formatMoney(client.collected, "USD")}
                </td>
                <td className="px-4 py-3 text-right text-slate-600 whitespace-nowrap">
                  {client.avgDaysToPay !== null ? `${client.avgDaysToPay}` : "—"}
                </td>
                <td className="px-4 py-3 text-right text-slate-600 whitespace-nowrap">
                  {client.invoiceCount}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
