import { guardFullAdminConsoleAccess, renderAdminSetupScreen } from "@/lib/admin/adminPageGate";
import { getAdminPath } from "@/lib/admin/adminPaths";
import { getFounderUsersData } from "@/lib/admin/getAdminDashboardData";
import { parseFounderAdminTablePage } from "@/lib/admin/founderAdminTablePresentation";
import { AdminCreateWorkspaceButton } from "@/components/admin/AdminCreateWorkspaceButton";
import { AdminDateTimeCell } from "@/components/admin/AdminDateTimeCell";
import { PaginationBar } from "@/components/PaginationBar";
import { AdminPageShell } from "../_components/AdminPageShell";
import { AdminCard } from "../_components/adminUtils";

type AdminUsersPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AdminUsersPage({ searchParams }: AdminUsersPageProps) {
  const gate = await guardFullAdminConsoleAccess();
  if (!gate.ok) {
    if (!gate.access) return null;
    return renderAdminSetupScreen(gate.access);
  }
  const access = gate.access;
  const canRepairUsers = access.role === "super_admin";

  const resolvedSearchParams = await searchParams;
  const page = parseFounderAdminTablePage(resolvedSearchParams.page);
  const usersPage = await getFounderUsersData({ page });

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
                <th className="px-4 py-3 text-left font-medium text-slate-600 whitespace-nowrap">
                  Account created
                </th>
                <th className="px-4 py-3 text-left font-medium text-slate-600 whitespace-nowrap">
                  Last sign in
                </th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Workspaces</th>
                {canRepairUsers ? (
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Actions</th>
                ) : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {usersPage.rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={canRepairUsers ? 5 : 4}
                    className="px-4 py-8 text-center text-slate-500"
                  >
                    No users found.
                  </td>
                </tr>
              ) : (
                usersPage.rows.map((user) => (
                  <tr key={user.id}>
                    <td className="px-4 py-3 text-slate-900">{user.email ?? user.id}</td>
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                      <AdminDateTimeCell value={user.createdAt} />
                    </td>
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                      <AdminDateTimeCell value={user.lastSignInAt} />
                    </td>
                    <td className="px-4 py-3 text-slate-600">{user.workspaceCount}</td>
                    {canRepairUsers ? (
                      <td className="px-4 py-3 whitespace-nowrap">
                        {user.workspaceCount === 0 ? (
                          <AdminCreateWorkspaceButton
                            userId={user.id}
                            userLabel={user.email ?? user.id}
                          />
                        ) : null}
                      </td>
                    ) : null}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="border-t border-slate-200 px-4 py-3">
          <PaginationBar
            currentPage={usersPage.page}
            totalPages={usersPage.totalPages}
            totalItems={usersPage.totalCount}
            itemLabel="users"
            basePath={getAdminPath("/users")}
            queryParams={resolvedSearchParams}
          />
        </div>
      </AdminCard>
    </AdminPageShell>
  );
}
