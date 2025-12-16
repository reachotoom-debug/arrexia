import { formatMoney } from "@/lib/invoices/utils";
import { KPI } from "@/app/[workspaceId]/dashboard/_components/KPI";
import { RevenueOverviewChart } from "./RevenueOverviewChart";
import { StatusFunnelChart } from "./StatusFunnelChart";
import { BestClientsTable } from "./BestClientsTable";
import { ProblemClientsTable } from "./ProblemClientsTable";
import type {
  DashboardSummary,
  MonthlySeriesPoint,
  ClientPerformanceRow,
} from "@/app/[workspaceId]/dashboard/_types/dashboard";
import { FileText, DollarSign, TrendingUp, Calendar } from "lucide-react";

interface OwnerOverviewTabProps {
  summary: DashboardSummary;
  monthlySeries: MonthlySeriesPoint[];
  bestClients: ClientPerformanceRow[];
  problemClients: ClientPerformanceRow[];
  invoiceStatusFunnel: Array<{ status: string; count: number; amount: number }>;
  workspaceId: string;
}

export function OwnerOverviewTab({
  summary,
  monthlySeries,
  bestClients,
  problemClients,
  invoiceStatusFunnel,
  workspaceId,
}: OwnerOverviewTabProps) {
  // Calculate owner-specific metrics from monthly series
  const last30DaysInvoiced = monthlySeries
    .filter((point) => {
      const monthDate = new Date(point.month + "-01");
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      return monthDate >= thirtyDaysAgo;
    })
    .reduce((sum, point) => sum + point.invoiced, 0);

  const last30DaysCollected = monthlySeries
    .filter((point) => {
      const monthDate = new Date(point.month + "-01");
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      return monthDate >= thirtyDaysAgo;
    })
    .reduce((sum, point) => sum + point.collected, 0);

  const invoicesLast90Days = monthlySeries
    .filter((point) => {
      const monthDate = new Date(point.month + "-01");
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
      return monthDate >= ninetyDaysAgo;
    });

  const invoiced90d = invoicesLast90Days.reduce((sum, point) => sum + point.invoiced, 0);
  const collected90d = invoicesLast90Days.reduce((sum, point) => sum + point.collected, 0);
  const collectionRate90d = invoiced90d > 0 ? collected90d / invoiced90d : 0;

  // Convert monthly series for chart
  const revenueChartData = monthlySeries.slice(-12).map((point) => ({
    month: new Date(point.month + "-01").toLocaleDateString("en-US", { month: "short" }),
    invoiced: point.invoiced,
    collected: point.collected,
  }));

  return (
    <div className="space-y-6">
      {/* Owner-specific KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KPI
          label="Total invoiced"
          value={formatMoney(last30DaysInvoiced, "USD")}
          subtext="Last 30 days"
          icon={FileText}
          iconBgColor="bg-blue-100"
        />
        <KPI
          label="Total collected"
          value={formatMoney(last30DaysCollected, "USD")}
          subtext="Last 30 days"
          icon={DollarSign}
          iconBgColor="bg-emerald-100"
        />
        <KPI
          label="Collection rate"
          value={`${(collectionRate90d * 100).toFixed(1)}%`}
          subtext="Last 90 days"
          icon={TrendingUp}
          iconBgColor="bg-blue-100"
        />
        <KPI
          label="Average days to pay"
          value={summary.dso !== null ? `${summary.dso}` : "—"}
          subtext="DSO"
          icon={Calendar}
          iconBgColor="bg-slate-100"
        />
      </div>

      {/* Row 1: Core Charts */}
      <div className="grid gap-6 md:grid-cols-2">
        <RevenueOverviewChart data={revenueChartData} />
        <StatusFunnelChart data={invoiceStatusFunnel} />
      </div>

      {/* Row 2: Client Tables */}
      <div className="grid gap-6 md:grid-cols-2">
        <BestClientsTable clients={bestClients} />
        <ProblemClientsTable clients={problemClients} />
      </div>
    </div>
  );
}
