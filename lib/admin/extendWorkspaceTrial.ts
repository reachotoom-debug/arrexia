import "server-only";

import { getWorkspaceEntitlementState } from "@/lib/billing/getWorkspaceEntitlement";
import type { SupabaseClient } from "@supabase/supabase-js";

export const PAID_TRIAL_EXTENSION_BLOCKED_MESSAGE =
  "Cannot extend a trial for a paid workspace.";

export type ExtendWorkspaceTrialResult =
  | { ok: true; trialEndsAt: string }
  | { ok: false; error: string };

export async function extendWorkspaceTrial(
  workspaceId: string,
  days: number,
  admin: SupabaseClient
): Promise<ExtendWorkspaceTrialResult> {
  const entitlement = await getWorkspaceEntitlementState(workspaceId);
  if (entitlement.state === "paid") {
    return { ok: false, error: PAID_TRIAL_EXTENSION_BLOCKED_MESSAGE };
  }

  const { data: sub, error: loadError } = await admin
    .from("workspace_subscriptions")
    .select("trial_ends_at")
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (loadError || !sub) {
    return { ok: false, error: "Subscription not found" };
  }

  const base = sub.trial_ends_at ? new Date(sub.trial_ends_at) : new Date();
  base.setDate(base.getDate() + days);
  const trialEndsAt = base.toISOString();

  const { error } = await admin
    .from("workspace_subscriptions")
    .update({
      trial_ends_at: trialEndsAt,
      status: "trial",
      updated_at: new Date().toISOString(),
    })
    .eq("workspace_id", workspaceId);

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true, trialEndsAt };
}
