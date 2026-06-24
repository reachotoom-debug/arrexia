import { supabaseServer } from "@/lib/supabase/server";

/**
 * Resolve organization_id for a workspace (multi-tenant source of truth).
 */
export async function getWorkspaceOrganizationId(workspaceId: string): Promise<string> {
  const supabase = await supabaseServer();

  const { data, error } = await supabase
    .from("workspaces")
    .select("organization_id")
    .eq("id", workspaceId)
    .single();

  if (error || !data?.organization_id) {
    throw new Error(
      `Workspace organization_id not found for workspace ${workspaceId}${error?.message ? `: ${error.message}` : ""}`
    );
  }

  return data.organization_id;
}
