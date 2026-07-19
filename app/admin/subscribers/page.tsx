import { guardFullAdminConsoleAccess, renderAdminSetupScreen } from "@/lib/admin/adminPageGate";
import { getFounderSubscribersData } from "@/lib/admin/getAdminDashboardData";
import { AdminDateTimeCell } from "@/components/admin/AdminDateTimeCell";
import { AdminPageShell } from "../_components/AdminPageShell";
import { AdminCard, PlanBadge, formatAdminCurrency, formatAdminDate } from "../_components/adminUtils";
import { ChangeWorkspacePlanForm } from "../_components/ChangeWorkspacePlanForm";

export default async function AdminSubscribersPage() {
  const gate = await guardFullAdminConsoleAccess();
  if (!gate.ok) {
    if (!gate.access) return null;
    return renderAdminSetupScreen(gate.access);
  }
  const access = gate.access;

  const subscribers = await getFounderSubscribersData();

  return (
    <AdminPageShell
      title="Subscribers"
      description="Workspace plan assignments and subscription status."
      adminEmail={access.user.email}
      adminRole={access.role}
      bootstrapAllowed={access.bootstrapAllowed}
    >
      <AdminCard className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Owner</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Workspace</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Plan</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Status</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Trial ends</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Renewal</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Est. MRR</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Last sign in</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Change plan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {subscribers.map((row) => (
                <tr key={row.workspaceId}>
                  <td className="px-4 py-3 text-slate-900">{row.userEmail ?? "—"}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">{row.workspaceName}</div>
                    <div className="text-xs text-slate-500">{row.workspaceId.slice(0, 8)}…</div>
                  </td>
                  <td className="px-4 py-3"><PlanBadge plan={row.plan} /></td>
                  <td className="px-4 py-3 capitalize text-slate-600">{row.subscriptionStatus}</td>
                  <td className="px-4 py-3 text-slate-600">{formatAdminDate(row.trialEndsAt)}</td>
                  <td className="px-4 py-3 text-slate-600">{formatAdminDate(row.renewalDate)}</td>
                  <td className="px-4 py-3 text-slate-900">{formatAdminCurrency(row.estimatedMonthlyValue)}</td>
                  <td className="px-4 py-3 text-slate-600">
                    <AdminDateTimeCell value={row.lastSignInAt} />
                  </td>
                  <td className="px-4 py-3">
                    <ChangeWorkspacePlanForm workspaceId={row.workspaceId} currentPlan={row.plan} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </AdminCard>
    </AdminPageShell>
  );
}
