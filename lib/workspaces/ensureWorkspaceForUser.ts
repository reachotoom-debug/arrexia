import { supabaseAdmin } from "@/lib/supabase/admin";

export async function ensureWorkspaceForUser(userId: string): Promise<string> {
  const admin = supabaseAdmin();

  const { data: memberships, error: membershipsError } = await admin
    .from("workspace_members")
    .select("workspace_id, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1);

  if (membershipsError) {
    throw new Error(`Failed to load memberships: ${membershipsError.message}`);
  }

  const existingWorkspaceId = memberships?.[0]?.workspace_id;
  if (existingWorkspaceId) {
    return existingWorkspaceId;
  }

  const { data: workspaceRow, error: workspaceError } = await admin
    .from("workspaces")
    .insert({ name: "My Workspace" })
    .select("id")
    .single();

  if (workspaceError || !workspaceRow?.id) {
    throw new Error(
      `Failed to create workspace: ${workspaceError?.message ?? "Unknown error"}`
    );
  }

  const { error: memberError } = await admin.from("workspace_members").insert({
    workspace_id: workspaceRow.id,
    user_id: userId,
    role: "owner",
  });

  if (memberError) {
    throw new Error(`Failed to add membership: ${memberError.message}`);
  }

  return workspaceRow.id;
}
