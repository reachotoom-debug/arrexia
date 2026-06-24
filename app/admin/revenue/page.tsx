import { guardFullAdminConsoleAccess, renderAdminSetupScreen } from "@/lib/admin/adminPageGate";
import { getFounderRevenueData } from "@/lib/admin/getAdminDashboardData";
import { AdminPageShell } from "../_components/AdminPageShell";
import { AdminMetricCard } from "../_components/AdminMetricCard";
import { AdminCard, formatAdminCurrency, formatPercent, PlanBadge } from "../_components/adminUtils";

export default async function AdminRevenuePage() {
  const gate = await guardFullAdminConsoleAccess();
  if (!gate.ok) {
    if (!gate.access) return null;
    return renderAdminSetupScreen(gate.access);
  }
  const access = gate.access;

  const data = await getFounderRevenueData();

  return (
    <AdminPageShell
      title="Revenue"
      description="Estimated SaaS revenue from assigned plans."
      adminEmail={access.user.email}
      adminRole={access.role}
      bootstrapAllowed={access.bootstrapAllowed}
    >
      <AdminCard className="mb-6 border-indigo-100 bg-indigo-50 p-4">
        <p className="text-sm text-indigo-900">{data.revenueDisclaimer}</p>
      </AdminCard>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <AdminMetricCard label="Estimated MRR" value={formatAdminCurrency(data.estimatedMrr)} variant="primary" accent="indigo" />
        <AdminMetricCard label="Estimated ARR" value={formatAdminCurrency(data.estimatedArr)} />
        <AdminMetricCard label="New MRR Today" value={formatAdminCurrency(data.newMrrToday)} />
        <AdminMetricCard label="New MRR This Month" value={formatAdminCurrency(data.newMrrThisMonth)} />
        <AdminMetricCard label="New MRR This Year" value={formatAdminCurrency(data.newMrrThisYear)} />
        <AdminMetricCard label="ARPU" value={formatAdminCurrency(data.arpu)} />
        <AdminMetricCard label="Free → Paid" value={formatPercent(data.freeToPaidConversion)} />
      </div>

      <AdminCard className="mt-6 overflow-hidden">
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 className="text-base font-semibold text-slate-900">MRR by plan</h2>
        </div>
        <div className="grid gap-4 p-4 sm:grid-cols-3">
          {data.mrrByPlan.map((row) => (
            <div key={row.plan} className="rounded-lg border border-slate-200 p-4">
              <PlanBadge plan={row.plan} />
              <p className="mt-3 text-2xl font-semibold text-slate-900">
                {formatAdminCurrency(row.mrr)}
              </p>
              <p className="mt-1 text-sm text-slate-500">{row.count} workspaces</p>
            </div>
          ))}
        </div>
      </AdminCard>
    </AdminPageShell>
  );
}
