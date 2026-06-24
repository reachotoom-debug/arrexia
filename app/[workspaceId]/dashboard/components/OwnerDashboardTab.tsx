// @ts-nocheck
import { formatCurrency } from "@/lib/format/currency";
import { KPI } from "../_components/KPI";
import { RevenueChart } from "../_components/RevenueChart";
import type { DashboardData } from "../_types/dashboard";
import { FileText, DollarSign, TrendingUp, Calendar } from "lucide-react";
import { HorizontalScrollArea } from "@/components/table/HorizontalScrollArea";
import {
  TABLE_BASE,
  TABLE_CELL_TEXT_COL,
  TABLE_MIN_WIDTH_INNER,
} from "@/components/table/tableShell";

interface OwnerDashboardTabProps {
  data: DashboardData;
}

export default function OwnerDashboardTab({ data }: OwnerDashboardTabProps) {
  // Convert monthly revenue for invoiced vs collected chart
  const revenueChartData = data.monthlyRevenue.slice(-12).map((point) => ({
    month: new Date(point.month + "-01").toLocaleDateString("en-US", { month: "short" }),
    revenue: point.paidAmount,
    invoiced: point.invoicedAmount,
  }));

  // Calculate status funnel (approximate from available data)
  const statusCounts = {
    paid: data.recentInvoices.filter((inv) => inv.status === "paid").length,
    overdue: data.overdueInvoices.length,
    sent: data.recentInvoices.filter((inv) => inv.status === "sent").length,
    draft: data.recentInvoices.filter((inv) => inv.status === "draft").length,
  };

  return (
    <div className="space-y-6">
      {/* Row 1: KPI Cards */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(14rem,1fr))] gap-4">
        <KPI
          label="Total invoiced"
          value={formatCurrency(data.ownerMetrics.last30DaysInvoiced, { currency: "USD" })}
          subtext="Last 30 days"
          icon={FileText}
          iconBgColor="bg-blue-100"
        />
        <KPI
          label="Total collected"
          value={formatCurrency(data.ownerMetrics.last30DaysCollected, { currency: "USD" })}
          subtext="Last 30 days"
          icon={DollarSign}
          iconBgColor="bg-emerald-100"
        />
        <KPI
          label="Collection rate"
          value={`${(data.ownerMetrics.collectionRate90d * 100).toFixed(1)}%`}
          subtext="Last 90 days"
          icon={TrendingUp}
          iconBgColor="bg-blue-100"
        />
        <KPI
          label="Average days to pay"
          value={data.ownerMetrics.averageDaysToPay > 0 ? `${data.ownerMetrics.averageDaysToPay}` : "—"}
          subtext="DSO"
          icon={Calendar}
          iconBgColor="bg-slate-100"
        />
      </div>

      {/* Row 2: Charts */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        {/* Invoiced vs Collected Chart */}
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-6">
          <div className="mb-4">
            <h3 className="text-sm font-medium text-slate-900">
              Invoiced vs Collected (Last 12 Months)
            </h3>
            <p className="text-xs text-muted-foreground mt-1">
              Comparison of invoiced amounts and payments received.
            </p>
          </div>
          {/* TODO: Implement combined bar/line chart */}
          <div className="h-64 flex items-center justify-center text-sm text-slate-500">
            Chart: Invoiced (bars) vs Collected (line) - TODO: implement combined chart
          </div>
        </div>

        {/* Status Funnel */}
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-6">
          <div className="mb-4">
            <h3 className="text-sm font-medium text-slate-900">
              Status Funnel
            </h3>
            <p className="text-xs text-muted-foreground mt-1">
              Distribution of invoice statuses.
            </p>
          </div>
          {/* TODO: Implement status funnel visualization */}
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-emerald-50 rounded-lg">
              <span className="text-sm font-medium text-emerald-900">Paid</span>
              <span className="text-sm font-semibold text-emerald-700">{statusCounts.paid}</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-red-50 rounded-lg">
              <span className="text-sm font-medium text-red-900">Overdue</span>
              <span className="text-sm font-semibold text-red-700">{statusCounts.overdue}</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
              <span className="text-sm font-medium text-blue-900">Sent</span>
              <span className="text-sm font-semibold text-blue-700">{statusCounts.sent}</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
              <span className="text-sm font-medium text-slate-900">Draft</span>
              <span className="text-sm font-semibold text-slate-700">{statusCounts.draft}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Row 3: Lists */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        {/* Best Clients */}
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200">
            <h2 className="text-sm font-semibold text-slate-900">Best Clients</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Clients with highest collected amounts
            </p>
          </div>
          {data.bestClients.length === 0 ? (
            <div className="p-6 text-center text-sm text-slate-500">
              No client data available
            </div>
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
                      <th className="px-3 py-3 text-right whitespace-nowrap">COLLECTED</th>
                      <th className="px-3 py-3 text-right whitespace-nowrap">AVG DAYS</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.bestClients.map((client) => (
                      <tr key={client.clientId} className="hover:bg-slate-50 transition-colors">
                        <td className={`${TABLE_CELL_TEXT_COL} px-3 py-3 font-medium text-slate-900`}>
                          <span className="break-words">{client.clientName}</span>
                        </td>
                        <td className="px-3 py-3 text-right font-semibold text-emerald-600 whitespace-nowrap tabular-nums">
                          {formatCurrency(client.totalCollected, { currency: "USD" })}
                        </td>
                        <td className="px-3 py-3 text-right text-slate-600 whitespace-nowrap tabular-nums">
                          {client.averageDaysToPay > 0 ? `${client.averageDaysToPay}` : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </HorizontalScrollArea>
          )}
        </div>

        {/* Problem Clients */}
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200">
            <h2 className="text-sm font-semibold text-slate-900">Problem Clients</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Clients with highest average days overdue
            </p>
          </div>
          {data.problemClients.length === 0 ? (
            <div className="p-6 text-center text-sm text-slate-500">
              No problem clients
            </div>
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
                      <th className="px-3 py-3 text-right whitespace-nowrap">AVG DAYS OVERDUE</th>
                      <th className="px-3 py-3 text-right whitespace-nowrap">INVOICES</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.problemClients.map((client) => (
                      <tr key={client.clientId} className="hover:bg-slate-50 transition-colors">
                        <td className={`${TABLE_CELL_TEXT_COL} px-3 py-3 font-medium text-slate-900`}>
                          <span className="break-words">{client.clientName}</span>
                        </td>
                        <td className="px-3 py-3 text-right font-semibold text-red-600 whitespace-nowrap tabular-nums">
                          {client.averageDaysToPay}
                        </td>
                        <td className="px-3 py-3 text-right text-slate-600 whitespace-nowrap tabular-nums">
                          {client.invoiceCount}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </HorizontalScrollArea>
          )}
        </div>
      </div>
    </div>
  );
}
