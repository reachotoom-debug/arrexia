import { RevenueOverviewChart } from "@/components/dashboard/RevenueOverviewChart";
import { StatusFunnelChart } from "@/components/dashboard/StatusFunnelChart";
import { ChartEmptyState } from "./ChartEmptyState";
import type { DashboardData } from "../../_types/dashboard";

interface OwnerOverviewViewProps {
  data: DashboardData;
  workspaceId?: string;
}

function hasOwnerOverviewData(data: DashboardData): boolean {
  const funnel = data.ownerOverview?.funnel ?? [];
  const invoicedMonthly = data.series?.invoicedMonthly ?? [];
  const collectedMonthly = data.series?.collectedMonthly ?? [];
  const totalInvoiced12m = data.summary?.totalInvoiced12m ?? 0;
  const totalCollected12m = data.summary?.totalCollected12m ?? 0;

  return (
    totalInvoiced12m > 0 ||
    totalCollected12m > 0 ||
    funnel.some((item) => (item.count ?? 0) > 0 || (item.amount ?? 0) > 0) ||
    invoicedMonthly.some((item) => (item.amount ?? 0) > 0) ||
    collectedMonthly.some((item) => (item.amount ?? 0) > 0)
  );
}

export function OwnerOverviewView({ data, workspaceId }: OwnerOverviewViewProps) {
  const funnel = data.ownerOverview?.funnel ?? [];
  const invoicedMonthly = data.series?.invoicedMonthly ?? [];
  const collectedMonthly = data.series?.collectedMonthly ?? [];
  const totalInvoiced12m = data.summary?.totalInvoiced12m ?? 0;

  if (!hasOwnerOverviewData(data)) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-6">
        <ChartEmptyState
          title="No dashboard data yet"
          description="Create your first client, invoice, or payment to populate owner insights."
          href={workspaceId ? `/${workspaceId}/invoices/new` : undefined}
          actionLabel={workspaceId ? "Create invoice" : undefined}
        />
      </div>
    );
  }

  const revenueChartData = invoicedMonthly.map((inv, idx) => {
    const collected = collectedMonthly[idx]?.amount ?? 0;
    const monthLabel = inv.month
      ? new Date(`${inv.month}-01`).toLocaleDateString("en-US", { month: "short" })
      : "—";

    return {
      month: monthLabel,
      invoiced: inv.amount ?? 0,
      collected,
    };
  });

  const funnelChartData = funnel.map((item) => ({
    status: item.status ?? "draft",
    count: item.count ?? 0,
    amount: item.amount ?? 0,
  }));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <RevenueOverviewChart
          data={revenueChartData}
          workspaceId={workspaceId}
          totalInvoiced={totalInvoiced12m}
          paymentsCount={0}
        />
        <StatusFunnelChart data={funnelChartData} workspaceId={workspaceId} />
      </div>
    </div>
  );
}
