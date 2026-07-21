import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";
import type { AuthUserInfo } from "@/lib/auth/server";
import {
  decideAdminAccess,
  infrastructureStatusWhenAdminRecordExists,
  shouldRunAdminInfrastructureProbes,
} from "@/lib/admin/adminAccessPlan";
import {
  getAdminInfrastructureStatus,
  isEmergencyFallbackEnabled,
  type AdminInfrastructureStatus,
} from "@/lib/admin/adminInfrastructure";
import { getAdminLoginRedirectUrl } from "@/lib/admin/adminPaths";
import { isPerfEnabled, perfLog, perfTime, perfTimeSync } from "@/lib/perf/server";

export type AdminRole = "super_admin" | "admin" | "support" | "analyst";

export type AdminAccessMode =
  | "db_admin"
  | "bootstrap_pending"
  | "tables_missing_fallback"
  | "emergency_fallback";

export type AuthorizedAdminAccess = {
  authorized: true;
  user: AuthUserInfo;
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

function parseAdminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  return parseAdminEmails().includes(normalized);
}

export function isAdminEmailBootstrapAllowed(
  email: string | null | undefined
): boolean {
  return isAdminEmail(email);
}

async function getSessionUser(): Promise<{ id: string; email?: string | null } | null> {
  const supabase = await supabaseServer();
  try {
    const { data, error } = await supabase.auth.getUser();
    if (!data.user || error) return null;
    return data.user;
  } catch {
    return null;
  }
}

async function getAdminUserRecord(userId: string): Promise<AdminUserRow | null> {
  return perfTime(
    "admin-access",
    "adminUserLookup",
    async () => {
      try {
        const admin = supabaseAdmin();
        const { data, error } = await admin
          .from("admin_users")
          .select("id, user_id, role, created_by, created_at, updated_at")
          .eq("user_id", userId)
          .maybeSingle();
        if (error || !data) return null;
        return data as AdminUserRow;
      } catch {
        return null;
      }
    },
    (record) => `found=${record ? 1 : 0}`
  );
}

function checkAdminAllowlist(email: string | null | undefined): boolean {
  return perfTimeSync(
    "admin-access",
    "adminAllowlistCheck",
    () => isAdminEmail(email),
    (allowed) => `allowed=${allowed ? 1 : 0}`
  );
}

export async function getCurrentAdminRole(
  userId: string
): Promise<AdminRole | null> {
  const record = await getAdminUserRecord(userId);
  return record?.role ?? null;
}

async function resolveAdminAccessForUser(user: {
  id: string;
  email?: string | null;
}): Promise<AdminAccessResult> {
  const record = await getAdminUserRecord(user.id);
  const emergencyFallbackEnabled = perfTimeSync(
    "admin-access",
    "emergencyFallbackEnvCheck",
    () => isEmergencyFallbackEnabled(),
    (enabled) => `enabled=${enabled ? 1 : 0}`
  );

  if (!shouldRunAdminInfrastructureProbes(record)) {
    return decideAdminAccess({
      user,
      record,
      infrastructure: infrastructureStatusWhenAdminRecordExists(),
      emergencyFallbackEnabled,
      isAdminEmailAllowed: checkAdminAllowlist,
    });
  }

  const infrastructure = await perfTime(
    "admin-access",
    "adminInfrastructureFallback",
    () => getAdminInfrastructureStatus(),
    (status) => `adminUsersCount=${status.adminUsersCount}`
  );

  return decideAdminAccess({
    user,
    record: null,
    infrastructure,
    emergencyFallbackEnabled,
    isAdminEmailAllowed: checkAdminAllowlist,
  });
}

export async function getAdminAccess(): Promise<AdminAccessResult> {
  const user = await getSessionUser();

  if (!user) {
    redirect(getAdminLoginRedirectUrl());
  }

  return resolveAdminAccessForUser(user);
}

