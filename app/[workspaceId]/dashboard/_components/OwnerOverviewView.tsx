import { formatMoney } from "@/lib/invoices/utils";
import { KPI } from "./KPI";
import { RevenueOverviewChart } from "@/components/dashboard/RevenueOverviewChart";
import { StatusFunnelChart } from "@/components/dashboard/StatusFunnelChart";
import { BestClientsTable } from "./BestClientsTable";
import { ProblemClientsTable } from "./ProblemClientsTable";
import type { DashboardData } from "../../_types/dashboard";
import { FileText, DollarSign, TrendingUp, Calendar } from "lucide-react";

interface OwnerOverviewViewProps {
  data: DashboardData;
  workspaceId?: string;
}

export function OwnerOverviewView({ data, workspaceId }: OwnerOverviewViewProps) {
  const { last30, funnel, bestClients, problemClients } = data.ownerOverview;

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
      {/* Owner-specific KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KPI
          label="Total invoiced"
          value={formatMoney(last30.totalInvoiced, "USD")}
          subtext="Last 30 days"
          icon={FileText}
          iconBgColor="bg-blue-100"
        />
        <KPI
          label="Total collected"
          value={formatMoney(last30.totalCollected, "USD")}
          subtext="Last 30 days"
          icon={DollarSign}
          iconBgColor="bg-emerald-100"
        />
        <KPI
          label="Collection rate"
          value={
            last30.collectionRate !== null
              ? `${(last30.collectionRate * 100).toFixed(1)}%`
              : "—"
          }
          subtext="Last 30 days"
          icon={TrendingUp}
          iconBgColor="bg-blue-100"
        />
        <KPI
          label="Average days to pay"
          value={last30.dso !== null ? `${last30.dso}` : "—"}
          subtext="DSO"
          icon={Calendar}
          iconBgColor="bg-slate-100"
        />
      </div>

      {/* Charts */}
      <div className="grid gap-6 md:grid-cols-2">
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

      {/* Client Tables */}
      <div className="grid gap-6 md:grid-cols-2">
        <BestClientsTable 
          clients={bestClients} 
          hasMore={data.ownerOverview.bestClientsHasMore}
          workspaceId={workspaceId || ""}
        />
        <ProblemClientsTable 
          clients={problemClients} 
          hasMore={data.ownerOverview.problemClientsHasMore}
          workspaceId={workspaceId || ""}
        />
      </div>
    </div>
  );
}
