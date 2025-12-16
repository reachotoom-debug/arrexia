import { formatMoney } from "@/lib/invoices/utils";
import { KPI } from "../_components/KPI";
import { OverdueAmountChart } from "../_components/OverdueAmountChart";
import { OverdueInvoicesTable } from "../_components/OverdueInvoicesTable";
import type { DashboardData } from "../_types/dashboard";
import { DollarSign, AlertTriangle, FileText, Target } from "lucide-react";
import Link from "next/link";

interface ArDashboardTabProps {
  data: DashboardData;
}

export default function ArDashboardTab({ data }: ArDashboardTabProps) {
  const highRiskExposure = data.riskSummary.high.amount;
  const overdueAmount = data.overdueInvoices.reduce(
    (sum, inv) => sum + inv.outstandingAmount,
    0
  );

  // Convert aging buckets for chart
  const agingChartData = data.agingBuckets.map((bucket) => {
    const labelMap: Record<string, string> = {
      "0-30": "0–30 days",
      "31-60": "31–60 days",
      "61-90": "61–90 days",
      "90+": "90+ days",
    };
    const keyMap: Record<string, string> = {
      "0-30": "d0_30",
      "31-60": "d31_60",
      "61-90": "d61_90",
      "90+": "d90_plus",
    };
    return {
      label: labelMap[bucket.bucket] || `${bucket.bucket} days`,
      key: keyMap[bucket.bucket] || `d${bucket.bucket.replace("-", "_")}`,
      amount: bucket.amount,
      formattedAmount: formatMoney(bucket.amount, "USD"),
    };
  });

  // Convert overdue invoices for table
  const overdueInvoicesForTable = data.overdueInvoices.map((inv) => ({
    id: inv.id,
    invoiceNumber: inv.invoiceNumber,
    clientName: inv.clientName ?? "—",
    status: inv.status as "draft" | "sent" | "paid" | "partially_paid" | "overdue" | "void",
    issueDate: inv.issueDate,
    dueDate: inv.dueDate,
    totalAmount: inv.totalAmount,
    amountPaid: inv.paidAmount,
    outstanding: inv.outstandingAmount,
    overdueDays: inv.daysOverdue ?? 0,
    riskLevel: inv.riskLevel ?? null,
  }));

  return (
    <div className="space-y-6">
      {/* Row 1: KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KPI
          label="Total Outstanding"
          value={formatMoney(data.totals.totalOutstanding, "USD")}
          icon={DollarSign}
          iconBgColor="bg-blue-100"
        />
        <KPI
          label="Overdue Amount"
          value={formatMoney(overdueAmount, "USD")}
          icon={AlertTriangle}
          iconBgColor="bg-red-100"
        />
        <KPI
          label="Overdue Invoices"
          value={data.overdueInvoices.length}
          icon={FileText}
          iconBgColor="bg-amber-100"
        />
        <KPI
          label="High-risk exposure"
          value={formatMoney(highRiskExposure, "USD")}
          icon={Target}
          iconBgColor="bg-red-100"
        />
      </div>

      {/* Row 2: Smart Risk + Chart */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Smart Risk Overview */}
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-6">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                Smart Risk Overview
              </h3>
              <p className="text-xs text-muted-foreground mt-1">
                Auto-detected clusters of overdue and high-outstanding invoices
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Link
                href={`/${data.workspaceId}/invoices?view=smart-high-risk`}
                className="text-xs font-medium text-blue-600 hover:underline"
              >
                View all
              </Link>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            {/* High risk */}
            <Link
              href={`/${data.workspaceId}/invoices?view=smart-high-risk`}
              className="flex flex-col rounded-lg border border-red-200 bg-gradient-to-br from-red-50 to-red-100/50 p-4 hover:border-red-300 transition-colors"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-700">
                  High risk
                </span>
              </div>
              <div className="text-xs text-red-800 mb-1">
                {data.riskSummary.high.invoices} invoice{data.riskSummary.high.invoices !== 1 ? "s" : ""}
              </div>
              <div className="text-lg font-semibold text-red-900">
                {formatMoney(data.riskSummary.high.amount, "USD")}
              </div>
            </Link>

            {/* Medium */}
            <Link
              href={`/${data.workspaceId}/invoices?view=smart-medium-risk`}
              className="flex flex-col rounded-lg border border-amber-200 bg-gradient-to-br from-amber-50 to-amber-100/50 p-4 hover:border-amber-300 transition-colors"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700">
                  Medium risk
                </span>
              </div>
              <div className="text-xs text-amber-800 mb-1">
                {data.riskSummary.medium.invoices} invoice{data.riskSummary.medium.invoices !== 1 ? "s" : ""}
              </div>
              <div className="text-lg font-semibold text-amber-900">
                {formatMoney(data.riskSummary.medium.amount, "USD")}
              </div>
            </Link>

            {/* Low */}
            <Link
              href={`/${data.workspaceId}/invoices?view=smart-low-risk`}
              className="flex flex-col rounded-lg border border-yellow-200 bg-gradient-to-br from-yellow-50 to-yellow-100/50 p-4 hover:border-yellow-300 transition-colors"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="inline-flex items-center rounded-full bg-yellow-100 px-2.5 py-0.5 text-xs font-medium text-yellow-700">
                  Low risk
                </span>
              </div>
              <div className="text-xs text-yellow-800 mb-1">
                {data.riskSummary.low.invoices} invoice{data.riskSummary.low.invoices !== 1 ? "s" : ""}
              </div>
              <div className="text-lg font-semibold text-yellow-900">
                {formatMoney(data.riskSummary.low.amount, "USD")}
              </div>
            </Link>
          </div>
        </div>

        {/* Aging Chart */}
        <OverdueAmountChart data={agingChartData} currency="USD" />
      </div>

      {/* Row 3: Tables */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Top Overdue Clients */}
        {data.topOverdueClients.length > 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200">
              <h2 className="text-sm font-semibold text-slate-900">
                Top Overdue Clients
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Clients with the highest overdue amounts
              </p>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs font-medium text-slate-500">
                  <th className="px-4 py-3 text-left">CLIENT</th>
                  <th className="px-4 py-3 text-right">OVERDUE AMOUNT</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.topOverdueClients.map((client) => (
                  <tr
                    key={client.clientId}
                    className="hover:bg-slate-50 transition-colors"
                  >
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {client.clientName}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-red-600">
                      {formatMoney(client.totalOverdueAmount, "USD")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-6">
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <p className="text-sm text-slate-500">No overdue clients</p>
            </div>
          </div>
        )}

        {/* Overdue Invoices */}
        <OverdueInvoicesTable invoices={overdueInvoicesForTable} workspaceId={data.workspaceId} />
      </div>
    </div>
  );
}
