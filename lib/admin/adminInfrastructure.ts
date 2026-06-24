import { cache } from "react";
import { isPostgrestMissingTableError } from "@/lib/admin/postgrestErrors";
import { supabaseAdmin } from "@/lib/supabase/admin";

export type AdminInfrastructureStatus = {
  adminUsersTableInstalled: boolean;
  adminAuditLogsTableInstalled: boolean;
  workspaceSubscriptionsTableInstalled: boolean;
  adminUsersCount: number;
};

async function tableExists(table: string): Promise<boolean> {
  const admin = supabaseAdmin();
  const { error } = await admin.from(table).select("*", { count: "exact", head: true });
  if (!error) return true;
  if (isPostgrestMissingTableError(error)) return false;
  return false;
}

async function countRows(table: string): Promise<number | null> {
  const admin = supabaseAdmin();
  const { count, error } = await admin.from(table).select("*", { count: "exact", head: true });
  if (error) {
    if (isPostgrestMissingTableError(error)) return null;
    return null;
  }
  return count ?? 0;
}

export const getAdminInfrastructureStatus = cache(
  async function getAdminInfrastructureStatus(): Promise<AdminInfrastructureStatus> {
    const [
      adminUsersTableInstalled,
      adminAuditLogsTableInstalled,
      workspaceSubscriptionsTableInstalled,
      adminUsersCount,
    ] = await Promise.all([
      tableExists("admin_users"),
      tableExists("admin_audit_logs"),
      tableExists("workspace_subscriptions"),
      countRows("admin_users"),
    ]);

    return {
      adminUsersTableInstalled,
      adminAuditLogsTableInstalled,
      workspaceSubscriptionsTableInstalled,
      adminUsersCount: adminUsersCount ?? 0,
    };
  }
);

export function isEmergencyFallbackEnabled(): boolean {
  return process.env.ADMIN_EMERGENCY_EMAILS_ENABLED === "true";
}
