import type { WorkspaceBootstrapAdmin } from "@/lib/workspaces/ensureWorkspaceForUser";
import { getPlanStorageLimits } from "./plans";

export async function revertWorkspacePlanToFree(
  admin: WorkspaceBootstrapAdmin,
  workspaceId: string
): Promise<void> {
  const limits = getPlanStorageLimits("free");

  const { error } = await admin
    .from("workspace_plans")
    .update({
      plan: "free",
      invoice_limit_monthly: limits.invoice_limit_monthly,
      client_limit: limits.client_limit,
    })
    .eq("workspace_id", workspaceId);

  if (error) {
    console.error("[billing/revert-workspace-plan] failed to revert to free", {
      workspaceId,
      code: error.code,
      message: error.message,
    });
  }
}
