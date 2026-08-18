"use server";

import { revalidatePath } from "next/cache";
import {
  assertAdmin,
  assertSuperAdmin,
  findAuthUserIdByEmail,
  type AdminRole,
} from "@/lib/admin/requireAdmin";
import { logAdminAuditEvent } from "@/lib/admin/adminAudit";
import {
  changeWorkspacePlan,
  parseAssignableWorkspacePlan,
} from "@/lib/billing/changeWorkspacePlan";
import { isPostgrestMissingTableError } from "@/lib/admin/postgrestErrors";
import { supabaseAdmin } from "@/lib/supabase/admin";

import { getAdminRevalidatePaths } from "@/lib/admin/adminPaths";
import { getAdminInfrastructureStatus } from "@/lib/admin/adminInfrastructure";
import { extendWorkspaceTrial } from "@/lib/admin/extendWorkspaceTrial";
import { repairUserWorkspace } from "@/lib/admin/repairUserWorkspace";
import { repairWorkspaceReminders } from "@/lib/admin/repairWorkspaceReminders";

function revalidateAdmin() {
  for (const path of getAdminRevalidatePaths()) {
    revalidatePath(path);
  }
}

export async function adminSetWorkspacePlanAction(
  workspaceId: string,
  plan: string
): Promise<{
  ok: boolean;
  error?: string;
  storedPlan?: string;
  effectivePlan?: string;
}> {
  try {
    const ctx = await assertAdmin();
    if (!ctx.canAccessFullAdmin) {
      return { ok: false, error: "Admin setup required before changing plans" };
    }

    if (!workspaceId) {
      return { ok: false, error: "Missing workspace ID" };
    }

    const targetPlan = parseAssignableWorkspacePlan(plan);
    if (!targetPlan) {
      return { ok: false, error: "Invalid plan" };
    }

    const result = await changeWorkspacePlan({
      workspaceId,
      targetPlan,
      source: "founder_admin",
      actorUserId: ctx.user.id,
      allowAdminOverride: true,
    });

    if (!result.ok) {
      return { ok: false, error: result.error };
    }

    await logAdminAuditEvent({
      actorUserId: ctx.user.id,
      action: "workspace.plan_changed",
      targetType: "workspace",
      targetId: workspaceId,
      metadata: {
        plan: targetPlan,
        previousEffectivePlan: result.previousEffectivePlan,
        previousStoredPlan: result.previousStoredPlan,
        newEffectivePlan: result.newEffectivePlan,
        transitionType: result.transitionType,
      },
    });

    revalidateAdmin();
    revalidatePath(`/${workspaceId}/settings`);
    revalidatePath(`/${workspaceId}`);

    return {
      ok: true,
      storedPlan: result.newStoredPlan,
      effectivePlan: result.newEffectivePlan,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to update plan",
    };
  }
}

export async function bootstrapSuperAdminAction(): Promise<{
  ok: boolean;
  error?: string;
}> {
  try {
    const ctx = await assertAdmin();
    const infrastructure = await getAdminInfrastructureStatus();

    if (!infrastructure.adminUsersTableInstalled) {
      return {
        ok: false,
        error: "Admin tables are not installed. Run the founder admin migration first.",
      };
    }

    if (!ctx.bootstrapAllowed) {
      return { ok: false, error: "Bootstrap is not available" };
    }

    const admin = supabaseAdmin();
    const { count } = await admin
      .from("admin_users")
      .select("*", { count: "exact", head: true });

    if ((count ?? 0) > 0) {
      return { ok: false, error: "Admin users already exist" };
    }

    const { error } = await admin.from("admin_users").insert({
      user_id: ctx.user.id,
      role: "super_admin",
      created_by: ctx.user.id,
    });

    if (error) {
      return { ok: false, error: error.message };
    }

    await logAdminAuditEvent({
      actorUserId: ctx.user.id,
      action: "admin.bootstrap_super_admin",
      targetType: "admin_user",
      targetId: ctx.user.id,
    });

    revalidateAdmin();
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Bootstrap failed",
    };
  }
}

export async function addAdminUserAction(input: {
  email: string;
  role: AdminRole;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const { user } = await assertSuperAdmin();
    const userId = await findAuthUserIdByEmail(input.email);

    if (!userId) {
      return {
        ok: false,
        error: "User not found. They must sign up before being added as admin.",
      };
    }

    const admin = supabaseAdmin();
    const { error } = await admin.from("admin_users").insert({
      user_id: userId,
      role: input.role,
      created_by: user.id,
    });

    if (error) {
      return { ok: false, error: error.message };
    }

    await logAdminAuditEvent({
      actorUserId: user.id,
      action: "admin.user_added",
      targetType: "admin_user",
      targetId: userId,
      metadata: { email: input.email, role: input.role },
    });

    revalidateAdmin();
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to add admin",
    };
  }
}

