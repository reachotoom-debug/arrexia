import { isWorkspacePlan, type WorkspacePlan } from "./plans";
import {
  TRIAL_CLIENT_LIMIT,
  TRIAL_INVOICE_LIMIT_TOTAL,
  TRIAL_MEMBER_LIMIT,
} from "./trialConfig";
import type { WorkspaceSubscriptionSnapshot } from "./workspaceSubscription";

export type EntitlementState =
  | "trial"
  | "trial_expired"
  | "paid"
  | "legacy_free";

export type TrialDisplayStatus = "active" | "expired";

export type TrialDisplayInfo = {
  status: TrialDisplayStatus;
  trialEndsAt: string | null;
  trialStartsAt: string | null;
  daysRemaining: number;
};

export type WorkspaceEntitlement = {
  state: EntitlementState;
  paidPlan: WorkspacePlan | null;
  storedPlan: WorkspacePlan;
  /** Legacy alias: paid plan when active; `free` during trial/expired/legacy. */
  plan: WorkspacePlan;
  trialActive: boolean;
  trialExpired: boolean;
  canMutate: boolean;
  clientLimit: number | null;
  /** Paid monthly invoice cap; null when unlimited or trial total semantics apply. */
  invoiceLimitMonthly: number | null;
  /** Total invoice allowance during active trial; null when not on trial. */
  trialInvoiceLimitTotal: number | null;
  workspaceMemberLimit: number | null;
  trial: TrialDisplayInfo | null;
  trialConsumedAt: string | null;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function computeDaysRemaining(trialEndsAt: string, nowMs: number): number {
  const trialEndMs = Date.parse(trialEndsAt);
  if (Number.isNaN(trialEndMs)) {
    return 0;
  }
  return Math.max(0, Math.ceil((trialEndMs - nowMs) / MS_PER_DAY));
}

function isPaidPlan(plan: string): plan is WorkspacePlan {
  return plan === "starter" || plan === "pro" || plan === "business";
}

/** Legacy rows stored starter/pro/business with status=trial are standalone Arrexia trials. */
export function isLegacyPlanSpecificTrialRecord(
  subscription: WorkspaceSubscriptionSnapshot
): boolean {
  return (
    subscription.status === "trial" &&
    isPaidPlan(subscription.plan)
  );
}

function isStandaloneTrialRecord(
  subscription: WorkspaceSubscriptionSnapshot,
  trialConsumedAt: string | null
): boolean {
  if (subscription.status !== "trial") {
    return false;
  }
  if (trialConsumedAt || subscription.trialConsumedAt || subscription.trialStartsAt) {
    return true;
  }
  return isLegacyPlanSpecificTrialRecord(subscription);
}

function buildTrialDisplay(
  subscription: WorkspaceSubscriptionSnapshot,
  status: TrialDisplayStatus,
  nowMs: number
): TrialDisplayInfo {
  return {
    status,
    trialStartsAt: subscription.trialStartsAt,
    trialEndsAt: subscription.trialEndsAt,
    daysRemaining:
      status === "active" && subscription.trialEndsAt
        ? computeDaysRemaining(subscription.trialEndsAt, nowMs)
        : 0,
  };
}

function paidEntitlement(
  paidPlan: WorkspacePlan,
  storedPlan: WorkspacePlan,
  subscription: WorkspaceSubscriptionSnapshot
): WorkspaceEntitlement {
  return {
    state: "paid",
    paidPlan,
    storedPlan,
    plan: paidPlan,
    trialActive: false,
    trialExpired: false,
    canMutate: true,
    clientLimit: null,
    invoiceLimitMonthly: null,
    trialInvoiceLimitTotal: null,
    workspaceMemberLimit: null,
    trial: null,
    trialConsumedAt: subscription.trialConsumedAt ?? subscription.trialStartsAt,
  };
}

function applyPaidLimits(
  entitlement: WorkspaceEntitlement,
  limits: { clientLimit: number | null; invoiceLimitMonthly: number | null; workspaceMemberLimit: number | null }
): WorkspaceEntitlement {
  return {
    ...entitlement,
    clientLimit: limits.clientLimit,
    invoiceLimitMonthly: limits.invoiceLimitMonthly,
    workspaceMemberLimit: limits.workspaceMemberLimit,
  };
}

function activeTrialEntitlement(
  storedPlan: WorkspacePlan,
  subscription: WorkspaceSubscriptionSnapshot,
  trialConsumedAt: string | null,
  nowMs: number
): WorkspaceEntitlement {
  return {
    state: "trial",
    paidPlan: null,
    storedPlan,
    plan: "free",
    trialActive: true,
    trialExpired: false,
    canMutate: true,
    clientLimit: TRIAL_CLIENT_LIMIT,
    invoiceLimitMonthly: null,
    trialInvoiceLimitTotal: TRIAL_INVOICE_LIMIT_TOTAL,
    workspaceMemberLimit: TRIAL_MEMBER_LIMIT,
    trial: buildTrialDisplay(subscription, "active", nowMs),
    trialConsumedAt,
  };
}

function expiredTrialEntitlement(
  storedPlan: WorkspacePlan,
  subscription: WorkspaceSubscriptionSnapshot,
  trialConsumedAt: string | null
): WorkspaceEntitlement {
  return {
    state: "trial_expired",
    paidPlan: null,
    storedPlan,
    plan: "free",
    trialActive: false,
    trialExpired: true,
    canMutate: false,
    clientLimit: TRIAL_CLIENT_LIMIT,
    invoiceLimitMonthly: null,
    trialInvoiceLimitTotal: TRIAL_INVOICE_LIMIT_TOTAL,
    workspaceMemberLimit: TRIAL_MEMBER_LIMIT,
    trial: buildTrialDisplay(subscription, "expired", Date.now()),
    trialConsumedAt,
  };
}

export type ResolveWorkspaceEntitlementInput = {
  storedPlan: WorkspacePlan;
  subscription: WorkspaceSubscriptionSnapshot | null;
  trialConsumedAt?: string | null;
  now?: Date;
  paidLimits?: {
    clientLimit: number | null;
    invoiceLimitMonthly: number | null;
    workspaceMemberLimit: number | null;
  };
  legacyFreeLimits?: {
    clientLimit: number | null;
    invoiceLimitMonthly: number | null;
    workspaceMemberLimit: number | null;
  };
};

export function resolveWorkspaceEntitlement(
  input: ResolveWorkspaceEntitlementInput
): WorkspaceEntitlement {
  const now = input.now ?? new Date();
  const nowMs = now.getTime();
  const storedPlan = isWorkspacePlan(input.storedPlan) ? input.storedPlan : "free";
  const subscription = input.subscription;
  const trialConsumedAt =
    input.trialConsumedAt ?? subscription?.trialConsumedAt ?? subscription?.trialStartsAt ?? null;

  if (!subscription) {
    const legacy = input.legacyFreeLimits ?? {
      clientLimit: 5,
      invoiceLimitMonthly: 5,
      workspaceMemberLimit: 1,
    };
    return {
      state: "legacy_free",
      paidPlan: null,
      storedPlan,
      plan: storedPlan,
      trialActive: false,
      trialExpired: false,
      canMutate: false,
      clientLimit: legacy.clientLimit,
      invoiceLimitMonthly: legacy.invoiceLimitMonthly,
      trialInvoiceLimitTotal: null,
      workspaceMemberLimit: legacy.workspaceMemberLimit,
      trial: null,
      trialConsumedAt: null,
    };
  }

  if (subscription.status === "active" || subscription.status === "past_due") {
    const paidPlan = isPaidPlan(subscription.plan) ? subscription.plan : storedPlan;
    const base = paidEntitlement(paidPlan, storedPlan, subscription);
    if (input.paidLimits) {
      return applyPaidLimits(base, input.paidLimits);
    }
    return base;
  }

  if (isStandaloneTrialRecord(subscription, trialConsumedAt)) {
    const trialEndMs = subscription.trialEndsAt ? Date.parse(subscription.trialEndsAt) : NaN;
    const hasValidEnd = !Number.isNaN(trialEndMs);
    if (hasValidEnd && trialEndMs > nowMs) {
      return activeTrialEntitlement(storedPlan, subscription, trialConsumedAt, nowMs);
    }
    return expiredTrialEntitlement(storedPlan, subscription, trialConsumedAt);
  }

  if (subscription.status === "cancelled" || subscription.status === "expired") {
    return expiredTrialEntitlement(storedPlan, subscription, trialConsumedAt);
  }

  const legacy = input.legacyFreeLimits ?? {
    clientLimit: 5,
    invoiceLimitMonthly: 5,
    workspaceMemberLimit: 1,
  };
  return {
    state: "legacy_free",
    paidPlan: null,
    storedPlan,
    plan: storedPlan,
    trialActive: false,
    trialExpired: false,
    canMutate: false,
    clientLimit: legacy.clientLimit,
    invoiceLimitMonthly: legacy.invoiceLimitMonthly,
    trialInvoiceLimitTotal: null,
    workspaceMemberLimit: legacy.workspaceMemberLimit,
    trial: null,
    trialConsumedAt,
  };
}
