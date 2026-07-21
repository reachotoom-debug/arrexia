import { cache } from "react";
import { isPostgrestMissingTableError } from "@/lib/admin/postgrestErrors";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { perfTime } from "@/lib/perf/server";

export type AdminInfrastructureStatus = {
  adminUsersTableInstalled: boolean;
  adminAuditLogsTableInstalled: boolean;
  workspaceSubscriptionsTableInstalled: boolean;
  adminUsersCount: number;
};

async function tableExists(table: string, perfLabel: string): Promise<boolean> {
  return perfTime(
    "admin-access",
    perfLabel,
    async () => {
      const admin = supabaseAdmin();
      const { error } = await admin.from(table).select("*", { count: "exact", head: true });
      if (!error) return true;
      if (isPostgrestMissingTableError(error)) return false;
      return false;
    },
    (exists) => `installed=${exists ? 1 : 0}`
  );
}

async function countRows(table: string, perfLabel: string): Promise<number | null> {
  return perfTime(
    "admin-access",
    perfLabel,
    async () => {
      const admin = supabaseAdmin();
      const { count, error } = await admin.from(table).select("*", { count: "exact", head: true });
      if (error) {
        if (isPostgrestMissingTableError(error)) return null;
        return null;
      }
      return count ?? 0;
    },
    (rowCount) => `count=${rowCount ?? 0}`
  );
}

export const getAdminInfrastructureStatus = cache(
  async function getAdminInfrastructureStatus(): Promise<AdminInfrastructureStatus> {
    return perfTime(
      "admin-access",
      "getAdminInfrastructureStatus",
      async () => {
        const [
          adminUsersTableInstalled,
          adminAuditLogsTableInstalled,
          workspaceSubscriptionsTableInstalled,
          adminUsersCount,
        ] = await Promise.all([
          tableExists("admin_users", "adminUsersTableCheck"),
          tableExists("admin_audit_logs", "adminAuditLogsTableCheck"),
          tableExists("workspace_subscriptions", "workspaceSubscriptionsTableCheck"),
          countRows("admin_users", "adminUsersCountQuery"),
        ]);

        return {
          adminUsersTableInstalled,
          adminAuditLogsTableInstalled,
          workspaceSubscriptionsTableInstalled,
          adminUsersCount: adminUsersCount ?? 0,
        };
      },
      (status) => `adminUsersCount=${status.adminUsersCount}`
    );
  }
);

export function isEmergencyFallbackEnabled(): boolean {
  return process.env.ADMIN_EMERGENCY_EMAILS_ENABLED === "true";
}
