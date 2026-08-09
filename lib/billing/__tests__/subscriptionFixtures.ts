import type { WorkspaceSubscriptionSnapshot } from "@/lib/billing/workspaceSubscription";

/** Shared subscription fixtures for billing tests. */
export function subscriptionSnapshot(
  overrides: Partial<WorkspaceSubscriptionSnapshot> &
    Pick<WorkspaceSubscriptionSnapshot, "status" | "plan">
): WorkspaceSubscriptionSnapshot {
  return {
    trialStartsAt: null,
    trialEndsAt: null,
    trialConsumedAt: null,
    currentPeriodStartsAt: null,
    currentPeriodEndsAt: null,
    ...overrides,
  };
}
