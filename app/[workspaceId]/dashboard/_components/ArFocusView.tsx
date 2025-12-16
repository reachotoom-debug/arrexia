import { formatMoney } from "@/lib/invoices/utils";
import { KPI } from "./KPI";
import { TopOverdueClientsTable } from "./TopOverdueClientsTable";
import { OverdueInvoicesTable } from "./OverdueInvoicesTable";
import { ReminderEffectivenessChart } from "./ReminderEffectivenessChart";
import type { DashboardData } from "../../_types/dashboard";
import { AlertTriangle, Target, FileText } from "lucide-react";
import Link from "next/link";

interface ArFocusViewProps {
  data: DashboardData;
  workspaceId: string;
}

export function ArFocusView({ data, workspaceId }: ArFocusViewProps) {
  const overdueCount = data.arFocus.overdueInvoices.length;

  // Convert aging buckets for chart
  const agingChartData = data.series.agingBuckets.map((bucket) => {
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
  const overdueInvoicesForTable = data.arFocus.overdueInvoices.map((inv) => ({
    id: inv.id,
    invoiceNumber: inv.invoiceNumber,
    clientName: inv.clientName,
    status: "overdue" as const,
    issueDate: null,
    dueDate: inv.dueDate,
    totalAmount: 0,
    amountPaid: 0,
    outstanding: inv.outstanding,
    overdueDays: inv.overdueDays,
    riskLevel: inv.riskLevel,
  }));

  return (
    <div className="space-y-6">
      {/* Top 4 AR-specific KPIs */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KPI
          label="Total Outstanding"
          value={formatMoney(data.summary.totalOutstandingNow, "USD")}
          icon={AlertTriangle}
          iconBgColor="bg-blue-100"
        />
        <KPI
          label="Overdue Amount"
          value={formatMoney(data.summary.overdueAmountNow, "USD")}
          icon={AlertTriangle}
          iconBgColor="bg-red-100"
        />
        <KPI
          label="High-Risk Exposure"
          value={formatMoney(data.summary.highRiskExposureNow, "USD")}
          icon={Target}
          iconBgColor="bg-red-100"
        />
        <KPI
          label="Overdue Invoices"
          value={overdueCount}
          icon={FileText}
          iconBgColor="bg-amber-100"
        />
      </div>

      {/* Smart Risk Overview + Reminder Effectiveness Chart */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Smart Risk Overview */}
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-6">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Smart Risk Overview</h3>
              <p className="text-xs text-muted-foreground mt-1">
                Auto-detected clusters of overdue invoices
              </p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            {/* High risk */}
            <Link
              href={`/${workspaceId}/invoices?view=smart-high-risk`}
              className="flex flex-col rounded-lg border border-red-200 bg-gradient-to-br from-red-50 to-red-100/50 p-4 hover:border-red-300 transition-colors"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-700">
                  High risk
                </span>
              </div>
              <div className="text-xs text-red-800 mb-1">
                {data.riskOverview.high.invoiceCount} invoice{data.riskOverview.high.invoiceCount !== 1 ? "s" : ""}
              </div>
              <div className="text-lg font-semibold text-red-900">
                {formatMoney(data.riskOverview.high.amount, "USD")}
              </div>
            </Link>

            {/* Medium */}
            <Link
              href={`/${workspaceId}/invoices?view=smart-medium-risk`}
              className="flex flex-col rounded-lg border border-amber-200 bg-gradient-to-br from-amber-50 to-amber-100/50 p-4 hover:border-amber-300 transition-colors"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700">
                  Medium risk
                </span>
              </div>
              <div className="text-xs text-amber-800 mb-1">
                {data.riskOverview.medium.invoiceCount} invoice{data.riskOverview.medium.invoiceCount !== 1 ? "s" : ""}
              </div>
              <div className="text-lg font-semibold text-amber-900">
                {formatMoney(data.riskOverview.medium.amount, "USD")}
              </div>
            </Link>

            {/* Low */}
            <Link
              href={`/${workspaceId}/invoices?view=smart-low-risk`}
              className="flex flex-col rounded-lg border border-yellow-200 bg-gradient-to-br from-yellow-50 to-yellow-100/50 p-4 hover:border-yellow-300 transition-colors"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="inline-flex items-center rounded-full bg-yellow-100 px-2.5 py-0.5 text-xs font-medium text-yellow-700">
                  Low risk
                </span>
              </div>
              <div className="text-xs text-yellow-800 mb-1">
                {data.riskOverview.low.invoiceCount} invoice{data.riskOverview.low.invoiceCount !== 1 ? "s" : ""}
              </div>
              <div className="text-lg font-semibold text-yellow-900">
                {formatMoney(data.riskOverview.low.amount, "USD")}
              </div>
            </Link>
          </div>
        </div>

        {/* Reminder Effectiveness Chart */}
        <ReminderEffectivenessChart
          data={data.reminderEffectiveness}
          workspaceId={workspaceId}
        />
      </div>

      {/* Tables */}
      <div className="grid gap-6 md:grid-cols-2">
        <TopOverdueClientsTable 
          clients={data.arFocus.topOverdueClients} 
          hasMore={data.arFocus.topOverdueClientsHasMore}
          workspaceId={workspaceId}
        />
        <OverdueInvoicesTable 
          invoices={overdueInvoicesForTable} 
          workspaceId={workspaceId}
          hasMore={data.arFocus.overdueInvoicesHasMore}
        />
      </div>
    </div>
  );
}
