import type { WorkspacePlan } from "./plans";

/** Marketing attribution only — must NOT affect entitlement. */
export type SignupMarketingPlanIntent = "starter" | "pro" | "business";

const MARKETING_INTENTS = new Set<string>(["starter", "pro", "business"]);

export function parseSignupMarketingPlanIntent(
  raw: string | null | undefined
): SignupMarketingPlanIntent | null {
  if (!raw) return null;
  const normalized = raw.trim().toLowerCase();
  return MARKETING_INTENTS.has(normalized)
    ? (normalized as SignupMarketingPlanIntent)
    : null;
}

/** All public signups bootstrap the same standalone Arrexia trial stored plan shell. */
export function resolveBootstrapWorkspacePlan(
  _marketingIntent?: SignupMarketingPlanIntent | null
): WorkspacePlan {
  void _marketingIntent;
  return "free";
}

/** @deprecated Marketing-only parser. Does not grant plan-specific trial entitlement. */
export function parsePublicSignupTrialPlan(
  raw: string | null | undefined
): SignupMarketingPlanIntent | null {
  return parseSignupMarketingPlanIntent(raw);
}

/** @deprecated Use SignupMarketingPlanIntent */
export type PublicSignupTrialPlan = SignupMarketingPlanIntent;

/** @deprecated Trial duration lives in trialConfig.ts */
export { TRIAL_DURATION_DAYS, computeTrialDurationMs } from "./trialConfig";

export function isPublicSignupTrialPlan(value: string): value is SignupMarketingPlanIntent {
  return MARKETING_INTENTS.has(value);
}

export const PUBLIC_SIGNUP_TRIAL_PLANS = ["starter", "pro"] as const;
