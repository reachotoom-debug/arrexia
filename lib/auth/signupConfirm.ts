import type { EmailOtpType } from "@supabase/supabase-js";
import { parsePublicSignupTrialPlan, type PublicSignupTrialPlan } from "@/lib/billing/publicTrialPlan";
import { sanitizeNextPath } from "@/lib/auth/safeNextPath";

/** Supabase verifyOtp type for signup email confirmation (SSR TokenHash flow). */
export const SIGNUP_CONFIRM_EMAIL_OTP_TYPE = "email" as const satisfies EmailOtpType;

const REJECTED_CONFIRM_TYPES = new Set([
  "recovery",
  "magiclink",
  "invite",
  "email_change",
  "phone_change",
  "signup",
]);

export type SignupConfirmRequest = {
  tokenHash: string;
  otpType: typeof SIGNUP_CONFIRM_EMAIL_OTP_TYPE;
  nextPath: string | null;
  initialTrialPlan: PublicSignupTrialPlan | null;
};

export type SignupConfirmRequestParseResult =
  | { ok: true; request: SignupConfirmRequest }
  | { ok: false; reason: "missing_token" | "invalid_type" };

export function isSignupConfirmEmailOtpType(
  type: string | null | undefined
): type is typeof SIGNUP_CONFIRM_EMAIL_OTP_TYPE {
  return type?.trim().toLowerCase() === SIGNUP_CONFIRM_EMAIL_OTP_TYPE;
}

export function parseSignupConfirmSearchParams(
  searchParams: URLSearchParams
): SignupConfirmRequestParseResult {
  const tokenHash = searchParams.get("token_hash")?.trim() ?? "";
  const typeParam = searchParams.get("type");

  if (!tokenHash) {
    return { ok: false, reason: "missing_token" };
  }

  if (!isSignupConfirmEmailOtpType(typeParam)) {
    return { ok: false, reason: "invalid_type" };
  }

  const { nextPath, initialTrialPlan } = parseSignupConfirmNextParams(searchParams);

  return {
    ok: true,
    request: {
      tokenHash,
      otpType: SIGNUP_CONFIRM_EMAIL_OTP_TYPE,
      nextPath,
      initialTrialPlan,
    },
  };
}

/**
 * Parses post-confirmation destination from Supabase `.RedirectTo` passed as `next`.
 *
 * Supabase signup templates often emit `next=<RedirectTo>&plan=<plan>` as sibling query
 * params when RedirectTo contains `?plan=`. We reconstruct that safely here.
 */
export function parseSignupConfirmNextParams(searchParams: URLSearchParams): {
  nextPath: string | null;
  initialTrialPlan: PublicSignupTrialPlan | null;
} {
  const nextRaw = searchParams.get("next")?.trim() ?? "";
  const siblingPlan = parsePublicSignupTrialPlan(searchParams.get("plan"));

  if (!nextRaw) {
    return { nextPath: null, initialTrialPlan: siblingPlan };
  }

  let destination = nextRaw;

  if (siblingPlan && !destination.includes("plan=")) {
    destination += destination.includes("?") ? "&" : "?";
    destination += `plan=${siblingPlan}`;
  }

  try {
    const url = new URL(destination);
    const initialTrialPlan =
      parsePublicSignupTrialPlan(url.searchParams.get("plan")) ?? siblingPlan;
    const pathWithQuery = `${url.pathname}${url.search}`;
    return {
      nextPath: sanitizeNextPath(pathWithQuery),
      initialTrialPlan,
    };
  } catch {
    const nextPath = sanitizeNextPath(destination);
    const queryIndex = destination.indexOf("?");
    const query = queryIndex >= 0 ? destination.slice(queryIndex + 1) : "";
    const initialTrialPlan =
      parsePublicSignupTrialPlan(new URLSearchParams(query).get("plan")) ?? siblingPlan;

    return { nextPath, initialTrialPlan };
  }
}

export function isRejectedSignupConfirmType(type: string | null | undefined): boolean {
  if (!type) return false;
  return REJECTED_CONFIRM_TYPES.has(type.trim().toLowerCase());
}
