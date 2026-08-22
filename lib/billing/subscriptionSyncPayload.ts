import type { WorkspacePlan, BillingInterval } from "./plans";
import type { SubscriptionSyncMode } from "./planMutationPolicy";
import type { WorkspaceSubscriptionSnapshot } from "./workspaceSubscription";
import { computePaidPeriodEnd } from "./billingPeriod";

export type SyncWorkspaceSubscriptionResult =
  | { ok: true }
  | { ok: false; reason: "missing_table" | "sync_failed"; error?: string };

import { TRIAL_DURATION_DAYS } from "./trialConfig";

/** @deprecated Paid activation uses calendar-month periods via computePaidPeriodEnd. */
export const MANUAL_BILLING_PERIOD_DAYS = 30;
export const ADMIN_FREE_TRIAL_DAYS = TRIAL_DURATION_DAYS;

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export type BuildSubscriptionUpsertPayloadOptions = {
  billingInterval?: BillingInterval;
};

export function buildSubscriptionUpsertPayload(
  workspaceId: string,
  targetPlan: WorkspacePlan,
  mode: SubscriptionSyncMode,
  existing: WorkspaceSubscriptionSnapshot | null,
  now: Date = new Date(),
  options: BuildSubscriptionUpsertPayloadOptions = {}
): Record<string, unknown> | null {
  const nowIso = now.toISOString();
  const billingInterval: BillingInterval = options.billingInterval ?? "monthly";

  if (mode === "none") {
    return null;
  }

  if (mode === "admin_free") {
    return {
      workspace_id: workspaceId,
      plan: "free",
      status: "trial",
      payment_provider: "manual",
      billing_interval: "monthly",
      trial_starts_at: existing?.trialStartsAt ?? nowIso,
      trial_ends_at: addDays(now, ADMIN_FREE_TRIAL_DAYS).toISOString(),
      updated_at: nowIso,
    };
  }

  if (mode === "active_trial_plan_change") {
    return {
      workspace_id: workspaceId,
      plan: targetPlan,
      status: "trial",
      payment_provider: "manual",
      billing_interval: existing?.billingInterval ?? "monthly",
      trial_starts_at: existing?.trialStartsAt ?? nowIso,
      trial_ends_at: existing?.trialEndsAt ?? addDays(now, ADMIN_FREE_TRIAL_DAYS).toISOString(),
      updated_at: nowIso,
    };
  }

  if (mode === "activate_paid") {
    const periodEnd = computePaidPeriodEnd(now, billingInterval);
    return {
      workspace_id: workspaceId,
      plan: targetPlan,
      status: "active",
      payment_provider: "manual",
      billing_interval: billingInterval,
      trial_starts_at: existing?.trialStartsAt ?? null,
      trial_ends_at: existing?.trialEndsAt ?? null,
      current_period_starts_at: nowIso,
      current_period_ends_at: periodEnd.toISOString(),
      updated_at: nowIso,
    };
  }

  return null;
}
