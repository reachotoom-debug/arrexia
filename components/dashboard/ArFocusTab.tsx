import { formatMoney } from "@/lib/invoices/utils";
import { KPI } from "@/app/[workspaceId]/dashboard/_components/KPI";
import { OverdueAmountChart } from "@/app/[workspaceId]/dashboard/_components/OverdueAmountChart";
import { OverdueTrendChart } from "@/app/[workspaceId]/dashboard/_components/OverdueTrendChart";
import { ReminderPerformanceChart } from "./ReminderPerformanceChart";
import { TopOverdueClientsTable } from "./TopOverdueClientsTable";
import { OverdueInvoicesTable } from "@/app/[workspaceId]/dashboard/_components/OverdueInvoicesTable";
import Link from "next/link";
import type {
  DashboardSummary,
  RiskCluster,
  AgingBucket,
  ClientArRow,
  OverdueInvoiceRow,
  MonthlySeriesPoint,
  ReminderPerformanceRow,
} from "@/app/[workspaceId]/dashboard/_types/dashboard";
import { AlertTriangle, Target, FileText } from "lucide-react";

interface ArFocusTabProps {
  summary: DashboardSummary;
  riskClusters: RiskCluster[];
  agingBuckets: AgingBucket[];
  topOverdueClients: ClientArRow[];
  topOverdueInvoices: OverdueInvoiceRow[];
  overdueTrend: MonthlySeriesPoint[];
  reminderPerformance: ReminderPerformanceRow[];
  workspaceId: string;
}

export function ArFocusTab({
  summary,
  riskClusters,
  agingBuckets,
  topOverdueClients,
  topOverdueInvoices,
  overdueTrend,
  reminderPerformance,
  workspaceId,
}: ArFocusTabProps) {
  const overdueInvoiceCount = topOverdueInvoices.length;

  // Convert aging buckets for chart
  const agingChartData = agingBuckets.map((bucket) => {
    const keyMap: Record<string, string> = {
      "0–30 days": "d0_30",
      "31–60 days": "d31_60",
      "61–90 days": "d61_90",
      "90+ days": "d90_plus",
    };
    return {
      label: bucket.label,
      key: keyMap[bucket.label] || bucket.label.replace(/[^a-z0-9]/gi, "_"),
      amount: bucket.amount,
      formattedAmount: formatMoney(bucket.amount, "USD"),
    };
  });

  // Convert overdue trend for chart
  const trendChartData = overdueTrend.map((point) => ({
    month: new Date(point.month + "-01").toLocaleDateString("en-US", { month: "short" }),
    overdueAmount: point.overdue,
  }));

  // Convert overdue invoices for table
  const overdueInvoicesForTable = topOverdueInvoices.map((inv) => ({
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
      {/* Top row: AR-specific KPIs */}
      <div className="grid gap-4 md:grid-cols-3">
        <KPI
          label="Overdue Amount"
          value={formatMoney(summary.overdueAmount, "USD")}
          icon={AlertTriangle}
          iconBgColor="bg-red-100"
        />
        <KPI
          label="High-Risk Exposure"
          value={formatMoney(summary.highRiskExposure, "USD")}
          icon={Target}
          iconBgColor="bg-red-100"
        />
        <KPI
          label="Overdue Invoices"
          value={overdueInvoiceCount}
          icon={FileText}
          iconBgColor="bg-amber-100"
        />
      </div>

      {/* Row 1: Risk Overview + Aging Chart */}
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
                {riskClusters.find((r) => r.risk === "high")?.invoiceCount ?? 0} invoice
                {(riskClusters.find((r) => r.risk === "high")?.invoiceCount ?? 0) !== 1 ? "s" : ""}
              </div>
              <div className="text-lg font-semibold text-red-900">
                {formatMoney(
                  riskClusters.find((r) => r.risk === "high")?.amount ?? 0,
                  "USD"
                )}
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
                {riskClusters.find((r) => r.risk === "medium")?.invoiceCount ?? 0} invoice
                {(riskClusters.find((r) => r.risk === "medium")?.invoiceCount ?? 0) !== 1 ? "s" : ""}
              </div>
              <div className="text-lg font-semibold text-amber-900">
                {formatMoney(
                  riskClusters.find((r) => r.risk === "medium")?.amount ?? 0,
                  "USD"
                )}
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
                {riskClusters.find((r) => r.risk === "low")?.invoiceCount ?? 0} invoice
                {(riskClusters.find((r) => r.risk === "low")?.invoiceCount ?? 0) !== 1 ? "s" : ""}
              </div>
              <div className="text-lg font-semibold text-yellow-900">
                {formatMoney(
                  riskClusters.find((r) => r.risk === "low")?.amount ?? 0,
                  "USD"
                )}
              </div>
            </Link>
          </div>
        </div>

        {/* Aging Chart */}
        <OverdueAmountChart data={agingChartData} currency="USD" />
      </div>

      {/* Row 2: Tables */}
      <div className="grid gap-6 md:grid-cols-2">
        <TopOverdueClientsTable clients={topOverdueClients} />
        <OverdueInvoicesTable invoices={overdueInvoicesForTable} workspaceId={workspaceId} />
      </div>

      {/* Row 3: Charts */}
      <div className="grid gap-6 md:grid-cols-2">
        <OverdueTrendChart data={trendChartData} />
        <ReminderPerformanceChart data={reminderPerformance} />
      </div>
    </div>
  );
}
