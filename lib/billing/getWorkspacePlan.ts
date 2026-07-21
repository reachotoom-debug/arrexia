import { supabaseAdmin } from "@/lib/supabase/admin";
import { perfTime } from "@/lib/perf/server";

import {

  getPlanStorageLimits,

  isWorkspacePlan,

  type WorkspacePlan,

} from "./plans";



export type { WorkspacePlan };



const DEFAULT_PLAN: WorkspacePlan = "free";



export async function getWorkspacePlan(workspaceId: string) {
  const supabase = supabaseAdmin();

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
    const plan = isWorkspacePlan(data.plan) ? data.plan : DEFAULT_PLAN;
    const definitionLimits = getPlanStorageLimits(plan);

    return {
      plan,
      invoiceLimitMonthly: definitionLimits.invoice_limit_monthly,
      clientLimit: definitionLimits.client_limit,
    };
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

  return {
    plan: DEFAULT_PLAN,
    invoiceLimitMonthly: defaultLimits.invoice_limit_monthly,
    clientLimit: defaultLimits.client_limit,
  };
}


