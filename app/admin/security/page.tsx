import { getAdminAccess } from "@/lib/admin/requireAdmin";
import { listAdminUsersWithEmails } from "@/lib/admin/requireAdmin";
import { isPostgrestMissingTableError } from "@/lib/admin/postgrestErrors";
import { FOUNDER_ADMIN_MIGRATION_FILE } from "@/lib/admin/adminPaths";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { AdminPageShell } from "../_components/AdminPageShell";
import { AdminSecurityPanel } from "../_components/AdminSecurityPanel";
import { AdminSecurityBanner } from "../_components/AdminSecurityBanner";
import { AdminSetupRequired } from "../_components/AdminSetupRequired";
import { AdminCard } from "../_components/adminUtils";

async function getAdminAuditLogs() {
  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from("admin_audit_logs")
    .select("id, action, target_type, target_id, created_at")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    if (isPostgrestMissingTableError(error)) return [];
    return [];
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    action: row.action,
    targetType: row.target_type,
    targetId: row.target_id,
    createdAt: row.created_at,
  }));
}

export default async function AdminSecurityPage() {
  const access = await getAdminAccess();
  if (!access.authorized) return null;

  let adminUsers: Awaited<ReturnType<typeof listAdminUsersWithEmails>> = [];
  let auditLogs: Awaited<ReturnType<typeof getAdminAuditLogs>> = [];

  if (access.infrastructure.adminUsersTableInstalled) {
    try {
      adminUsers = await listAdminUsersWithEmails();
      auditLogs = await getAdminAuditLogs();
    } catch {
      // Keep security page usable during partial setup.
    }
  }

  return (
    <AdminPageShell
      access={access}
      title="Security"
      description="Admin users, roles, and audit trail."
      setupOnly
    >
      <div className="space-y-6">
        <AdminSecurityBanner access={access} />

        {access.tablesMissing ? (
          <>
            <AdminSetupRequired access={access} />
            <AdminCard className="p-6">
              <h3 className="text-base font-semibold text-slate-900">
                Supabase SQL Editor
              </h3>
              <p className="mt-2 text-sm text-slate-600">
                Run the migration in Supabase SQL Editor before bootstrap.
              </p>
              <p className="mt-3 rounded-lg border border-slate-200 bg-slate-950 px-4 py-3 font-mono text-xs text-slate-100">
                {FOUNDER_ADMIN_MIGRATION_FILE}
              </p>
              <p className="mt-3 text-sm text-slate-500">
                Bootstrap is disabled until{" "}
                <code className="text-xs">admin_users</code> exists.
              </p>
            </AdminCard>
          </>
        ) : null}

        <AdminSecurityPanel
          adminUsers={adminUsers}
          bootstrapAllowed={access.bootstrapAllowed}
          tablesMissing={access.tablesMissing}
          isSuperAdmin={access.role === "super_admin"}
          currentUserId={access.user.id}
          auditLogs={auditLogs}
        />
      </div>
    </AdminPageShell>
  );
}
