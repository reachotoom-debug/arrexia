import type { WorkspaceSubscriptionStatus } from "../../workspaceSubscription";

export type PaddleLifecycleOrderingDecision =
  | { action: "apply" }
  | { action: "ignore"; reason: "stale_event_ignored" };

const SUBSCRIPTION_STATUS_RANK: Record<WorkspaceSubscriptionStatus, number> = {
  active: 4,
  trial: 3,
  past_due: 2,
  cancelled: 1,
  expired: 0,
};

export function wouldDowngradeSubscriptionStatus(
  currentStatus: WorkspaceSubscriptionStatus,
  incomingStatus: WorkspaceSubscriptionStatus
): boolean {
  return SUBSCRIPTION_STATUS_RANK[incomingStatus] < SUBSCRIPTION_STATUS_RANK[currentStatus];
}

function parseOccurredAtMs(occurredAt: string): number | null {
  const parsed = Date.parse(occurredAt);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Determines whether a Paddle subscription lifecycle webhook should mutate entitlement state.
 * transaction.completed is out of scope — callers must only use this for lifecycle events.
 */
export function evaluatePaddleLifecycleEventOrdering(input: {
  incomingOccurredAt: string;
  storedProviderLastEventAt: string | null;
  currentStatus: WorkspaceSubscriptionStatus;
  incomingStatus: WorkspaceSubscriptionStatus;
}): PaddleLifecycleOrderingDecision {
  const incomingMs = parseOccurredAtMs(input.incomingOccurredAt);
  if (incomingMs === null) {
    return { action: "apply" };
  }

  if (!input.storedProviderLastEventAt) {
    return { action: "apply" };
  }

  const storedMs = parseOccurredAtMs(input.storedProviderLastEventAt);
  if (storedMs === null) {
    return { action: "apply" };
  }

  if (incomingMs < storedMs) {
    return { action: "ignore", reason: "stale_event_ignored" };
  }

  if (
    incomingMs === storedMs &&
    wouldDowngradeSubscriptionStatus(input.currentStatus, input.incomingStatus)
  ) {
    return { action: "ignore", reason: "stale_event_ignored" };
  }

  return { action: "apply" };
}
