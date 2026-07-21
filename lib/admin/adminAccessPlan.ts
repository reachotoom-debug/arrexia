import type { AdminInfrastructureStatus } from "@/lib/admin/adminInfrastructure";

export type AdminRole = "super_admin" | "admin" | "support" | "analyst";

export type AdminAccessMode =
  | "db_admin"
  | "bootstrap_pending"
  | "tables_missing_fallback"
  | "emergency_fallback";

export type AuthorizedAdminAccess = {
  authorized: true;
  user: { id: string; email: string | null };
  role: AdminRole | null;
  bootstrapAllowed: boolean;
  emergencyFallback: boolean;
  emergencyFallbackEnabled: boolean;
  accessMode: AdminAccessMode;
  setupRequired: boolean;
  tablesMissing: boolean;
  canAccessFullAdmin: boolean;
  infrastructure: AdminInfrastructureStatus;
};

export type AdminAccessResult =
  | AuthorizedAdminAccess
  | { authorized: false; reason: "unauthorized" };

type AdminUserRow = {
  id: string;
  user_id: string;
  role: AdminRole;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

type AdminAccessUser = {
  id: string;
  email?: string | null;
};

/** Direct admin record lookup makes broad infrastructure probes unnecessary. */
export function shouldRunAdminInfrastructureProbes(adminRecord: AdminUserRow | null): boolean {
  return adminRecord === null;
}

export function infrastructureStatusWhenAdminRecordExists(): AdminInfrastructureStatus {
  return {
    adminUsersTableInstalled: true,
    adminAuditLogsTableInstalled: true,
    workspaceSubscriptionsTableInstalled: true,
    adminUsersCount: 1,
  };
}

export function decideAdminAccess(input: {
  user: AdminAccessUser;
  record: AdminUserRow | null;
  infrastructure: AdminInfrastructureStatus;
  emergencyFallbackEnabled: boolean;
  isAdminEmailAllowed: (email: string | null | undefined) => boolean;
}): AdminAccessResult {
  const { user, record, infrastructure, emergencyFallbackEnabled, isAdminEmailAllowed } = input;

  if (record) {
    return {
      authorized: true,
      user: { id: user.id, email: user.email ?? null },
      role: record.role,
      bootstrapAllowed: false,
      emergencyFallback: false,
      emergencyFallbackEnabled,
      accessMode: "db_admin",
      setupRequired: false,
      tablesMissing: false,
      canAccessFullAdmin: true,
      infrastructure,
    };
  }

  if (!infrastructure.adminUsersTableInstalled) {
    if (!isAdminEmailAllowed(user.email)) {
      return { authorized: false, reason: "unauthorized" };
    }

    return {
      authorized: true,
      user: { id: user.id, email: user.email ?? null },
      role: null,
      bootstrapAllowed: false,
      emergencyFallback: false,
      emergencyFallbackEnabled,
      accessMode: "tables_missing_fallback",
      setupRequired: true,
      tablesMissing: true,
      canAccessFullAdmin: false,
      infrastructure,
    };
  }

  if (infrastructure.adminUsersCount === 0) {
    if (!isAdminEmailAllowed(user.email)) {
      return { authorized: false, reason: "unauthorized" };
    }

    return {
      authorized: true,
      user: { id: user.id, email: user.email ?? null },
      role: null,
      bootstrapAllowed: true,
      emergencyFallback: false,
      emergencyFallbackEnabled,
      accessMode: "bootstrap_pending",
      setupRequired: true,
      tablesMissing: false,
      canAccessFullAdmin: false,
      infrastructure,
    };
  }

  if (emergencyFallbackEnabled && isAdminEmailAllowed(user.email)) {
    return {
      authorized: true,
      user: { id: user.id, email: user.email ?? null },
      role: "admin",
      bootstrapAllowed: false,
      emergencyFallback: true,
      emergencyFallbackEnabled,
      accessMode: "emergency_fallback",
      setupRequired: false,
      tablesMissing: false,
      canAccessFullAdmin: true,
      infrastructure,
    };
  }

  return { authorized: false, reason: "unauthorized" };
}
