import type { WorkspacePlan } from "./plans";

/** Public self-serve trial tiers selectable from marketing CTAs. */
export const PUBLIC_SIGNUP_TRIAL_PLANS = ["starter", "pro"] as const;

export type PublicSignupTrialPlan = (typeof PUBLIC_SIGNUP_TRIAL_PLANS)[number];

export const PUBLIC_TRIAL_DURATION_MS = 14 * 24 * 60 * 60 * 1000;

export function isPublicSignupTrialPlan(value: string): value is PublicSignupTrialPlan {
  return PUBLIC_SIGNUP_TRIAL_PLANS.includes(value as PublicSignupTrialPlan);
}

/**
 * Allowlist parser for ?plan= query params.
 * Rejects enterprise, business, free, internal names, and arbitrary strings.
 */
export function parsePublicSignupTrialPlan(
  raw: string | null | undefined
): PublicSignupTrialPlan | null {
  if (!raw) return null;
  const normalized = raw.trim().toLowerCase();
  return isPublicSignupTrialPlan(normalized) ? normalized : null;
}

export function resolveBootstrapWorkspacePlan(
  trialPlan: PublicSignupTrialPlan | null | undefined
): WorkspacePlan {
  if (trialPlan === "starter" || trialPlan === "pro") {
    return trialPlan;
  }
  return "free";
}
