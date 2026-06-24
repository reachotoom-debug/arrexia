import { formatCurrency } from "@/lib/format/currency";
import { OverdueAmountChart } from "./OverdueAmountChart";
import { RevenueOverviewChart } from "@/components/dashboard/RevenueOverviewChart";
import type { DashboardSeries } from "../../_types/dashboard";

interface HealthChartsRowProps {
  series: DashboardSeries;
  workspaceId?: string;
  totalInvoiced?: number;
  paymentsCount?: number;
}

export function HealthChartsRow({ series, workspaceId, totalInvoiced, paymentsCount }: HealthChartsRowProps) {
  // Convert aging buckets for chart
  const agingChartData = series.agingBuckets.map((bucket) => {
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
      formattedAmount: formatCurrency(bucket.amount, { currency: "USD" }),
    };
  });

  // Convert monthly series for revenue chart
  const revenueChartData = series.invoicedMonthly.map((inv, idx) => {
    const collected = series.collectedMonthly[idx]?.amount ?? 0;
    return {
      month: new Date(inv.month + "-01").toLocaleDateString("en-US", { month: "short" }),
      invoiced: inv.amount,
      collected,
    };
  });

  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
      <OverdueAmountChart data={agingChartData} currency="USD" workspaceId={workspaceId} />
      <RevenueOverviewChart 
        data={revenueChartData}
        workspaceId={workspaceId}
        totalInvoiced={totalInvoiced}
        paymentsCount={paymentsCount}
      />
    </div>
  );
}
