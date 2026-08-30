import type { WorkspaceSubscriptionStatus } from "../../workspaceSubscription";

export type PaddleSubscriptionLifecycleStatus =
  | "active"
  | "canceled"
  | "past_due"
  | "paused"
  | "trialing";

export type MappedPaddleSubscriptionState = {
  status: WorkspaceSubscriptionStatus;
  cancelAtPeriodEnd: boolean;
};

/** Maps Paddle subscription lifecycle to existing Arrexia subscription_status semantics. */
export function mapPaddleSubscriptionToArrexiaState(input: {
  paddleStatus: string;
  scheduledChangeAction?: string | null;
}): MappedPaddleSubscriptionState {
  const scheduledAction = input.scheduledChangeAction?.toLowerCase() ?? null;
  const cancelAtPeriodEnd = scheduledAction === "cancel";

  switch (input.paddleStatus) {
    case "active":
    case "trialing":
      return { status: "active", cancelAtPeriodEnd };
    case "past_due":
      return { status: "past_due", cancelAtPeriodEnd: false };
    case "paused":
      // No explicit paused status in Arrexia — use past_due as non-destructive restricted state.
      return { status: "past_due", cancelAtPeriodEnd: false };
    case "canceled":
      return { status: "cancelled", cancelAtPeriodEnd: false };
    default:
      return { status: "expired", cancelAtPeriodEnd: false };
  }
}
