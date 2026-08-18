import { isPostgrestMissingTableError } from "@/lib/admin/postgrestErrors";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { computeTrialEndsAt } from "./trialConfig";

type SubscriptionAdmin = Pick<ReturnType<typeof supabaseAdmin>, "from">;

export type CreateArrexiaTrialResult =
  | { ok: true; created: boolean }
  | { ok: false; reason: "missing_table" | "insert_failed" | "trial_already_consumed" };

/**
 * Creates the standalone Arrexia trial once per workspace.
 * Never updates an existing subscription row (no trial extension/restart on retry).
 */
export async function createArrexiaTrialSubscription(
  workspaceId: string,
  admin: SubscriptionAdmin = supabaseAdmin(),
  now: Date = new Date()
): Promise<CreateArrexiaTrialResult> {
  const { data: existing, error: lookupError } = await admin
    .from("workspace_subscriptions")
    .select("workspace_id, trial_consumed_at, trial_starts_at")
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  const { data: workspaceRow } = await admin
    .from("workspaces")
    .select("trial_consumed_at")
    .eq("id", workspaceId)
    .maybeSingle();

  if (workspaceRow?.trial_consumed_at) {
    return { ok: true, created: false };
  }

  if (lookupError) {
    if (isPostgrestMissingTableError(lookupError)) {
      return { ok: false, reason: "missing_table" };
    }
    return { ok: false, reason: "insert_failed" };
  }

  if (existing) {
    if (existing.trial_consumed_at || existing.trial_starts_at) {
      return { ok: true, created: false };
    }
    return { ok: false, reason: "trial_already_consumed" };
  }

  const trialStartsAt = now.toISOString();
  const trialEndsAt = computeTrialEndsAt(now);

  const { error: insertError } = await admin.from("workspace_subscriptions").insert({
    workspace_id: workspaceId,
    plan: "free",
    status: "trial",
    payment_provider: "manual",
    trial_starts_at: trialStartsAt,
    trial_ends_at: trialEndsAt,
    trial_consumed_at: trialStartsAt,
    updated_at: trialStartsAt,
  });

  if (insertError) {
    if (insertError.code === "23505") {
      return { ok: true, created: false };
    }
    if (isPostgrestMissingTableError(insertError)) {
      return { ok: false, reason: "missing_table" };
    }
    return { ok: false, reason: "insert_failed" };
  }

  await admin
    .from("workspaces")
    .update({ trial_consumed_at: trialStartsAt })
    .eq("id", workspaceId)
    .is("trial_consumed_at", null);

  const { enqueueTrialStartedEmail } = await import("@/lib/billing/trialLifecycleScheduling");
  enqueueTrialStartedEmail(workspaceId);

  return { ok: true, created: true };
}

/** @deprecated Use createArrexiaTrialSubscription */
export async function createPublicTrialSubscription(
  workspaceId: string,
  _plan: "starter" | "pro",
  admin?: SubscriptionAdmin
): Promise<CreateArrexiaTrialResult> {
  void _plan;
  return createArrexiaTrialSubscription(workspaceId, admin);
}
