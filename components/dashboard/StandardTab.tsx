import { formatCurrency } from "@/lib/format/currency";
import { OverdueAmountChart } from "@/app/[workspaceId]/dashboard/_components/OverdueAmountChart";
import { RevenueOverviewChart } from "./RevenueOverviewChart";
import { RecentActivityTable } from "./RecentActivityTable";
import { UpcomingDueTable } from "./UpcomingDueTable";
import type {
  DashboardSummary,
  AgingBucket,
  MonthlySeriesPoint,
  ActivityItem,
  UpcomingDueItem,
} from "@/app/[workspaceId]/dashboard/_types/dashboard";

interface StandardTabProps {
  summary: DashboardSummary;
  agingBuckets: AgingBucket[];
  monthlySeries: MonthlySeriesPoint[];
  recentActivity: ActivityItem[];
  upcomingDue: UpcomingDueItem[];
  workspaceId: string;
}

export function StandardTab({
  summary,
  agingBuckets,
  monthlySeries,
  recentActivity,
  upcomingDue,
  workspaceId,
}: StandardTabProps) {
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
      formattedAmount: formatCurrency(bucket.amount, { currency: "USD" }),
    };
  });

  // Convert monthly series for revenue chart (last 6-12 months)
  const revenueChartData = monthlySeries.slice(-12).map((point) => ({
    month: new Date(point.month + "-01").toLocaleDateString("en-US", { month: "short" }),
    invoiced: point.invoiced,
    collected: point.collected,
  }));

  return (
    <div className="space-y-6">
      {/* Row 1: Charts */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <OverdueAmountChart data={agingChartData} currency="USD" />
        <RevenueOverviewChart data={revenueChartData} />
      </div>

      {/* Row 2: Tables */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <RecentActivityTable activities={recentActivity} workspaceId={workspaceId} />
        <UpcomingDueTable invoices={upcomingDue} workspaceId={workspaceId} />
      </div>
    </div>
  );
}
