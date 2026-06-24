import type { ReactNode } from "react";
import type { AdminAccessMode } from "@/lib/admin/requireAdmin";
import { getPublicAdminBasePath } from "@/lib/admin/adminPaths";
import { AdminSidebar } from "./AdminSidebar";
import { AdminHeader } from "./AdminHeader";

type AdminShellProps = {
  children: ReactNode;
  title: string;
  description?: string;
  adminEmail: string | null;
  adminRole: string | null;
  bootstrapAllowed?: boolean;
  subscriptionFallbackBanner?: string | null;
  setupRequired?: boolean;
  accessMode?: AdminAccessMode;
  backToAppHref: string;
};

export function AdminShell({
  children,
  title,
  description,
  adminEmail,
  adminRole,
  bootstrapAllowed = false,
  subscriptionFallbackBanner = null,
  setupRequired = false,
  accessMode,
  backToAppHref,
}: AdminShellProps) {
  const adminBasePath = getPublicAdminBasePath();

  return (
    <div className="flex min-h-screen bg-slate-100">
      <AdminSidebar adminBasePath={adminBasePath} backToAppHref={backToAppHref} />
      <div className="flex min-w-0 flex-1 flex-col">
        <AdminHeader
          title={title}
          description={description}
          adminEmail={adminEmail}
          adminRole={adminRole}
          bootstrapAllowed={bootstrapAllowed}
          adminBasePath={adminBasePath}
          backToAppHref={backToAppHref}
        />
        <main className="flex-1 px-4 py-6 md:px-8 md:py-8">
          {setupRequired ? (
            <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              {accessMode === "tables_missing_fallback"
                ? "Admin tables are not installed yet. Using ADMIN_EMAILS emergency fallback."
                : "Admin setup required before full console access is enabled."}
            </div>
          ) : null}
          {subscriptionFallbackBanner ? (
            <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              {subscriptionFallbackBanner}
            </div>
          ) : null}
          {children}
        </main>
      </div>
    </div>
  );
}
