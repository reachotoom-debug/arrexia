import { supabaseAdmin } from "@/lib/supabase/admin";
import { getPlanStorageLimits, type WorkspacePlan } from "./plans";

export async function setWorkspacePlan(
  workspaceId: string,
  plan: WorkspacePlan
): Promise<void> {
  const admin = supabaseAdmin();
  const limits = getPlanStorageLimits(plan);

  const { error } = await admin.from("workspace_plans").upsert(
    {
      workspace_id: workspaceId,
      plan,
      ...limits,
    },
    { onConflict: "workspace_id" }
  );

  if (error) {
    throw new Error(`Failed to set workspace plan: ${error.message}`);
  }
}
