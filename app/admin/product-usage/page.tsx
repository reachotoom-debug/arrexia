import { guardFullAdminConsoleAccess, renderAdminSetupScreen } from "@/lib/admin/adminPageGate";
import { getFounderProductUsageData } from "@/lib/admin/getAdminDashboardData";
import { AdminPageShell } from "../_components/AdminPageShell";
import { AdminMetricCard } from "../_components/AdminMetricCard";

export default async function AdminProductUsagePage() {
  const gate = await guardFullAdminConsoleAccess();
  if (!gate.ok) {
    if (!gate.access) return null;
    return renderAdminSetupScreen(gate.access);
  }
  const access = gate.access;

  const data = await getFounderProductUsageData();

  return (
    <AdminPageShell
      title="Product Usage"
      description="Aggregate platform usage counts only."
      adminEmail={access.user.email}
      adminRole={access.role}
      bootstrapAllowed={access.bootstrapAllowed}
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <AdminMetricCard label="Invoices Created" value={String(data.invoicesCreatedCount)} variant="primary" />
        <AdminMetricCard label="Reminders Sent" value={String(data.remindersSentCount)} />
        <AdminMetricCard label="Clients Created" value={String(data.clientsCreatedCount)} />
        <AdminMetricCard label="Payments Recorded" value={String(data.paymentsRecordedCount)} />
        <AdminMetricCard label="Active Workspaces (30d)" value={String(data.activeWorkspaces30d)} accent="emerald" />
        <AdminMetricCard label="Active Users (30d)" value={String(data.activeUsers30d)} accent="emerald" />
      </div>
    </AdminPageShell>
  );
}
