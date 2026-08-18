import type { TrialLifecycleEventKey } from "@/lib/billing/trialLifecycleEvents";
import type { WorkspaceEntitlement } from "@/lib/billing/resolveWorkspaceEntitlement";
import { MS_PER_DAY, TRIAL_DURATION_DAYS } from "@/lib/billing/trialConfig";

/**
 * Cron may recover a missed welcome email only near trial start.
 * Immediate post-creation delivery remains canonical.
 */
export const TRIAL_STARTED_BACKFILL_MAX_DAYS = 2;

/**
 * Daily cron window semantics (UTC):
 *
 * - Remaining-day emails use the same ceil-based day count as entitlement display
 *   (`resolveWorkspaceEntitlement`), with inclusive upper bounds so a missed cron
 *   day can still deliver the next time the workspace is in the catch-up band.
 * - Post-expiry emails use whole UTC calendar days elapsed since `trial_ends_at`.
 * - `trial_expired` fires once canonical entitlement is `trial_expired`.
 */
export function computeTrialDaysRemaining(trialEndsAt: string, now: Date): number {
  const trialEndMs = Date.parse(trialEndsAt);
  if (Number.isNaN(trialEndMs)) {
    return 0;
  }
  return Math.max(0, Math.ceil((trialEndMs - now.getTime()) / MS_PER_DAY));
}

export function computeDaysSinceTrialEnd(trialEndsAt: string, now: Date): number {
  const trialEndMs = Date.parse(trialEndsAt);
  if (Number.isNaN(trialEndMs)) {
    return 0;
  }
  return Math.max(0, Math.floor((now.getTime() - trialEndMs) / MS_PER_DAY));
}

export function isTrialSevenDayRemainingEligible(
  daysRemaining: number,
  entitlementState: WorkspaceEntitlement["state"]
): boolean {
  return entitlementState === "trial" && daysRemaining <= 7 && daysRemaining > 3;
}

export function isTrialThreeDayRemainingEligible(
  daysRemaining: number,
  entitlementState: WorkspaceEntitlement["state"]
): boolean {
  return entitlementState === "trial" && daysRemaining <= 3 && daysRemaining > 1;
}

export function isTrialOneDayRemainingEligible(
  daysRemaining: number,
  entitlementState: WorkspaceEntitlement["state"]
): boolean {
  return entitlementState === "trial" && daysRemaining <= 1 && daysRemaining > 0;
}

export function isTrialExpiredEligible(entitlementState: WorkspaceEntitlement["state"]): boolean {
  return entitlementState === "trial_expired";
}

export function isTrialExpiredPlusThreeEligible(
  entitlementState: WorkspaceEntitlement["state"],
  daysSinceEnd: number
): boolean {
  return entitlementState === "trial_expired" && daysSinceEnd >= 3 && daysSinceEnd < 7;
}

export function isTrialExpiredPlusSevenEligible(
  entitlementState: WorkspaceEntitlement["state"],
  daysSinceEnd: number
): boolean {
  return entitlementState === "trial_expired" && daysSinceEnd >= 7;
}

export function isTrialStartedEligible(
  entitlementState: WorkspaceEntitlement["state"],
  trialEndsAt: string | null,
  now: Date = new Date()
): boolean {
  if (entitlementState !== "trial" || !trialEndsAt) {
    return false;
  }
  const daysRemaining = computeTrialDaysRemaining(trialEndsAt, now);
  return daysRemaining >= TRIAL_DURATION_DAYS - TRIAL_STARTED_BACKFILL_MAX_DAYS;
}

export const TRIAL_LIFECYCLE_EVENT_PRIORITY: Record<TrialLifecycleEventKey, number> = {
  trial_started: 1,
  trial_7_days_remaining: 2,
  trial_3_days_remaining: 3,
  trial_1_day_remaining: 4,
  trial_expired: 5,
  trial_expired_plus_3_days: 6,
  trial_expired_plus_7_days: 7,
};

/** One lifecycle email per workspace per cron execution. */
export function selectTrialLifecycleEventForRun(
  events: TrialLifecycleEventKey[]
): TrialLifecycleEventKey | null {
  if (events.length === 0) {
    return null;
  }

  return events.reduce((best, current) =>
    TRIAL_LIFECYCLE_EVENT_PRIORITY[current] > TRIAL_LIFECYCLE_EVENT_PRIORITY[best]
      ? current
      : best
  );
}

function getPostExpiryEvent(
  entitlementState: WorkspaceEntitlement["state"],
  daysSinceEnd: number
): TrialLifecycleEventKey | null {
  if (entitlementState !== "trial_expired") {
    return null;
  }
  if (daysSinceEnd >= 7) {
    return "trial_expired_plus_7_days";
  }
  if (daysSinceEnd >= 3) {
    return "trial_expired_plus_3_days";
  }
  return "trial_expired";
}

export function getEligibleTrialLifecycleEvents(
  entitlement: WorkspaceEntitlement,
  trialEndsAt: string | null,
  now: Date = new Date()
): TrialLifecycleEventKey[] {
  if (entitlement.state === "paid") {
    return [];
  }

  const events: TrialLifecycleEventKey[] = [];

  if (isTrialStartedEligible(entitlement.state, trialEndsAt, now)) {
    events.push("trial_started");
  }

  if (!trialEndsAt) {
    return events;
  }

  const daysRemaining = computeTrialDaysRemaining(trialEndsAt, now);
  const daysSinceEnd = computeDaysSinceTrialEnd(trialEndsAt, now);

  if (isTrialSevenDayRemainingEligible(daysRemaining, entitlement.state)) {
    events.push("trial_7_days_remaining");
  }
  if (isTrialThreeDayRemainingEligible(daysRemaining, entitlement.state)) {
    events.push("trial_3_days_remaining");
  }
  if (isTrialOneDayRemainingEligible(daysRemaining, entitlement.state)) {
    events.push("trial_1_day_remaining");
  }

  const postExpiryEvent = getPostExpiryEvent(entitlement.state, daysSinceEnd);
  if (postExpiryEvent) {
    events.push(postExpiryEvent);
  }

  return events;
}
