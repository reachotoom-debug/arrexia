import { requireWorkspace } from "@/lib/auth/server";
import { getEligibleReminders } from "@/lib/reminders/getEligibleReminders";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getDashboardCurrencies, getDashboardData, getDashboardSummary } from "./_utils/dataLoader";
import {
  DASHBOARD_VIEW_LABELS,
  resolveDashboardView,
  type DashboardView,
} from "./_utils/dashboardViews";
import { DashboardKpiRow } from "./_components/DashboardKpiRow";
import { DashboardInsight } from "./_components/DashboardInsight";
import { ArFocusView } from "./_components/ArFocusView";
import { OwnerOverviewView } from "./_components/OwnerOverviewView";
import { DailyActionCenterCta } from "./_components/DailyActionCenterCta";
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
  await requireWorkspace(workspaceId);

  const resolvedSearchParams = (await searchParams) || {};
  const viewParam =
    typeof resolvedSearchParams.view === "string"
      ? resolvedSearchParams.view
      : "standard";

  if (viewParam === "collections-mode") {
    redirect(`/${workspaceId}/dashboard?view=standard`);
  }

  const { view } = resolveDashboardView(viewParam);
  const isOverview = view === "standard";

  const currencies = await getDashboardCurrencies(workspaceId);
  const [scopes, eligibleReminders] = await Promise.all([
    Promise.all(currencies.map(async currency => ({
      currency,
      dashboardSummary: await getDashboardSummary(workspaceId, currency),
      dashboardData: isOverview ? null : await getDashboardData(workspaceId, currency),
    }))),
    isOverview ? getEligibleReminders(workspaceId) : Promise.resolve([]),
  ]);

  const buildTabUrl = (tabView: DashboardView) => {
    const params = new URLSearchParams();
    params.set("view", tabView);
    return `/${workspaceId}/dashboard?${params.toString()}`;
  };

  const sectionHeader = {
    standard: {
      title: "Receivables Overview",
      description: "Issued, non-archived invoice balances across all client statuses",
    },
    "ar-focus": {
      title: "Collection Priorities",
      description: "Overdue ledger balances across all client statuses; operational queues use active clients",
    },
    "owner-overview": {
      title: "Performance Snapshot",
      description: "Trends, efficiency, and collection performance",
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
        {(["standard", "ar-focus", "owner-overview"] as const).map((tabView) => (
          <Link
            key={tabView}
            href={buildTabUrl(tabView)}
            className={dashboardTabClass(view === tabView)}
          >
            {DASHBOARD_VIEW_LABELS[tabView]}
          </Link>
        ))}
      </ScrollTabStrip>

      {isOverview && <DailyActionCenterCta workspaceId={workspaceId} remindersReadyCount={eligibleReminders.length} />}

      {scopes.map(({ currency, dashboardSummary, dashboardData }) => (
        <section key={currency} className="space-y-6">
          {currencies.length > 1 && <h3 className="text-lg font-semibold">{currency} · amounts shown separately, without conversion</h3>}
      {view === "standard" && (
        <section className="mt-6 space-y-6">
          <DashboardKpiRow summary={dashboardSummary} showPaymentsLast30Days />
          <DashboardInsight summary={dashboardSummary} workspaceId={workspaceId} />
        </section>
      )}

      {view === "ar-focus" && dashboardData && (
        <ArFocusView data={dashboardData} workspaceId={workspaceId} />
      )}

      {view === "owner-overview" && dashboardData && (
        <OwnerOverviewView data={dashboardData} workspaceId={workspaceId} />
      )}
        </section>
      ))}
    </div>
  );
}
