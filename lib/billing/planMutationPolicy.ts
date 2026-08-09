import type { WorkspacePlan } from "./plans";
import { getWorkspacePlanRank } from "./plans";
import {
  resolveEffectiveWorkspacePlan,
  type EffectivePlanEntitlementSource,
  type EffectivePlanResolution,
} from "./resolveEffectiveWorkspacePlan";
import type { WorkspaceSubscriptionSnapshot } from "./workspaceSubscription";

export type PlanMutationSource = "customer_settings" | "founder_admin" | "system";

export type PlanTransitionType =
  | "no_op"
  | "upgrade"
  | "downgrade"
  | "trial_conversion"
  | "reactivation"
  | "admin_assignment";

export type SubscriptionSyncMode =
  | "activate_paid"
  | "active_trial_plan_change"
  | "admin_free"
  | "none";

export type PlanMutationPolicyErrorCode =
  | "INVALID_PLAN"
  | "DOWNGRADE_REQUIRES_SUPPORT"
  | "UNSUPPORTED_PLAN"
  | "NO_WORKSPACE_ACCESS"
  | "INSUFFICIENT_ROLE";

export function getPlanRank(plan: WorkspacePlan): number {
  return getWorkspacePlanRank(plan);
}

export function isPaidAssignablePlan(plan: WorkspacePlan): boolean {
  return plan === "starter" || plan === "pro" || plan === "business";
}

export function isTrialActive(
  resolution: EffectivePlanResolution,
  now: Date = new Date()
): boolean {
  if (resolution.trial?.status === "active") {
    return true;
  }
  if (resolution.entitlementSource !== "active_trial") {
    return false;
  }
  return resolution.trial?.trialEndsAt
    ? Date.parse(resolution.trial.trialEndsAt) > now.getTime()
    : false;
}

export function isTrialExpired(resolution: EffectivePlanResolution): boolean {
  return resolution.entitlementSource === "expired_trial";
}

export function classifyPlanTransition(
  effectivePlan: WorkspacePlan,
  targetPlan: WorkspacePlan,
  resolution: EffectivePlanResolution,
  source: PlanMutationSource,
  now: Date = new Date()
): PlanTransitionType {
  if (source === "founder_admin") {
    if (effectivePlan === targetPlan && resolution.storedPlan === targetPlan) {
      return "no_op";
    }
    return "admin_assignment";
  }

  if (
    effectivePlan === targetPlan &&
    resolution.storedPlan === targetPlan &&
    !needsSubscriptionRepair(resolution, targetPlan, now)
  ) {
    return "no_op";
  }

  if (isTrialExpired(resolution) || resolution.entitlementSource === "expired_subscription") {
    return "reactivation";
  }

  if (isTrialActive(resolution, now)) {
    if (targetPlan === effectivePlan) {
      return "trial_conversion";
    }
    if (getPlanRank(targetPlan) > getPlanRank(effectivePlan)) {
      return "upgrade";
    }
  }

  if (getPlanRank(targetPlan) > getPlanRank(effectivePlan)) {
    return "upgrade";
  }

  if (getPlanRank(targetPlan) < getPlanRank(effectivePlan)) {
    return "downgrade";
  }

  if (effectivePlan === targetPlan && resolution.storedPlan !== targetPlan) {
    return "reactivation";
  }

  return "trial_conversion";
}

/** True when stored/target say paid but subscription state still yields wrong entitlement. */
export function needsSubscriptionRepair(
  resolution: EffectivePlanResolution,
  targetPlan: WorkspacePlan,
  now: Date = new Date()
): boolean {
  if (targetPlan !== resolution.storedPlan) {
    return true;
  }
  if (resolution.effectivePlan !== targetPlan) {
    return true;
  }
  if (
    isPaidAssignablePlan(targetPlan) &&
    (resolution.entitlementSource === "expired_trial" ||
      resolution.entitlementSource === "expired_subscription")
  ) {
    return true;
  }
  if (
    isPaidAssignablePlan(targetPlan) &&
    resolution.entitlementSource === "legacy_no_subscription"
  ) {
    return true;
  }
  if (
    isPaidAssignablePlan(targetPlan) &&
    resolution.entitlementSource === "active_trial" &&
    isTrialActive(resolution, now)
  ) {
    return true;
  }
  return false;
}

export function assertCustomerPlanChangeAllowed(
  effectivePlan: WorkspacePlan,
  targetPlan: WorkspacePlan,
  transition: PlanTransitionType
): { ok: true } | { ok: false; code: PlanMutationPolicyErrorCode } {
  if (transition === "downgrade") {
    return { ok: false, code: "DOWNGRADE_REQUIRES_SUPPORT" };
  }

  if (getPlanRank(targetPlan) < getPlanRank(effectivePlan)) {
    return { ok: false, code: "DOWNGRADE_REQUIRES_SUPPORT" };
  }

  if (targetPlan === "free") {
    return { ok: false, code: "DOWNGRADE_REQUIRES_SUPPORT" };
  }

  const allowedTransitions: PlanTransitionType[] = [
    "no_op",
    "upgrade",
    "trial_conversion",
    "reactivation",
  ];

  if (!allowedTransitions.includes(transition)) {
    return { ok: false, code: "DOWNGRADE_REQUIRES_SUPPORT" };
  }

  if (!isPaidAssignablePlan(targetPlan)) {
    return { ok: false, code: "UNSUPPORTED_PLAN" };
  }

  return { ok: true };
}

export function resolveSubscriptionSyncMode(
  targetPlan: WorkspacePlan,
  transition: PlanTransitionType,
  resolution: EffectivePlanResolution,
  source: PlanMutationSource,
  now: Date = new Date()
): SubscriptionSyncMode {
  if (transition === "no_op" && !needsSubscriptionRepair(resolution, targetPlan, now)) {
    return "none";
  }

  if (source === "founder_admin" && targetPlan === "free") {
    return "admin_free";
  }

  if (
    transition === "upgrade" &&
    isTrialActive(resolution, now) &&
    isPaidAssignablePlan(targetPlan) &&
    source === "customer_settings"
  ) {
    return "activate_paid";
  }

  if (isPaidAssignablePlan(targetPlan)) {
    return "activate_paid";
  }

  if (targetPlan === "free" && source === "founder_admin") {
    return "admin_free";
  }

  return "none";
}

export function buildBillingResolution(
  storedPlan: WorkspacePlan,
  subscription: WorkspaceSubscriptionSnapshot | null,
  now: Date = new Date()
): EffectivePlanResolution {
  return resolveEffectiveWorkspacePlan(storedPlan, subscription, now);
}

export function successMessageForTransition(
  targetPlan: WorkspacePlan,
  transition: PlanTransitionType
): string {
  const planName = targetPlan.charAt(0).toUpperCase() + targetPlan.slice(1);
  if (transition === "reactivation") {
    return `You're now on ${planName}. Your new limits are active.`;
  }
  if (transition === "trial_conversion") {
    return `You're now on ${planName}. Your new limits are active.`;
  }
  if (transition === "upgrade") {
    return `You're now on ${planName}. Your new limits are active.`;
  }
  return `You're now on ${planName}. Your new limits are active.`;
}

export type { EffectivePlanEntitlementSource };
