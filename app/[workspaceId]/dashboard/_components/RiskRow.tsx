import { formatMoney } from "@/lib/invoices/utils";
import { OverdueTrendChart } from "./OverdueTrendChart";
import type { RiskOverview, DashboardSeries } from "../../_types/dashboard";
import Link from "next/link";

interface RiskRowProps {
  risk: RiskOverview;
  series: DashboardSeries;
  workspaceId: string;
}

export function RiskRow({ risk, series, workspaceId }: RiskRowProps) {
  // Convert overdue monthly for trend chart
  const trendChartData = series.overdueMonthly.map((point) => ({
    monthLabel: new Date(point.month + "-01").toLocaleDateString("en-US", { month: "short" }),
    overdueAmount: point.amount,
  }));

  return (
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
              {risk.high.invoiceCount} invoice{risk.high.invoiceCount !== 1 ? "s" : ""}
            </div>
            <div className="text-lg font-semibold text-red-900">
              {formatMoney(risk.high.amount, "USD")}
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
              {risk.medium.invoiceCount} invoice{risk.medium.invoiceCount !== 1 ? "s" : ""}
            </div>
            <div className="text-lg font-semibold text-amber-900">
              {formatMoney(risk.medium.amount, "USD")}
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
              {risk.low.invoiceCount} invoice{risk.low.invoiceCount !== 1 ? "s" : ""}
            </div>
            <div className="text-lg font-semibold text-yellow-900">
              {formatMoney(risk.low.amount, "USD")}
            </div>
          </Link>
        </div>
      </div>

      {/* Overdue Trend Chart */}
      <OverdueTrendChart data={trendChartData} workspaceId={workspaceId} />
    </div>
  );
}
