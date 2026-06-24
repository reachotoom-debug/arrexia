import { guardFullAdminConsoleAccess, renderAdminSetupScreen } from "@/lib/admin/adminPageGate";
import { getFounderRenewalsData } from "@/lib/admin/getAdminDashboardData";
import { AdminPageShell } from "../_components/AdminPageShell";
import { AdminCard, formatAdminDate } from "../_components/adminUtils";
import { AdminRenewalActions } from "../_components/AdminRenewalActions";
import type { FounderRenewalAlert } from "@/lib/admin/getAdminDashboardData";

function RenewalTable({
  title,
  rows,
}: {
  title: string;
  rows: FounderRenewalAlert[];
}) {
  return (
    <AdminCard className="overflow-hidden">
      <div className="border-b border-slate-200 px-4 py-3">
        <h2 className="text-base font-semibold text-slate-900">{title}</h2>
      </div>
      {rows.length === 0 ? (
        <p className="px-4 py-6 text-sm text-slate-500">None right now.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Workspace</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Owner</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Plan</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Trial ends</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Renewal</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {rows.map((row) => (
                <tr key={`${row.alertType}-${row.workspaceId}`}>
                  <td className="px-4 py-3 text-slate-900">{row.workspaceName}</td>
                  <td className="px-4 py-3 text-slate-600">{row.ownerEmail ?? "—"}</td>
                  <td className="px-4 py-3 capitalize text-slate-600">{row.plan}</td>
                  <td className="px-4 py-3 text-slate-600">{formatAdminDate(row.trialEndsAt)}</td>
                  <td className="px-4 py-3 text-slate-600">{formatAdminDate(row.renewalDate)}</td>
                  <td className="px-4 py-3">
                    <AdminRenewalActions workspaceId={row.workspaceId} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AdminCard>
  );
}

export default async function AdminRenewalsPage() {
  const gate = await guardFullAdminConsoleAccess();
  if (!gate.ok) {
    if (!gate.access) return null;
    return renderAdminSetupScreen(gate.access);
  }
  const access = gate.access;

  const data = await getFounderRenewalsData();

  return (
    <AdminPageShell
      title="Renewals"
      description="Trial and subscription renewal tracking (manual billing)."
      adminEmail={access.user.email}
      adminRole={access.role}
      bootstrapAllowed={access.bootstrapAllowed}
    >
      <div className="space-y-6">
        <RenewalTable title="Trials ending in 3 days" rows={data.trialsEnding3Days} />
        <RenewalTable title="Trials ending in 7 days" rows={data.trialsEnding7Days} />
        <RenewalTable title="Subscriptions expiring in 7 days" rows={data.expiring7Days} />
        <RenewalTable title="Past due" rows={data.pastDue} />
        <RenewalTable title="Cancelled" rows={data.cancelled} />
      </div>
    </AdminPageShell>
  );
}
