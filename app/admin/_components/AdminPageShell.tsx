import type { ReactNode } from "react";
import {
  getAdminAccess,
  type AuthorizedAdminAccess,
} from "@/lib/admin/requireAdmin";
import { getSubscriptionFallbackBanner } from "@/lib/admin/getAdminDashboardData";
import { resolveAdminBackToAppPath } from "@/lib/admin/resolveAdminBackToAppPath";
import { AdminShell } from "./AdminShell";
import { AdminSetupRequired } from "./AdminSetupRequired";

type AdminPageShellProps = {
  children: ReactNode;
  title: string;
  description?: string;
  adminEmail?: string | null;
  adminRole?: string | null;
  bootstrapAllowed?: boolean;
  setupOnly?: boolean;
  access?: AuthorizedAdminAccess;
};

export async function AdminPageShell({
  children,
  setupOnly = false,
  access: providedAccess,
  adminEmail,
  adminRole,
  bootstrapAllowed,
  ...props
}: AdminPageShellProps) {
  const access = providedAccess ?? (await getAdminAccess());
  if (!access.authorized) return null;

  const [subscriptionFallbackBanner, backToAppHref] = await Promise.all([
    getSubscriptionFallbackBanner(),
    resolveAdminBackToAppPath(access.user.id),
  ]);

  const resolvedEmail = adminEmail ?? access.user.email;
  const resolvedRole = adminRole ?? access.role;
  const resolvedBootstrap = bootstrapAllowed ?? access.bootstrapAllowed;

  const body =
    !setupOnly && !access.canAccessFullAdmin ? (
      <AdminSetupRequired access={access} />
    ) : (
      children
    );

  return (
    <AdminShell
      {...props}
      adminEmail={resolvedEmail}
      adminRole={resolvedRole}
      bootstrapAllowed={resolvedBootstrap}
      subscriptionFallbackBanner={subscriptionFallbackBanner}
      setupRequired={access.setupRequired}
      accessMode={access.accessMode}
      backToAppHref={backToAppHref}
    >
      {body}
    </AdminShell>
  );
}
