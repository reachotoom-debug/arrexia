import { guardFullAdminConsoleAccess, renderAdminSetupScreen } from "@/lib/admin/adminPageGate";
import { getFounderOverviewData } from "@/lib/admin/getAdminDashboardData";
import { AdminPageShell } from "./_components/AdminPageShell";
import { AdminMetricCard } from "./_components/AdminMetricCard";
import { AdminCard } from "./_components/adminUtils";
import { formatAdminCurrency, formatPercent } from "./_components/adminUtils";

export default async function AdminOverviewPage() {
  const gate = await guardFullAdminConsoleAccess();
  if (!gate.ok) {
    if (!gate.access) return null;
    return renderAdminSetupScreen(gate.access);
  }
  const access = gate.access;

  const data = await getFounderOverviewData();

  return (
    <AdminPageShell
      title="Overview"
      description="Arrexia SaaS business metrics. No customer financial data."
      adminEmail={access.user.email}
      adminRole={access.role}
      bootstrapAllowed={access.bootstrapAllowed}
    >
      <AdminCard className="mb-6 border-indigo-100 bg-indigo-50 p-4">
        <p className="text-sm text-indigo-900">{data.revenueDisclaimer}</p>
      </AdminCard>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <AdminMetricCard label="Total Users" value={String(data.totalUsers)} variant="primary" accent="indigo" />
        <AdminMetricCard label="New Users Today" value={String(data.newUsersToday)} accent="emerald" />
        <AdminMetricCard label="New Users This Month" value={String(data.newUsersThisMonth)} />
        <AdminMetricCard label="New Users This Year" value={String(data.newUsersThisYear)} />
        <AdminMetricCard label="Total Workspaces" value={String(data.totalWorkspaces)} variant="primary" accent="slate" />
        <AdminMetricCard label="Active Workspaces (30d)" value={String(data.activeWorkspaces30d)} accent="emerald" />
        <AdminMetricCard label="Trial Workspaces" value={String(data.trialWorkspaces)} accent="amber" />
        <AdminMetricCard label="Paid Subscribers" value={String(data.paidSubscribers)} accent="indigo" />
        <AdminMetricCard
          label="Estimated MRR"
          value={formatAdminCurrency(data.estimatedMrr)}
          variant="primary"
          accent="indigo"
        />
        <AdminMetricCard label="Estimated ARR" value={formatAdminCurrency(data.estimatedArr)} />
        <AdminMetricCard label="Conversion Rate" value={formatPercent(data.conversionRate)} />
        <AdminMetricCard label="Churned Workspaces" value={String(data.churnedWorkspaces)} accent="amber" />
      </div>
    </AdminPageShell>
  );
}
