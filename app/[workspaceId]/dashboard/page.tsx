import { requireUser } from "@/lib/auth/server";
import { requireWorkspace } from "@/lib/auth/server";
import { getDashboardData, getDashboardSummary } from "./_utils/dataLoader";
import { DashboardKpiRow } from "./_components/DashboardKpiRow";
import { DashboardInsight } from "./_components/DashboardInsight";
import { ArFocusView } from "./_components/ArFocusView";
import { OwnerOverviewView } from "./_components/OwnerOverviewView";
import { CollectionsModeView } from "./_components/CollectionsModeView";
import Link from "next/link";
import { PageHeader } from "@/components/layout/PageHeader";
import { ScrollTabStrip } from "@/components/layout/ScrollTabStrip";

function dashboardTabClass(active: boolean) {
  return [
    "border-b-2 px-1 py-4 text-sm font-medium transition-colors",
    active
      ? "border-blue-500 text-blue-600"
      : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700",
  ].join(" ");
}

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
  const { workspaceId } = await params;
  const { workspace } = await requireWorkspace(workspaceId);

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

  const dashboardSummary = await getDashboardSummary(workspaceId);
  const dashboardData =
    view === "standard" ? null : await getDashboardData(workspaceId);

  // Build tab URL helper
  const buildTabUrl = (tabView: string) => {
    const params = new URLSearchParams();
    params.set("view", tabView);
    return `/${workspaceId}/dashboard?${params.toString()}`;
  };

  const sectionHeader = {
    standard: {
      title: "Cash Position",
      description: "Includes all invoices, clients, and total exposure",
    },
    "ar-focus": {
      title: "Collection Priorities",
      description: "Active clients only - focus on overdue invoices to act on now",
    },
    "owner-overview": {
      title: "Performance Snapshot",
      description: "Trends, efficiency, and collection performance",
    },
    "collections-mode": {
      title: "Execution Mode",
      description: "Work through overdue invoices and take action",
    },
  }[view];

  return (
    <div className="w-full min-w-0 space-y-4 md:space-y-6">
      <PageHeader
        title="Dashboard"
        description="Overview of invoices, payments, and collections for your workspace."
      />

      <div className="space-y-1">
        <h2 className="text-xl font-semibold tracking-tight text-slate-900">
          {sectionHeader.title}
        </h2>
        <p className="text-sm text-slate-500">{sectionHeader.description}</p>
      </div>

      <ScrollTabStrip aria-label="Dashboard views">
          <Link
            href={buildTabUrl("standard")}
            className={dashboardTabClass(view === "standard")}
          >
            Standard
          </Link>
          <Link
            href={buildTabUrl("ar-focus")}
            className={dashboardTabClass(view === "ar-focus")}
          >
            AR focus
          </Link>
          <Link
            href={buildTabUrl("owner-overview")}
            className={dashboardTabClass(view === "owner-overview")}
          >
            Owner overview
          </Link>
          <Link
            href={buildTabUrl("collections-mode")}
            className={dashboardTabClass(view === "collections-mode")}
          >
            Collections mode
          </Link>
      </ScrollTabStrip>

      {/* Tab Content */}
      {view === "standard" && (
        <section className="mt-6 space-y-6">
          {/* High-level metrics only */}
          <DashboardKpiRow summary={dashboardSummary} showPaymentsLast30Days />
          <DashboardInsight summary={dashboardSummary} />
        </section>
      )}

      {view === "ar-focus" && dashboardData && (
        <ArFocusView data={dashboardData} workspaceId={workspaceId} />
      )}

      {view === "owner-overview" && dashboardData && (
        <OwnerOverviewView data={dashboardData} workspaceId={workspaceId} />
      )}

      {view === "collections-mode" && dashboardData && (
        <CollectionsModeView data={dashboardData.collectionsMode} workspaceId={workspaceId} />
      )}
    </div>
  );
}
