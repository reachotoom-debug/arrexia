import { formatCurrency } from "@/lib/format/currency";
import { RevenueOverviewChart } from "@/components/dashboard/RevenueOverviewChart";
import { StatusFunnelChart } from "@/components/dashboard/StatusFunnelChart";
import type { DashboardData } from "../../_types/dashboard";

interface OwnerOverviewViewProps {
  data: DashboardData;
  workspaceId?: string;
}

export function OwnerOverviewView({ data, workspaceId }: OwnerOverviewViewProps) {
  const { funnel } = data.ownerOverview;

  // Convert monthly series for revenue chart
  const revenueChartData = data.series.invoicedMonthly.map((inv, idx) => {
    const collected = data.series.collectedMonthly[idx]?.amount ?? 0;
    return {
      month: new Date(inv.month + "-01").toLocaleDateString("en-US", { month: "short" }),
      invoiced: inv.amount,
      collected,
    };
  });

  return (
    <div className="space-y-6">
      {/* Trends and charts only */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <RevenueOverviewChart 
          data={revenueChartData}
          workspaceId={workspaceId}
          totalInvoiced={data.summary.totalInvoiced12m}
          paymentsCount={0}
        />
        <StatusFunnelChart
          data={funnel.map((f) => ({
            status: f.status,
            count: f.count,
            amount: f.amount,
          }))}
          workspaceId={workspaceId}
        />
      </div>
    </div>
  );
}
