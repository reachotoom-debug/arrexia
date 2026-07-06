import { logAdminAuditEvent } from "@/lib/admin/adminAudit";
import { assertSuperAdmin } from "@/lib/admin/requireAdmin";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { ensureWorkspaceForUser } from "@/lib/workspaces/ensureWorkspaceForUser";

export type RepairUserWorkspaceResult =
  | { ok: true; workspaceId: string }
  | { ok: false; error: string };

export async function repairUserWorkspace(userId: string): Promise<RepairUserWorkspaceResult> {
  const { user: actor } = await assertSuperAdmin();

  const trimmedUserId = userId.trim();
  if (!trimmedUserId) {
    return { ok: false, error: "Missing user ID" };
  }

  const admin = supabaseAdmin();
  const { count, error: countError } = await admin
    .from("workspace_members")
    .select("*", { count: "exact", head: true })
    .eq("user_id", trimmedUserId);

  if (countError) {
    return { ok: false, error: "Failed to verify workspace membership" };
  }

  if ((count ?? 0) > 0) {
    return { ok: false, error: "User already has a workspace" };
  }

  try {
    const workspaceId = await ensureWorkspaceForUser(trimmedUserId);

    await logAdminAuditEvent({
      actorUserId: actor.id,
      action: "user.workspace_repaired",
      targetType: "user",
      targetId: trimmedUserId,
      metadata: { workspaceId },
    });

    return { ok: true, workspaceId };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to create workspace",
    };
  }
}