export async function assertAdmin(): Promise<AuthorizedAdminAccess> {
  const user = await getSessionUser();

  if (!user) {
    throw new Error("Unauthorized");
  }

  const access = await resolveAdminAccessForUser(user);
  if (!access.authorized) {
    throw new Error("Unauthorized");
  }

  return access;
}

export async function assertSuperAdmin(): Promise<{
  user: AuthUserInfo;
  role: AdminRole;
}> {
  const ctx = await assertAdmin();

  if (ctx.bootstrapAllowed) {
    throw new Error("Bootstrap required before super admin actions");
  }

  if (ctx.tablesMissing) {
    throw new Error("Admin tables are not installed. Run the founder admin migration first.");
  }

  if (ctx.role !== "super_admin") {
    throw new Error("Super admin required");
  }

  return { user: ctx.user, role: ctx.role };
}

export async function enforceFullAdminPageAccess(): Promise<
  | { allowed: true; access: AuthorizedAdminAccess }
  | { allowed: false; access: AuthorizedAdminAccess | null; reason: "unauthorized" | "setup_required" }
> {
  const access = await getAdminAccess();
  if (!access.authorized) {
    return { allowed: false, access: null, reason: "unauthorized" };
  }
  if (!access.canAccessFullAdmin) {
    return { allowed: false, access, reason: "setup_required" };
  }
  return { allowed: true, access };
}

export async function listAdminUsersWithEmails(): Promise<
  Array<{
    id: string;
    userId: string;
    email: string | null;
    role: AdminRole;
    createdAt: string;
    createdBy: string | null;
    createdByEmail: string | null;
  }>
> {
  await assertAdmin();
  const admin = supabaseAdmin();

  const { data: rows, error } = await admin
    .from("admin_users")
    .select("id, user_id, role, created_by, created_at")
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Failed to load admin users: ${error.message}`);
  }

  const authUsers = await listAllAuthUsersForAdmin();
  const emailById = new Map(authUsers.map((u) => [u.id, u.email ?? null]));

  return (rows ?? []).map((row) => ({
    id: row.id,
    userId: row.user_id,
    email: emailById.get(row.user_id) ?? null,
    role: row.role as AdminRole,
    createdAt: row.created_at,
    createdBy: row.created_by,
    createdByEmail: row.created_by ? emailById.get(row.created_by) ?? null : null,
  }));
}

export async function listAllAuthUsersForAdmin(): Promise<
  Array<{
    id: string;
    email: string | null;
    created_at: string | null;
    last_sign_in_at: string | null;
  }>
> {
  await assertAdmin();
  const admin = supabaseAdmin();
  const users: Array<{
    id: string;
    email: string | null;
    created_at: string | null;
    last_sign_in_at: string | null;
  }> = [];

  let page = 1;
  const perPage = 1000;

  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) {
      throw new Error(`Failed to list auth users: ${error.message}`);
    }

    for (const user of data.users) {
      users.push({
        id: user.id,
        email: user.email ?? null,
        created_at: user.created_at ?? null,
        last_sign_in_at: user.last_sign_in_at ?? null,
      });
    }

    if (data.users.length < perPage) break;
    page += 1;
  }

  return users;
}

export async function userCanAccessAdminPanel(
  userId: string,
  email: string | null | undefined
): Promise<boolean> {
  if (!isPerfEnabled()) {
    const access = await resolveAdminAccessForUser({ id: userId, email });
    return access.authorized;
  }

  const startedAt = performance.now();
  const access = await resolveAdminAccessForUser({ id: userId, email });
  const elapsedMs = Math.round(performance.now() - startedAt);
  perfLog(
    "admin-access",
    `total=${elapsedMs}ms authorized=${access.authorized ? 1 : 0}`
  );
  return access.authorized;
}

export async function findAuthUserIdByEmail(
  email: string
): Promise<string | null> {
  const normalized = email.trim().toLowerCase();
  const users = await listAllAuthUsersForAdmin();
  const match = users.find((u) => u.email?.trim().toLowerCase() === normalized);
  return match?.id ?? null;
}
