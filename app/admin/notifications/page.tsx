import Link from "next/link";
import { guardFullAdminConsoleAccess, renderAdminSetupScreen } from "@/lib/admin/adminPageGate";
import { getFounderNotificationsData } from "@/lib/admin/getAdminDashboardData";
import { AdminPageShell } from "../_components/AdminPageShell";
import { AdminCard, formatAdminDateTime } from "../_components/adminUtils";

export default async function AdminNotificationsPage() {
  const gate = await guardFullAdminConsoleAccess();
  if (!gate.ok) {
    if (!gate.access) return null;
    return renderAdminSetupScreen(gate.access);
  }
  const access = gate.access;

  const { notifications } = await getFounderNotificationsData();

  return (
    <AdminPageShell
      title="Notifications"
      description="Founder alerts for trials, renewals, email failures, and growth."
      adminEmail={access.user.email}
      adminRole={access.role}
      bootstrapAllowed={access.bootstrapAllowed}
    >
      <AdminCard className="divide-y divide-slate-200">
        {notifications.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-slate-500">No alerts right now.</p>
        ) : (
          notifications.map((item) => (
            <div key={item.id} className="flex flex-col gap-2 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-medium text-slate-900">{item.title}</p>
                <p className="mt-1 text-sm text-slate-600">{item.description}</p>
                <p className="mt-1 text-xs text-slate-400">{formatAdminDateTime(item.createdAt)}</p>
              </div>
              {item.href ? (
                <Link
                  href={item.href}
                  className="text-sm font-medium text-indigo-600 hover:text-indigo-800"
                >
                  View →
                </Link>
              ) : null}
            </div>
          ))
        )}
      </AdminCard>
    </AdminPageShell>
  );
}
