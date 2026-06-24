import type { AuthorizedAdminAccess } from "@/lib/admin/requireAdmin";
import {
  FOUNDER_ADMIN_MIGRATION_FILE,
  getAdminPath,
} from "@/lib/admin/adminPaths";
import { AdminCard } from "./adminUtils";
import Link from "next/link";

type AdminSetupRequiredProps = {
  access: AuthorizedAdminAccess;
};

export function AdminSetupRequired({ access }: AdminSetupRequiredProps) {
  const usingEmailFallback =
    access.accessMode === "tables_missing_fallback" ||
    access.accessMode === "bootstrap_pending";

  return (
    <div className="space-y-6">
      <AdminCard className="border-amber-200 bg-amber-50 p-6">
        <h2 className="text-lg font-semibold text-amber-950">
          Admin tables are not installed yet.
        </h2>
        <p className="mt-2 text-sm text-amber-900">
          The founder admin console requires database tables before bootstrap or
          normal admin operations can run.
        </p>
        {usingEmailFallback ? (
          <p className="mt-3 text-sm text-amber-900">
            You are currently signed in via the{" "}
            <span className="font-semibold">ADMIN_EMAILS emergency fallback</span>.
            This is temporary and not production-safe until DB admin users exist.
          </p>
        ) : null}
      </AdminCard>

      <AdminCard className="p-6">
        <h3 className="text-base font-semibold text-slate-900">Install migration</h3>
        <p className="mt-2 text-sm text-slate-600">
          Run the migration in Supabase SQL Editor before bootstrap.
        </p>
        <p className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-800">
          {FOUNDER_ADMIN_MIGRATION_FILE}
        </p>
        <p className="mt-3 text-sm text-slate-600">
          Creates <code className="text-xs">admin_users</code>,{" "}
          <code className="text-xs">admin_audit_logs</code>, and{" "}
          <code className="text-xs">workspace_subscriptions</code>.
        </p>
      </AdminCard>

      {access.accessMode === "bootstrap_pending" ? (
        <AdminCard className="p-6">
          <h3 className="text-base font-semibold text-slate-900">Next step</h3>
          <p className="mt-2 text-sm text-slate-600">
            After the migration succeeds, open Security to bootstrap your first
            super admin.
          </p>
          <Link
            href={getAdminPath("/security")}
            className="mt-4 inline-flex rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Open Security
          </Link>
        </AdminCard>
      ) : null}
    </div>
  );
}
