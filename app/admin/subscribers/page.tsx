import { guardFullAdminConsoleAccess, renderAdminSetupScreen } from "@/lib/admin/adminPageGate";
import { getAdminPath } from "@/lib/admin/adminPaths";
import { getFounderSubscribersData } from "@/lib/admin/getAdminDashboardData";
import { parseFounderAdminTablePage } from "@/lib/admin/founderAdminTablePresentation";
import { AdminDateTimeCell } from "@/components/admin/AdminDateTimeCell";
import { PaginationBar } from "@/components/PaginationBar";
import { AdminPageShell } from "../_components/AdminPageShell";
import { AdminCard, PlanBadge, formatAdminCurrency, formatAdminDate } from "../_components/adminUtils";
import { ChangeWorkspacePlanForm } from "../_components/ChangeWorkspacePlanForm";

function formatBillingIntervalLabel(interval: "monthly" | "annual"): string {
  return interval === "annual" ? "Annual" : "Monthly";
}

type AdminSubscribersPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AdminSubscribersPage({ searchParams }: AdminSubscribersPageProps) {
  const gate = await guardFullAdminConsoleAccess();
  if (!gate.ok) {
    if (!gate.access) return null;
    return renderAdminSetupScreen(gate.access);
  }
  const access = gate.access;

  const resolvedSearchParams = await searchParams;
  const page = parseFounderAdminTablePage(resolvedSearchParams.page);
  const subscribersPage = await getFounderSubscribersData({ page });

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
                <th className="px-4 py-3 text-left font-medium text-slate-600 whitespace-nowrap">
                  Status
                </th>
                <th className="px-4 py-3 text-left font-medium text-slate-600 whitespace-nowrap">
                  Trial ends
                </th>
                <th className="px-4 py-3 text-left font-medium text-slate-600 whitespace-nowrap">
                  Renewal
                </th>
                <th className="px-4 py-3 text-left font-medium text-slate-600 whitespace-nowrap">
                  Est. MRR
                </th>
                <th className="px-4 py-3 text-left font-medium text-slate-600 whitespace-nowrap">
                  Last sign in
                </th>
                <th className="px-4 py-3 text-left font-medium text-slate-600 whitespace-nowrap">
                  Change plan
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {subscribersPage.rows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-slate-500">
                    No subscribers found.
                  </td>
                </tr>
              ) : (
                subscribersPage.rows.map((row) => (
                  <tr key={row.workspaceId}>
                    <td className="px-4 py-3 text-slate-900">{row.userEmail ?? "—"}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">{row.workspaceName}</div>
                      <div className="text-xs text-slate-500">{row.workspaceId.slice(0, 8)}…</div>
                    </td>
                    <td className="px-4 py-3">
                      <PlanBadge plan={row.plan} />
                      <div className="mt-1 text-xs text-slate-500">
                        {formatBillingIntervalLabel(row.billingInterval)}
                      </div>
                    </td>
                    <td className="px-4 py-3 capitalize text-slate-600 whitespace-nowrap">
                      {row.subscriptionStatus}
                    </td>
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                      {formatAdminDate(row.trialEndsAt)}
                    </td>
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                      {formatAdminDate(row.renewalDate)}
                    </td>
                    <td className="px-4 py-3 text-slate-900 whitespace-nowrap">
                      {formatAdminCurrency(row.estimatedMonthlyValue)}
                    </td>
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                      <AdminDateTimeCell value={row.lastSignInAt} />
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <ChangeWorkspacePlanForm
                        workspaceId={row.workspaceId}
                        currentPlan={row.plan}
                        currentBillingInterval={row.billingInterval}
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="border-t border-slate-200 px-4 py-3">
          <PaginationBar
            currentPage={subscribersPage.page}
            totalPages={subscribersPage.totalPages}
            totalItems={subscribersPage.totalCount}
            itemLabel="subscribers"
            basePath={getAdminPath("/subscribers")}
            queryParams={resolvedSearchParams}
          />
        </div>
      </AdminCard>
    </AdminPageShell>
  );
}
