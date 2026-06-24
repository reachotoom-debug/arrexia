import { guardFullAdminConsoleAccess, renderAdminSetupScreen } from "@/lib/admin/adminPageGate";
import { getFounderSettingsData } from "@/lib/admin/getAdminDashboardData";
import { AdminPageShell } from "../_components/AdminPageShell";
import { AdminCard } from "../_components/adminUtils";

export default async function AdminSettingsPage() {
  const gate = await guardFullAdminConsoleAccess();
  if (!gate.ok) {
    if (!gate.access) return null;
    return renderAdminSetupScreen(gate.access);
  }
  const access = gate.access;

  const settings = await getFounderSettingsData(access.bootstrapAllowed);

  return (
    <AdminPageShell
      title="Settings"
      description="Founder admin configuration."
      adminEmail={access.user.email}
      adminRole={access.role}
      bootstrapAllowed={access.bootstrapAllowed}
    >
      <AdminCard className="divide-y divide-slate-200">
        <div className="flex items-center justify-between px-4 py-4">
          <span className="text-sm text-slate-600">Payment provider</span>
          <span className="text-sm font-medium text-slate-900">{settings.paymentProvider}</span>
        </div>
        <div className="flex items-center justify-between px-4 py-4">
          <span className="text-sm text-slate-600">Billing mode</span>
          <span className="text-sm font-medium text-slate-900">{settings.billingMode}</span>
        </div>
        <div className="flex items-center justify-between px-4 py-4">
          <span className="text-sm text-slate-600">Emergency email fallback</span>
          <span className="text-sm font-medium text-slate-900">
            {settings.emergencyEmailsEnabled ? "Enabled" : "Disabled"}
          </span>
        </div>
        <div className="flex items-center justify-between px-4 py-4">
          <span className="text-sm text-slate-600">Admin bootstrap available</span>
          <span className="text-sm font-medium text-slate-900">
            {settings.adminBootstrapAvailable ? "Yes — visit Security" : "No"}
          </span>
        </div>
      </AdminCard>
    </AdminPageShell>
  );
}
