import type { AuthorizedAdminAccess } from "@/lib/admin/requireAdmin";
import { AdminCard } from "./adminUtils";

type AdminSecurityBannerProps = {
  access: AuthorizedAdminAccess;
};

function yesNo(value: boolean) {
  return value ? "yes" : "no";
}

function accessModeLabel(access: AuthorizedAdminAccess): string {
  if (access.role) return access.role.replace("_", " ");
  if (access.accessMode === "emergency_fallback") return "emergency fallback (admin)";
  if (access.accessMode === "bootstrap_pending") return "bootstrap pending (ADMIN_EMAILS)";
  if (access.accessMode === "tables_missing_fallback") {
    return "ADMIN_EMAILS fallback (tables missing)";
  }
  return "unknown";
}

export function AdminSecurityBanner({ access }: AdminSecurityBannerProps) {
  const { infrastructure } = access;

  return (
    <AdminCard className="border-slate-300 bg-slate-50 p-5">
      <h2 className="text-base font-semibold text-slate-900">Security status</h2>
      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-slate-500">Server-side allowlist active</dt>
          <dd className="font-medium text-slate-900">yes</dd>
        </div>
        <div>
          <dt className="text-slate-500">Admin DB tables installed</dt>
          <dd className="font-medium text-slate-900">
            {yesNo(infrastructure.adminUsersTableInstalled)}
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">Admin DB users count</dt>
          <dd className="font-medium text-slate-900">{infrastructure.adminUsersCount}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Emergency fallback enabled</dt>
          <dd className="font-medium text-slate-900">
            {yesNo(access.emergencyFallbackEnabled)}
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">Current user email</dt>
          <dd className="font-medium text-slate-900">{access.user.email ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Current admin role / access</dt>
          <dd className="font-medium capitalize text-slate-900">
            {accessModeLabel(access)}
          </dd>
        </div>
      </dl>
    </AdminCard>
  );
}
