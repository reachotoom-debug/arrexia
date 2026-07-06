import { guardFullAdminConsoleAccess, renderAdminSetupScreen } from "@/lib/admin/adminPageGate";
import { getFounderUsersData } from "@/lib/admin/getAdminDashboardData";
import { AdminCreateWorkspaceButton } from "@/components/admin/AdminCreateWorkspaceButton";
import { AdminPageShell } from "../_components/AdminPageShell";
import { AdminCard } from "../_components/adminUtils";
import { formatAdminDateTime } from "../_components/adminUtils";

export default async function AdminUsersPage() {
  const gate = await guardFullAdminConsoleAccess();
  if (!gate.ok) {
    if (!gate.access) return null;
    return renderAdminSetupScreen(gate.access);
  }
  const access = gate.access;
  const canRepairUsers = access.role === "super_admin";

  const users = await getFounderUsersData();

  return (
    <AdminPageShell
      title="Users"
      description="Registered Arrexia accounts."
      adminEmail={access.user.email}
      adminRole={access.role}
      bootstrapAllowed={access.bootstrapAllowed}
    >
      <AdminCard className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Email</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Created</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Last sign in</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Workspaces</th>
                {canRepairUsers ? (
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Actions</th>
                ) : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {users.map((user) => (
                <tr key={user.id}>
                  <td className="px-4 py-3 text-slate-900">{user.email ?? user.id}</td>
                  <td className="px-4 py-3 text-slate-600">{formatAdminDateTime(user.createdAt)}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {formatAdminDateTime(user.lastSignInAt)}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{user.workspaceCount}</td>
                  {canRepairUsers ? (
                    <td className="px-4 py-3">
                      {user.workspaceCount === 0 ? (
                        <AdminCreateWorkspaceButton
                          userId={user.id}
                          userLabel={user.email ?? user.id}
                        />
                      ) : null}
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </AdminCard>
    </AdminPageShell>
  );
}
