import { isPostgrestMissingTableError } from "@/lib/admin/postgrestErrors";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  isWorkspacePlan,
  normalizeBillingInterval,
  type BillingInterval,
  type WorkspacePlan,
} from "./plans";

export type WorkspaceSubscriptionStatus =
  | "trial"
  | "active"
  | "past_due"
  | "cancelled"
  | "expired";

export type WorkspaceSubscriptionSnapshot = {
  status: WorkspaceSubscriptionStatus;
  plan: WorkspacePlan;
  /** Normalized on read; legacy fixtures may omit. */
  billingInterval?: BillingInterval;
  trialStartsAt: string | null;
  trialEndsAt: string | null;
  trialConsumedAt: string | null;
  currentPeriodStartsAt: string | null;
  currentPeriodEndsAt: string | null;
  cancelAtPeriodEnd?: boolean;
  paymentProvider?: string | null;
  providerCustomerId?: string | null;
  providerSubscriptionId?: string | null;
};

type SubscriptionAdmin = Pick<ReturnType<typeof supabaseAdmin>, "from">;

function mapSubscriptionRow(row: {
  status: string;
  plan: string;
  billing_interval?: string | null;
  trial_starts_at: string | null;
  trial_ends_at: string | null;
  trial_consumed_at?: string | null;
  current_period_starts_at: string | null;
  current_period_ends_at: string | null;
  cancel_at_period_end?: boolean | null;
  payment_provider?: string | null;
  provider_customer_id?: string | null;
  provider_subscription_id?: string | null;
}): WorkspaceSubscriptionSnapshot {
  const status = row.status as WorkspaceSubscriptionStatus;
  const plan = isWorkspacePlan(row.plan) ? row.plan : "free";

  return {
    status,
    plan,
    billingInterval: normalizeBillingInterval(row.billing_interval),
    trialStartsAt: row.trial_starts_at,
    trialEndsAt: row.trial_ends_at,
    trialConsumedAt: row.trial_consumed_at ?? row.trial_starts_at ?? null,
    currentPeriodStartsAt: row.current_period_starts_at,
    currentPeriodEndsAt: row.current_period_ends_at,
    cancelAtPeriodEnd: Boolean(row.cancel_at_period_end ?? false),
    paymentProvider:
      typeof row.payment_provider === "string" ? row.payment_provider : null,
    providerCustomerId:
      typeof row.provider_customer_id === "string" ? row.provider_customer_id : null,
    providerSubscriptionId:
      typeof row.provider_subscription_id === "string"
        ? row.provider_subscription_id
        : null,
  };
}

export async function loadWorkspaceSubscription(
  workspaceId: string,
  admin: SubscriptionAdmin = supabaseAdmin()
): Promise<WorkspaceSubscriptionSnapshot | null> {
  const { data, error } = await admin
    .from("workspace_subscriptions")
    .select(
      "status, plan, billing_interval, trial_starts_at, trial_ends_at, trial_consumed_at, current_period_starts_at, current_period_ends_at, cancel_at_period_end, payment_provider, provider_customer_id, provider_subscription_id"
    )
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (error) {
    if (isPostgrestMissingTableError(error)) {
      return null;
    }
    if (error.message?.includes("billing_interval")) {
      const { data: legacyData, error: legacyError } = await admin
        .from("workspace_subscriptions")
        .select(
          "status, plan, trial_starts_at, trial_ends_at, trial_consumed_at, current_period_starts_at, current_period_ends_at"
        )
        .eq("workspace_id", workspaceId)
        .maybeSingle();

      if (legacyError) {
        if (isPostgrestMissingTableError(legacyError)) {
          return null;
        }
        throw new Error(`Failed to load workspace subscription: ${legacyError.message}`);
      }

      if (!legacyData) {
        return null;
      }

      return mapSubscriptionRow({ ...legacyData, billing_interval: "monthly" });
    }
    throw new Error(`Failed to load workspace subscription: ${error.message}`);
  }

  if (!data) {
    return null;
  }

  return mapSubscriptionRow(data);
}
