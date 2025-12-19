import { supabaseAdmin } from "@/lib/supabase/admin";
import type { WorkspacePlan } from "./getWorkspacePlan";

export async function setWorkspacePlan(
  workspaceId: string,
  plan: WorkspacePlan
): Promise<void> {
  const admin = supabaseAdmin();

  const limits =
    plan === "free"
      ? { invoice_limit_monthly: 5, client_limit: 5 }
      : { invoice_limit_monthly: null, client_limit: null };

  const { error } = await admin
    .from("workspace_plans")
    .upsert(
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
