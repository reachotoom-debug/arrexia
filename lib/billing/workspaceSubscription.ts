import { isPostgrestMissingTableError } from "@/lib/admin/postgrestErrors";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { isWorkspacePlan, type WorkspacePlan } from "./plans";

export type WorkspaceSubscriptionStatus =
  | "trial"
  | "active"
  | "past_due"
  | "cancelled"
  | "expired";

export type WorkspaceSubscriptionSnapshot = {
  status: WorkspaceSubscriptionStatus;
  plan: WorkspacePlan;
  trialStartsAt: string | null;
  trialEndsAt: string | null;
  trialConsumedAt: string | null;
  currentPeriodStartsAt: string | null;
  currentPeriodEndsAt: string | null;
};

type SubscriptionAdmin = Pick<ReturnType<typeof supabaseAdmin>, "from">;

function mapSubscriptionRow(row: {
  status: string;
  plan: string;
  trial_starts_at: string | null;
  trial_ends_at: string | null;
  trial_consumed_at?: string | null;
  current_period_starts_at: string | null;
  current_period_ends_at: string | null;
}): WorkspaceSubscriptionSnapshot {
  const status = row.status as WorkspaceSubscriptionStatus;
  const plan = isWorkspacePlan(row.plan) ? row.plan : "free";

  return {
    status,
    plan,
    trialStartsAt: row.trial_starts_at,
    trialEndsAt: row.trial_ends_at,
    trialConsumedAt: row.trial_consumed_at ?? row.trial_starts_at ?? null,
    currentPeriodStartsAt: row.current_period_starts_at,
    currentPeriodEndsAt: row.current_period_ends_at,
  };
}

export async function loadWorkspaceSubscription(
  workspaceId: string,
  admin: SubscriptionAdmin = supabaseAdmin()
): Promise<WorkspaceSubscriptionSnapshot | null> {
  const { data, error } = await admin
    .from("workspace_subscriptions")
    .select(
      "status, plan, trial_starts_at, trial_ends_at, trial_consumed_at, current_period_starts_at, current_period_ends_at"
    )
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (error) {
    if (isPostgrestMissingTableError(error)) {
      return null;
    }
    throw new Error(`Failed to load workspace subscription: ${error.message}`);
  }

  if (!data) {
    return null;
  }

  return mapSubscriptionRow(data);
}
