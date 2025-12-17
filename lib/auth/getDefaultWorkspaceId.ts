import { requireUser } from "@/lib/auth/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * Returns the first (oldest) workspace membership for the authenticated user.
 * Throws if no workspace exists. Use only on server.
 */
export async function getDefaultWorkspaceId(): Promise<string> {
  const { user } = await requireUser();
  const admin = supabaseAdmin();

  const { data, error } = await admin
    .from("workspace_members")
    .select("workspace_id, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1);

  if (error) {
    throw new Error(`Failed to load workspace memberships: ${error.message}`);
  }

  const workspaceId = data?.[0]?.workspace_id;
  if (!workspaceId) {
    throw new Error("No workspace found for this account.");
  }

  return workspaceId;
}
