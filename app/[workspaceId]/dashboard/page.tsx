import { requireUser } from "@/lib/auth/server";
import { requireWorkspace } from "@/lib/auth/server";
import { getDashboardData, getDashboardSummary } from "./_utils/dataLoader";
import { PremiumKpiRow } from "./_components/PremiumKpiRow";
import { DashboardInsight } from "./_components/DashboardInsight";
import { HealthChartsRow } from "./_components/HealthChartsRow";
import { StandardActionRow } from "./_components/StandardActionRow";
import { ActivityFeed } from "./_components/ActivityFeed";
import { ArFocusView } from "./_components/ArFocusView";
import { OwnerOverviewView } from "./_components/OwnerOverviewView";
import { CollectionsModeView } from "./_components/CollectionsModeView";
import { formatMoney } from "@/lib/invoices/utils";
import Link from "next/link";

type DashboardPageProps = {
  params: Promise<{
    workspaceId: string;
  }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function DashboardPage({
  params,
  searchParams,
}: DashboardPageProps) {
  const user = await requireUser();
  const resolvedParams = await params;
  const { workspace } = await requireWorkspace(resolvedParams.workspaceId);
  const workspaceId = workspace.id;

  const resolvedSearchParams = (await searchParams) || {};
  const viewParam =
    typeof resolvedSearchParams.view === "string"
      ? resolvedSearchParams.view
      : "standard";

  const view = (["standard", "ar-focus", "owner-overview", "collections-mode"].includes(
    viewParam
  )
    ? viewParam
    : "standard") as "standard" | "ar-focus" | "owner-overview" | "collections-mode";

  // Load all dashboard data
  const dashboardData = await getDashboardData(workspaceId);
  const dashboardSummary = await getDashboardSummary(workspaceId);

  // Build tab URL helper
  const buildTabUrl = (tabView: string) => {
    const params = new URLSearchParams();
    params.set("view", tabView);
    return `/${workspaceId}/dashboard?${params.toString()}`;
  };

  return (
    <div className="max-w-7xl mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Overview of invoices, payments, and collections for your workspace.
        </p>
      </div>

      {/* Premium KPI Row */}
      <PremiumKpiRow summary={dashboardSummary} />

      {/* Tab Navigation */}
      <div className="border-b border-slate-200">
        <nav className="-mb-px flex space-x-8">
          <Link
            href={buildTabUrl("standard")}
            className={`
              whitespace-nowrap border-b-2 px-1 py-4 text-sm font-medium transition-colors
              ${
                view === "standard"
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700"
              }
            `}
          >
            Standard
          </Link>
          <Link
            href={buildTabUrl("ar-focus")}
            className={`
              whitespace-nowrap border-b-2 px-1 py-4 text-sm font-medium transition-colors
              ${
                view === "ar-focus"
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700"
              }
            `}
          >
            AR focus
          </Link>
          <Link
            href={buildTabUrl("owner-overview")}
            className={`
              whitespace-nowrap border-b-2 px-1 py-4 text-sm font-medium transition-colors
              ${
                view === "owner-overview"
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700"
              }
            `}
          >
            Owner overview
          </Link>
          <Link
            href={buildTabUrl("collections-mode")}
            className={`
              whitespace-nowrap border-b-2 px-1 py-4 text-sm font-medium transition-colors
              ${
                view === "collections-mode"
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700"
              }
            `}
          >
            Collections mode
          </Link>
        </nav>
      </div>

      {/* Tab Content */}
      {view === "standard" && (
        <section className="mt-6 space-y-6">
          {/* Single Insight Banner */}
          <DashboardInsight summary={dashboardSummary} />

          {/* ROW 1 – CHARTS */}
          <HealthChartsRow 
            series={dashboardData.series}
            workspaceId={workspaceId}
            totalInvoiced={dashboardSummary.totals.totalInvoiced}
            paymentsCount={0}
          />

          {/* ROW 2 – SMART RISK OVERVIEW (compact) */}
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-4">
            <div className="mb-3">
              <h3 className="text-sm font-semibold text-slate-900">Smart Risk Overview</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Auto-detected clusters of overdue invoices
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {/* High risk */}
              <Link
                href={`/${workspaceId}/invoices?view=smart-high-risk`}
                className="flex flex-col rounded-lg border border-red-200 bg-gradient-to-br from-red-50 to-red-100/50 p-3 hover:border-red-300 transition-colors"
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-700">
                    High risk
                  </span>
                </div>
                <div className="text-[10px] text-red-800 mb-0.5">
                  {dashboardData.riskOverview.high.invoiceCount} invoice{dashboardData.riskOverview.high.invoiceCount !== 1 ? "s" : ""}
                </div>
                <div className="text-base font-semibold text-red-900">
                  {formatMoney(dashboardData.riskOverview.high.amount, "USD")}
                </div>
              </Link>

              {/* Medium */}
              <Link
                href={`/${workspaceId}/invoices?view=smart-medium-risk`}
                className="flex flex-col rounded-lg border border-amber-200 bg-gradient-to-br from-amber-50 to-amber-100/50 p-3 hover:border-amber-300 transition-colors"
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                    Medium risk
                  </span>
                </div>
                <div className="text-[10px] text-amber-800 mb-0.5">
                  {dashboardData.riskOverview.medium.invoiceCount} invoice{dashboardData.riskOverview.medium.invoiceCount !== 1 ? "s" : ""}
                </div>
                <div className="text-base font-semibold text-amber-900">
                  {formatMoney(dashboardData.riskOverview.medium.amount, "USD")}
                </div>
              </Link>

              {/* Low */}
              <Link
                href={`/${workspaceId}/invoices?view=smart-low-risk`}
                className="flex flex-col rounded-lg border border-yellow-200 bg-gradient-to-br from-yellow-50 to-yellow-100/50 p-3 hover:border-yellow-300 transition-colors"
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="inline-flex items-center rounded-full bg-yellow-100 px-2 py-0.5 text-[10px] font-medium text-yellow-700">
                    Low risk
                  </span>
                </div>
                <div className="text-[10px] text-yellow-800 mb-0.5">
                  {dashboardData.riskOverview.low.invoiceCount} invoice{dashboardData.riskOverview.low.invoiceCount !== 1 ? "s" : ""}
                </div>
                <div className="text-base font-semibold text-yellow-900">
                  {formatMoney(dashboardData.riskOverview.low.amount, "USD")}
                </div>
              </Link>
            </div>
          </div>

          {/* ROW 3 – ACTION TABLES */}
          <StandardActionRow
            upcoming={dashboardData.upcomingDue}
            collections={dashboardData.collectionsMode.worklist}
            workspaceId={workspaceId}
          />

          {/* OPTIONAL – RECENT ACTIVITY (LOW PRIORITY SECTION) */}
          <div>
            <ActivityFeed 
              items={dashboardData.recentActivity} 
              workspaceId={workspaceId}
              hasMore={dashboardData.recentActivityHasMore}
            />
          </div>
        </section>
      )}

      {view === "ar-focus" && <ArFocusView data={dashboardData} workspaceId={workspaceId} />}

      {view === "owner-overview" && <OwnerOverviewView data={dashboardData} workspaceId={workspaceId} />}

      {view === "collections-mode" && (
        <CollectionsModeView data={dashboardData.collectionsMode} workspaceId={workspaceId} />
      )}
    </div>
  );
}
