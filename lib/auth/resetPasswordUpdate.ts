import type { AuthError } from "@supabase/supabase-js";
import {
  AUTH_PASSWORD_RESET_REAUTHENTICATION_MESSAGE,
  AUTH_PASSWORD_RESET_SAME_PASSWORD_MESSAGE,
  AUTH_PASSWORD_RESET_UPDATE_FAILURE_MESSAGE,
  AUTH_PASSWORD_RESET_WEAK_PASSWORD_MESSAGE,
} from "@/lib/auth/authErrors";

export type ResetPasswordUpdateStage =
  | "validate_body"
  | "resolve_session"
  | "activation_gate"
  | "update_password";

/** Maps Supabase updateUser errors during recovery to safe user-facing copy. */
export function mapRecoveryPasswordUpdateError(error: Pick<AuthError, "code" | "message">): string {
  const code = error.code?.trim().toLowerCase() ?? "";
  const message = error.message?.trim().toLowerCase() ?? "";

  if (code === "same_password" || message.includes("same password")) {
    return AUTH_PASSWORD_RESET_SAME_PASSWORD_MESSAGE;
  }

  if (code === "weak_password" || message.includes("weak password")) {
    return AUTH_PASSWORD_RESET_WEAK_PASSWORD_MESSAGE;
  }

  if (
    code === "reauthentication_needed" ||
    code === "reauth_required" ||
    message.includes("reauthenticate") ||
    message.includes("recent login")
  ) {
    return AUTH_PASSWORD_RESET_REAUTHENTICATION_MESSAGE;
  }

  if (
    code === "validation_failed" ||
    (message.includes("password") &&
      (message.includes("least") ||
        message.includes("character") ||
        message.includes("requirement") ||
        message.includes("policy")))
  ) {
    return AUTH_PASSWORD_RESET_WEAK_PASSWORD_MESSAGE;
  }

  return AUTH_PASSWORD_RESET_UPDATE_FAILURE_MESSAGE;
}

/** Safe diagnostic log — never includes secrets (password, tokens, cookies). */
export function logResetPasswordStageSafe(input: {
  stage: ResetPasswordUpdateStage;
  hasUser?: boolean;
  activationPassed?: boolean;
  errorCode?: string | null;
  errorStatus?: number | null;
  errorMessage?: string | null;
}): void {
  console.error("[api/auth/reset-password]", {
    stage: input.stage,
    hasUser: input.hasUser ?? null,
    activationPassed: input.activationPassed ?? null,
    errorCode: input.errorCode ?? null,
    errorStatus: input.errorStatus ?? null,
    errorMessage: input.errorMessage ?? null,
  });
}

/** @deprecated Use logResetPasswordStageSafe */
export function logResetPasswordStageDev(
  input: Parameters<typeof logResetPasswordStageSafe>[0]
): void {
  logResetPasswordStageSafe(input);
}
