import { isPostgrestMissingTableError } from "@/lib/admin/postgrestErrors";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  PUBLIC_TRIAL_DURATION_MS,
  type PublicSignupTrialPlan,
} from "./publicTrialPlan";

type SubscriptionAdmin = Pick<ReturnType<typeof supabaseAdmin>, "from">;

export type CreatePublicTrialSubscriptionResult =
  | { ok: true; created: boolean }
  | { ok: false; reason: "missing_table" | "insert_failed" };

/**
 * Inserts self-serve trial metadata once. Never updates an existing row (no trial extension on retry).
 */
export async function createPublicTrialSubscription(
  workspaceId: string,
  plan: PublicSignupTrialPlan,
  admin: SubscriptionAdmin = supabaseAdmin()
): Promise<CreatePublicTrialSubscriptionResult> {
  const { data: existing, error: lookupError } = await admin
    .from("workspace_subscriptions")
    .select("workspace_id")
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (lookupError) {
    if (isPostgrestMissingTableError(lookupError)) {
      return { ok: false, reason: "missing_table" };
    }
    return { ok: false, reason: "insert_failed" };
  }

  if (existing) {
    return { ok: true, created: false };
  }

  const now = new Date();
  const trialEndsAt = new Date(now.getTime() + PUBLIC_TRIAL_DURATION_MS).toISOString();

  const { error: insertError } = await admin.from("workspace_subscriptions").insert({
    workspace_id: workspaceId,
    plan,
    status: "trial",
    payment_provider: "manual",
    trial_starts_at: now.toISOString(),
    trial_ends_at: trialEndsAt,
    updated_at: now.toISOString(),
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

  return { ok: true, created: true };
}
