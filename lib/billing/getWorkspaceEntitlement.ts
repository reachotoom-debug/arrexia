import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { getPlanDefinition, getPlanStorageLimits, type WorkspacePlan } from "./plans";
import {
  resolveWorkspaceEntitlement,
  type WorkspaceEntitlement,
} from "./resolveWorkspaceEntitlement";
import { loadWorkspaceSubscription } from "./workspaceSubscription";

export type { WorkspaceEntitlement };
export type { EntitlementState } from "./resolveWorkspaceEntitlement";

async function loadTrialConsumedAt(
  workspaceId: string,
  admin: ReturnType<typeof supabaseAdmin>
): Promise<string | null> {
  const [workspaceResult, subscriptionResult] = await Promise.all([
    admin
      .from("workspaces")
      .select("trial_consumed_at")
      .eq("id", workspaceId)
      .maybeSingle(),
    admin
      .from("workspace_subscriptions")
      .select("trial_consumed_at")
      .eq("workspace_id", workspaceId)
      .maybeSingle(),
  ]);

  if (workspaceResult.error) {
    if (
      workspaceResult.error.code === "42P01" ||
      workspaceResult.error.message?.includes("trial_consumed_at")
    ) {
      // Pre-migration environments fall back to subscription evidence only.
    } else {
      throw new Error(`Failed to load workspace trial_consumed_at: ${workspaceResult.error.message}`);
    }
  }

  if (subscriptionResult.error) {
    if (
      subscriptionResult.error.code === "42P01" ||
      subscriptionResult.error.message?.includes("trial_consumed_at")
    ) {
      return (workspaceResult.data?.trial_consumed_at as string | null | undefined) ?? null;
    }
    throw new Error(`Failed to load trial_consumed_at: ${subscriptionResult.error.message}`);
  }

  return (
    (workspaceResult.data?.trial_consumed_at as string | null | undefined) ??
    (subscriptionResult.data?.trial_consumed_at as string | null | undefined) ??
    null
  );
}

async function loadStoredWorkspacePlan(
  workspaceId: string,
  admin: ReturnType<typeof supabaseAdmin>
): Promise<WorkspacePlan> {
  const { data, error } = await admin
    .from("workspace_plans")
    .select("plan")
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load workspace plan: ${error.message}`);
  }

  const plan = data?.plan;
  if (plan === "starter" || plan === "pro" || plan === "business" || plan === "free") {
    return plan;
  }
  return "free";
}

export async function getWorkspaceEntitlementState(
  workspaceId: string,
  now?: Date
): Promise<WorkspaceEntitlement> {
  const admin = supabaseAdmin();
  const [storedPlan, subscription, trialConsumedAt] = await Promise.all([
    loadStoredWorkspacePlan(workspaceId, admin),
    loadWorkspaceSubscription(workspaceId, admin),
    loadTrialConsumedAt(workspaceId, admin),
  ]);

  const freeLimits = getPlanStorageLimits("free");
  const paidLimitsFromStored = getPlanStorageLimits(
    storedPlan === "free" ? "free" : storedPlan
  );

  const entitlement = resolveWorkspaceEntitlement({
    storedPlan,
    subscription,
    trialConsumedAt,
    now,
    paidLimits: {
      clientLimit: paidLimitsFromStored.client_limit,
      invoiceLimitMonthly: paidLimitsFromStored.invoice_limit_monthly,
      workspaceMemberLimit: getPlanDefinition(storedPlan).workspaceMemberLimit,
    },
    legacyFreeLimits: {
      clientLimit: freeLimits.client_limit,
      invoiceLimitMonthly: freeLimits.invoice_limit_monthly,
      workspaceMemberLimit: getPlanDefinition("free").workspaceMemberLimit,
    },
  });

  if (entitlement.state === "paid") {
    const paidPlan = entitlement.paidPlan ?? storedPlan;
    const limits = getPlanStorageLimits(paidPlan);
    return {
      ...entitlement,
      clientLimit: limits.client_limit,
      invoiceLimitMonthly: limits.invoice_limit_monthly,
      workspaceMemberLimit: getPlanDefinition(paidPlan).workspaceMemberLimit,
    };
  }

  if (entitlement.state === "legacy_free" && storedPlan !== "free") {
    const limits = getPlanStorageLimits(storedPlan);
    return {
      ...entitlement,
      state: "paid",
      paidPlan: storedPlan,
      plan: storedPlan,
      canMutate: true,
      clientLimit: limits.client_limit,
      invoiceLimitMonthly: limits.invoice_limit_monthly,
      workspaceMemberLimit: getPlanDefinition(storedPlan).workspaceMemberLimit,
    };
  }

  return entitlement;
}

/** Backward-compatible adapter for existing getWorkspacePlan consumers. */
export async function getWorkspaceEntitlementForBilling(workspaceId: string) {
  const entitlement = await getWorkspaceEntitlementState(workspaceId);
  return {
    plan:
      entitlement.state === "paid" && entitlement.paidPlan
        ? entitlement.paidPlan
        : entitlement.plan,
    storedPlan: entitlement.storedPlan,
    invoiceLimitMonthly:
      entitlement.state === "trial"
        ? null
        : entitlement.invoiceLimitMonthly,
    clientLimit: entitlement.clientLimit,
    trial: entitlement.trial,
    entitlement,
  };
}
