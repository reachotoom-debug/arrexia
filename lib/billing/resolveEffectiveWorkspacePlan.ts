import { isWorkspacePlan, type WorkspacePlan } from "./plans";
import type { WorkspaceSubscriptionSnapshot } from "./workspaceSubscription";

export type TrialDisplayStatus = "active" | "expired";

export type TrialDisplayInfo = {
  status: TrialDisplayStatus;
  trialPlan: WorkspacePlan;
  trialEndsAt: string | null;
  daysRemaining: number;
};

export type EffectivePlanEntitlementSource =
  | "legacy_no_subscription"
  | "paid_subscription"
  | "active_trial"
  | "expired_trial"
  | "expired_subscription"
  | "stored_plan";

export type EffectivePlanResolution = {
  effectivePlan: WorkspacePlan;
  storedPlan: WorkspacePlan;
  trial: TrialDisplayInfo | null;
  entitlementSource: EffectivePlanEntitlementSource;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function isPaidStoredPlan(plan: WorkspacePlan): boolean {
  return plan === "starter" || plan === "pro" || plan === "business";
}

function resolveTrialPlan(
  storedPlan: WorkspacePlan,
  subscriptionPlan: WorkspacePlan
): WorkspacePlan {
  if (isPaidStoredPlan(storedPlan)) {
    return storedPlan;
  }
  return subscriptionPlan;
}

function computeDaysRemaining(trialEndsAt: string, nowMs: number): number {
  const trialEndMs = Date.parse(trialEndsAt);
  if (Number.isNaN(trialEndMs)) {
    return 0;
  }
  return Math.max(0, Math.ceil((trialEndMs - nowMs) / MS_PER_DAY));
}

/**
 * Resolves the entitlement used for limits and feature gates.
 * Stored workspace_plans rows are never mutated by expiration — only effective entitlement changes.
 */
export function resolveEffectiveWorkspacePlan(
  storedPlan: WorkspacePlan,
  subscription: WorkspaceSubscriptionSnapshot | null,
  now: Date = new Date()
): EffectivePlanResolution {
  const nowMs = now.getTime();

  if (!subscription) {
    return {
      effectivePlan: storedPlan,
      storedPlan,
      trial: null,
      entitlementSource: "legacy_no_subscription",
    };
  }

  if (subscription.status === "active" || subscription.status === "past_due") {
    const paidPlan = isWorkspacePlan(subscription.plan) ? subscription.plan : storedPlan;
    return {
      effectivePlan: paidPlan,
      storedPlan,
      trial: null,
      entitlementSource: "paid_subscription",
    };
  }

  if (subscription.status === "trial") {
    const trialPlan = resolveTrialPlan(storedPlan, subscription.plan);

    if (subscription.trialEndsAt) {
      const trialEndMs = Date.parse(subscription.trialEndsAt);
      if (!Number.isNaN(trialEndMs) && trialEndMs > nowMs) {
        return {
          effectivePlan: trialPlan,
          storedPlan,
          trial: {
            status: "active",
            trialPlan,
            trialEndsAt: subscription.trialEndsAt,
            daysRemaining: computeDaysRemaining(subscription.trialEndsAt, nowMs),
          },
          entitlementSource: "active_trial",
        };
      }

      if (isPaidStoredPlan(trialPlan)) {
        return {
          effectivePlan: "free",
          storedPlan,
          trial: {
            status: "expired",
            trialPlan,
            trialEndsAt: subscription.trialEndsAt,
            daysRemaining: 0,
          },
          entitlementSource: "expired_trial",
        };
      }

      return {
        effectivePlan: "free",
        storedPlan,
        trial: {
          status: "expired",
          trialPlan: "free",
          trialEndsAt: subscription.trialEndsAt,
          daysRemaining: 0,
        },
        entitlementSource: "expired_trial",
      };
    }

    if (isPaidStoredPlan(storedPlan)) {
      return {
        effectivePlan: "free",
        storedPlan,
        trial: {
          status: "expired",
          trialPlan: storedPlan,
          trialEndsAt: null,
          daysRemaining: 0,
        },
        entitlementSource: "expired_trial",
      };
    }
  }

  if (subscription.status === "cancelled" || subscription.status === "expired") {
    return {
      effectivePlan: "free",
      storedPlan,
      trial: {
        status: "expired",
        trialPlan: resolveTrialPlan(storedPlan, subscription.plan),
        trialEndsAt: subscription.trialEndsAt,
        daysRemaining: 0,
      },
      entitlementSource: "expired_subscription",
    };
  }

  return {
    effectivePlan: storedPlan,
    storedPlan,
    trial: null,
    entitlementSource: "stored_plan",
  };
}
