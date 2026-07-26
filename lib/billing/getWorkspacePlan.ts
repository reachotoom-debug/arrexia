import { supabaseAdmin } from "@/lib/supabase/admin";
import { perfTime } from "@/lib/perf/server";

import {
  getPlanStorageLimits,
  isWorkspacePlan,
  type WorkspacePlan,
} from "./plans";
import { resolveEffectiveWorkspacePlan } from "./resolveEffectiveWorkspacePlan";
import type { TrialDisplayInfo } from "./resolveEffectiveWorkspacePlan";
import { loadWorkspaceSubscription } from "./workspaceSubscription";

export type { WorkspacePlan };
export type { TrialDisplayInfo };

const DEFAULT_PLAN: WorkspacePlan = "free";

export type WorkspacePlanResult = {
  /** Effective entitlement used for limits and feature gates. */
  plan: WorkspacePlan;
  /** Row stored in workspace_plans (unchanged by trial expiration). */
  storedPlan: WorkspacePlan;
  invoiceLimitMonthly: number | null;
  clientLimit: number | null;
  trial: TrialDisplayInfo | null;
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
  const supabase = supabaseAdmin();

  const [storedPlan, subscription] = await Promise.all([
    loadStoredWorkspacePlan(workspaceId, supabase),
    loadWorkspaceSubscription(workspaceId, supabase),
  ]);

  const resolution = resolveEffectiveWorkspacePlan(storedPlan, subscription);
  const definitionLimits = getPlanStorageLimits(resolution.effectivePlan);

  return {
    plan: resolution.effectivePlan,
    storedPlan: resolution.storedPlan,
    invoiceLimitMonthly: definitionLimits.invoice_limit_monthly,
    clientLimit: definitionLimits.client_limit,
    trial: resolution.trial,
  };
}
