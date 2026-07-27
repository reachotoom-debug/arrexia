import type { EmailOtpType } from "@supabase/supabase-js";

/** Supabase verifyOtp type for password recovery (SSR TokenHash flow). */
export const RECOVERY_CONFIRM_OTP_TYPE = "recovery" as const satisfies EmailOtpType;

export type RecoveryConfirmRequest = {
  tokenHash: string;
  otpType: typeof RECOVERY_CONFIRM_OTP_TYPE;
};

export type RecoveryConfirmRequestParseResult =
  | { ok: true; request: RecoveryConfirmRequest }
  | { ok: false; reason: "missing_token" | "invalid_type" };

export function isRecoveryConfirmOtpType(
  type: string | null | undefined
): type is typeof RECOVERY_CONFIRM_OTP_TYPE {
  return type?.trim().toLowerCase() === RECOVERY_CONFIRM_OTP_TYPE;
}

export function parseRecoveryConfirmSearchParams(
  searchParams: URLSearchParams
): RecoveryConfirmRequestParseResult {
  const tokenHash = searchParams.get("token_hash")?.trim() ?? "";
  const typeParam = searchParams.get("type");

  if (!tokenHash) {
    return { ok: false, reason: "missing_token" };
  }

  if (!isRecoveryConfirmOtpType(typeParam)) {
    return { ok: false, reason: "invalid_type" };
  }

  return {
    ok: true,
    request: {
      tokenHash,
      otpType: RECOVERY_CONFIRM_OTP_TYPE,
    },
  };
}
