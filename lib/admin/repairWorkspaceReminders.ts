import { logAdminAuditEvent } from "@/lib/admin/adminAudit";
import { assertAdmin } from "@/lib/admin/requireAdmin";
import { isWorkspacePlan } from "@/lib/billing/plans";
import {
  provisionDefaultReminderSetup,
  resolveWorkspacePlanForProvisioning,
} from "@/lib/reminders/provisionDefaultSetup";
import { supabaseAdmin } from "@/lib/supabase/admin";

export type RepairWorkspaceRemindersResult =
  | {
      ok: true;
      templatesCreated: number;
      rulesCreated: number;
    }
  | { ok: false; error: string };

/**
 * Founder/admin repair for workspaces missing canonical reminder templates/rules.
 * Uses the same idempotent provisioning service as bootstrap and plan changes.
 * Does not auto-run in production — invoke explicitly from admin UI or script.
 */
export async function repairWorkspaceReminders(
  workspaceId: string
): Promise<RepairWorkspaceRemindersResult> {
  const { user: actor } = await assertAdmin();

  const trimmedWorkspaceId = workspaceId.trim();
  if (!trimmedWorkspaceId) {
    return { ok: false, error: "Missing workspace ID" };
  }

  const admin = supabaseAdmin();

  const { data: workspace, error: workspaceError } = await admin
    .from("workspaces")
    .select("id")
    .eq("id", trimmedWorkspaceId)
    .maybeSingle();

  if (workspaceError) {
    return { ok: false, error: "Failed to verify workspace" };
  }

  if (!workspace?.id) {
    return { ok: false, error: "Workspace not found" };
  }

  try {
    const plan = await resolveWorkspacePlanForProvisioning(admin, trimmedWorkspaceId);
    if (!isWorkspacePlan(plan)) {
      return { ok: false, error: "Invalid workspace plan" };
    }

    const result = await provisionDefaultReminderSetup({
      workspaceId: trimmedWorkspaceId,
      plan,
      admin,
    });

    await logAdminAuditEvent({
      actorUserId: actor.id,
      action: "workspace.reminders_repaired",
      targetType: "workspace",
      targetId: trimmedWorkspaceId,
      metadata: {
        plan,
        templatesCreated: result.templatesCreated,
        rulesCreated: result.rulesCreated,
      },
    });

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
