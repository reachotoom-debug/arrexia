import type { WorkspacePlan } from "./plans";
import {
  resolveWorkspaceEntitlement,
  type TrialDisplayInfo,
} from "./resolveWorkspaceEntitlement";
import type { WorkspaceSubscriptionSnapshot } from "./workspaceSubscription";

export type { TrialDisplayInfo };

/** @deprecated Use EntitlementState from resolveWorkspaceEntitlement */
export type EffectivePlanEntitlementSource =
  | "legacy_no_subscription"
  | "paid_subscription"
  | "active_trial"
  | "expired_trial"
  | "expired_subscription"
  | "stored_plan";

/** @deprecated Use WorkspaceEntitlement from resolveWorkspaceEntitlement */
export type EffectivePlanResolution = {
  effectivePlan: WorkspacePlan;
  storedPlan: WorkspacePlan;
  trial: TrialDisplayInfo | null;
  entitlementSource: EffectivePlanEntitlementSource;
};

function mapEntitlementSource(
  state: ReturnType<typeof resolveWorkspaceEntitlement>["state"]
): EffectivePlanEntitlementSource {
  switch (state) {
    case "trial":
      return "active_trial";
    case "trial_expired":
      return "expired_trial";
    case "paid":
      return "paid_subscription";
    case "legacy_free":
    default:
      return "legacy_no_subscription";
  }
}

/**
 * Backward-compatible adapter over resolveWorkspaceEntitlement.
 * Active standalone trials no longer map to starter/pro/business effective plans.
 */
export function resolveEffectiveWorkspacePlan(
  storedPlan: WorkspacePlan,
  subscription: WorkspaceSubscriptionSnapshot | null,
  now: Date = new Date()
): EffectivePlanResolution {
  const entitlement = resolveWorkspaceEntitlement({
    storedPlan,
    subscription,
    trialConsumedAt: subscription?.trialConsumedAt ?? null,
    now,
  });

  const effectivePlan =
    entitlement.state === "paid" && entitlement.paidPlan
      ? entitlement.paidPlan
      : entitlement.plan;

  return {
    effectivePlan,
    storedPlan: entitlement.storedPlan,
    trial: entitlement.trial,
    entitlementSource: mapEntitlementSource(entitlement.state),
  };
}
