import { guardFullAdminConsoleAccess, renderAdminSetupScreen } from "@/lib/admin/adminPageGate";
import { getFounderEmailOpsData } from "@/lib/admin/getAdminDashboardData";
import { AdminPageShell } from "../_components/AdminPageShell";
import { AdminMetricCard } from "../_components/AdminMetricCard";
import { AdminCard, formatAdminDateTime } from "../_components/adminUtils";

export default async function AdminEmailOpsPage() {
  const gate = await guardFullAdminConsoleAccess();
  if (!gate.ok) {
    if (!gate.access) return null;
    return renderAdminSetupScreen(gate.access);
  }
  const access = gate.access;

  const data = await getFounderEmailOpsData();

  return (
    <AdminPageShell
      title="Email Ops"
      description="Platform email delivery counts (no message bodies)."
      adminEmail={access.user.email}
      adminRole={access.role}
      bootstrapAllowed={access.bootstrapAllowed}
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <AdminMetricCard label="Sent Today" value={String(data.sentToday)} accent="emerald" />
        <AdminMetricCard label="Sent This Month" value={String(data.sentThisMonth)} />
        <AdminMetricCard label="Failed (recent logs)" value={String(data.failedCount)} accent="amber" />
        <AdminMetricCard label="Invoice Emails" value={String(data.invoiceEmailsSent)} />
        <AdminMetricCard label="Reminder Emails" value={String(data.reminderEmailsSent)} />
      </div>

      <AdminCard className="mt-6 overflow-hidden">
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 className="text-base font-semibold text-slate-900">Last 20 email events</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-slate-600">When</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Type</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Status</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Recipient</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Subject</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {data.recentEvents.map((event) => (
                <tr key={`${event.type}-${event.id}`}>
                  <td className="px-4 py-3 text-slate-600">{formatAdminDateTime(event.createdAt)}</td>
                  <td className="px-4 py-3 capitalize text-slate-900">{event.type}</td>
                  <td className="px-4 py-3 capitalize text-slate-600">{event.status}</td>
                  <td className="px-4 py-3 text-slate-600">{event.recipientEmail ?? "—"}</td>
                  <td className="max-w-xs truncate px-4 py-3 text-slate-600">{event.subject ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </AdminCard>
    </AdminPageShell>
  );
}
