/**
 * One-time / operator repair for workspaces missing canonical reminder data.
 *
 * Usage:
 *   npx ts-node --project scripts/tsconfig.json scripts/repair-reminder-provisioning.ts <workspaceId>
 *   npx ts-node --project scripts/tsconfig.json scripts/repair-reminder-provisioning.ts <workspaceId> --apply
 *
 * Default is dry-run (reports plan + would invoke provisioning only with --apply).
 * Does NOT run automatically — explicit operator action required.
 */

import { repairWorkspaceReminders } from "../lib/admin/repairWorkspaceReminders";
import { isWorkspacePlan } from "../lib/billing/plans";
import { provisionDefaultReminderSetup } from "../lib/reminders/provisionDefaultSetup";
import { supabaseAdmin } from "../lib/supabase/admin";

async function main() {
  const workspaceId = process.argv[2]?.trim();
  const apply = process.argv.includes("--apply");
  const useAdminRepair = process.argv.includes("--admin-audit");

  if (!workspaceId) {
    console.error(
      "Usage: repair-reminder-provisioning.ts <workspaceId> [--apply] [--admin-audit]"
    );
    process.exit(1);
  }

  const admin = supabaseAdmin();
  const { data: workspace, error } = await admin
    .from("workspaces")
    .select("id, name")
    .eq("id", workspaceId)
    .maybeSingle();

  if (error || !workspace) {
    console.error("Workspace not found or lookup failed.");
    process.exit(1);
  }

  const { data: planRow } = await admin
    .from("workspace_plans")
    .select("plan")
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  const plan = isWorkspacePlan(planRow?.plan) ? planRow.plan : "free";

  const [{ count: templateCount }, { count: ruleCount }] = await Promise.all([
    admin
      .from("reminder_templates")
      .select("*", { count: "exact", head: true })
      .eq("workspace_id", workspaceId),
    admin
      .from("reminder_rules")
      .select("*", { count: "exact", head: true })
      .eq("workspace_id", workspaceId),
  ]);

  console.log("Workspace:", workspace.name, workspaceId);
  console.log("Plan:", plan);
  console.log("Current templates:", templateCount ?? 0);
  console.log("Current rules:", ruleCount ?? 0);

  if (!apply) {
    console.log("\nDry run — pass --apply to provision canonical reminder setup.");
    return;
  }

  if (useAdminRepair) {
    const result = await repairWorkspaceReminders(workspaceId);
    if (!result.ok) {
      console.error("Repair failed:", result.error);
      process.exit(1);
    }
    console.log("Repair complete (admin audit logged).", result);
    return;
  }

  const result = await provisionDefaultReminderSetup({ workspaceId, plan, admin });
  console.log("Provision complete.", result);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
