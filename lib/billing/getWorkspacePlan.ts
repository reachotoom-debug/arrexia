import { supabaseAdmin } from "@/lib/supabase/admin";
import { perfTime } from "@/lib/perf/server";

import {
  getPlanStorageLimits,
  isWorkspacePlan,
  type WorkspacePlan,
} from "./plans";
import { getWorkspaceEntitlementForBilling } from "./getWorkspaceEntitlement";
import type { TrialDisplayInfo } from "./resolveWorkspaceEntitlement";
import type { WorkspaceEntitlement } from "./resolveWorkspaceEntitlement";

export type { WorkspacePlan };
export type { TrialDisplayInfo };

const DEFAULT_PLAN: WorkspacePlan = "free";

export type WorkspacePlanResult = {
  /** Effective paid plan when active; `free` during trial/expired. */
  plan: WorkspacePlan;
  storedPlan: WorkspacePlan;
  invoiceLimitMonthly: number | null;
  clientLimit: number | null;
  trial: TrialDisplayInfo | null;
  entitlement: WorkspaceEntitlement;
};

async function loadStoredWorkspacePlan(
  workspaceId: string,
  supabase: ReturnType<typeof supabaseAdmin>
): Promise<WorkspacePlan> {
  const { data, error } = await perfTime(
    "workspace-plan",
    "workspacePlansQuery",
    async () =>
      supabase
        .from("workspace_plans")
        .select("plan, invoice_limit_monthly, client_limit")
        .eq("workspace_id", workspaceId)
        .maybeSingle(),
    (result) => `found=${result.data ? 1 : 0}`
  );

  if (error) {
    throw new Error(`Failed to load workspace plan: ${error.message}`);
  }

  if (data) {
    return isWorkspacePlan(data.plan) ? data.plan : DEFAULT_PLAN;
  }

  const defaultLimits = getPlanStorageLimits(DEFAULT_PLAN);
  const { error: insertError } = await perfTime(
    "workspace-plan",
    "workspacePlansInsert",
    async () =>
      supabase.from("workspace_plans").insert({
        workspace_id: workspaceId,
        plan: DEFAULT_PLAN,
        invoice_limit_monthly: defaultLimits.invoice_limit_monthly,
        client_limit: defaultLimits.client_limit,
      }),
    (result) => `inserted=${result.error ? 0 : 1}`
  );

  if (insertError && insertError.code !== "23505") {
    throw new Error(
      `Failed to insert default workspace plan: ${insertError.message}`
    );
  }

  return DEFAULT_PLAN;
}

export async function getWorkspacePlan(workspaceId: string): Promise<WorkspacePlanResult> {
  await loadStoredWorkspacePlan(workspaceId, supabaseAdmin());
  const billing = await getWorkspaceEntitlementForBilling(workspaceId);

  return {
    plan: billing.plan,
    storedPlan: billing.storedPlan,
    invoiceLimitMonthly: billing.invoiceLimitMonthly,
    clientLimit: billing.clientLimit,
    trial: billing.trial,
    entitlement: billing.entitlement,
  };
}