export async function updateAdminRoleAction(input: {
  adminUserRowId: string;
  role: AdminRole;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const { user } = await assertSuperAdmin();
    const admin = supabaseAdmin();

    const { data: target, error: loadError } = await admin
      .from("admin_users")
      .select("id, user_id, role")
      .eq("id", input.adminUserRowId)
      .maybeSingle();

    if (loadError || !target) {
      return { ok: false, error: "Admin user not found" };
    }

    if (target.user_id === user.id && input.role !== "super_admin") {
      const { count } = await admin
        .from("admin_users")
        .select("*", { count: "exact", head: true })
        .eq("role", "super_admin");

      if ((count ?? 0) <= 1) {
        return {
          ok: false,
          error: "Cannot demote the last super admin",
        };
      }
    }

    const { error } = await admin
      .from("admin_users")
      .update({ role: input.role, updated_at: new Date().toISOString() })
      .eq("id", input.adminUserRowId);

    if (error) {
      return { ok: false, error: error.message };
    }

    await logAdminAuditEvent({
      actorUserId: user.id,
      action: "admin.role_changed",
      targetType: "admin_user",
      targetId: target.user_id,
      metadata: { role: input.role },
    });

    revalidateAdmin();
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to update role",
    };
  }
}

export async function removeAdminUserAction(
  adminUserRowId: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const { user } = await assertSuperAdmin();
    const admin = supabaseAdmin();

    const { data: target, error: loadError } = await admin
      .from("admin_users")
      .select("id, user_id, role")
      .eq("id", adminUserRowId)
      .maybeSingle();

    if (loadError || !target) {
      return { ok: false, error: "Admin user not found" };
    }

    const { count: superAdminCount } = await admin
      .from("admin_users")
      .select("*", { count: "exact", head: true })
      .eq("role", "super_admin");

    if (target.role === "super_admin" && (superAdminCount ?? 0) <= 1) {
      return { ok: false, error: "Cannot remove the last super admin" };
    }

    if (target.user_id === user.id && (superAdminCount ?? 0) > 1) {
      const { count: totalAdmins } = await admin
        .from("admin_users")
        .select("*", { count: "exact", head: true });

      if ((totalAdmins ?? 0) > 1 && (superAdminCount ?? 0) <= 2) {
        return {
          ok: false,
          error: "Maintain at least two super admins before removing yourself",
        };
      }
    }

    const { error } = await admin.from("admin_users").delete().eq("id", adminUserRowId);

    if (error) {
      return { ok: false, error: error.message };
    }

    await logAdminAuditEvent({
      actorUserId: user.id,
      action: "admin.user_removed",
      targetType: "admin_user",
      targetId: target.user_id,
    });

    revalidateAdmin();
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to remove admin",
    };
  }
}

export async function adminCreateWorkspaceForUserAction(
  userId: string
): Promise<{ ok: boolean; workspaceId?: string; error?: string }> {
  try {
    const result = await repairUserWorkspace(userId);
    if (!result.ok) {
      return { ok: false, error: result.error };
    }

    revalidateAdmin();
    return { ok: true, workspaceId: result.workspaceId };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to create workspace",
    };
  }
}

export async function adminRepairWorkspaceRemindersAction(
  workspaceId: string
): Promise<{
  ok: boolean;
  templatesCreated?: number;
  rulesCreated?: number;
  error?: string;
}> {
  try {
    const ctx = await assertAdmin();
    if (!ctx.canAccessFullAdmin) {
      return { ok: false, error: "Admin setup required before repairing reminders" };
    }

    const result = await repairWorkspaceReminders(workspaceId);
    if (!result.ok) {
      return { ok: false, error: result.error };
    }

    revalidateAdmin();
    return {
      ok: true,
      templatesCreated: result.templatesCreated,
      rulesCreated: result.rulesCreated,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to repair reminders",
    };
  }
}

export async function extendWorkspaceTrialAction(
  workspaceId: string,
  days: number
): Promise<{ ok: boolean; error?: string }> {
  try {
    const ctx = await assertAdmin();
    if (!ctx.canAccessFullAdmin) {
      return { ok: false, error: "Admin setup required before extending trials" };
    }
    const result = await extendWorkspaceTrial(workspaceId, days, supabaseAdmin());

    if (!result.ok) {
      return { ok: false, error: result.error };
    }

    await logAdminAuditEvent({
      actorUserId: ctx.user.id,
      action: "subscription.trial_extended",
      targetType: "workspace",
      targetId: workspaceId,
      metadata: { days },
    });

    revalidateAdmin();
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to extend trial",
    };
  }
}

export async function markWorkspaceRenewedAction(
  workspaceId: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const ctx = await assertAdmin();
    if (!ctx.canAccessFullAdmin) {
      return { ok: false, error: "Admin setup required before marking renewals" };
    }
    const admin = supabaseAdmin();
    const now = new Date();
    const nextPeriod = new Date(now);
    nextPeriod.setDate(nextPeriod.getDate() + 30);

    const { error } = await admin
      .from("workspace_subscriptions")
      .update({
        status: "active",
        current_period_starts_at: now.toISOString(),
        current_period_ends_at: nextPeriod.toISOString(),
        updated_at: now.toISOString(),
      })
      .eq("workspace_id", workspaceId);

    if (error) {
      return { ok: false, error: error.message };
    }

    await logAdminAuditEvent({
      actorUserId: ctx.user.id,
      action: "subscription.marked_renewed",
      targetType: "workspace",
      targetId: workspaceId,
    });

    revalidateAdmin();
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to mark renewed",
    };
  }
}
