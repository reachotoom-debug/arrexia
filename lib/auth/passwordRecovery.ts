import { buildAuthCallbackUrl, getConfiguredAppUrl } from "@/lib/config/appUrl";
import {
  AUTH_PASSWORD_RESET_SEND_FAILURE_MESSAGE,
  AUTH_PASSWORD_RESET_UPDATE_FAILURE_MESSAGE,
  logAuthErrorDev,
  mapSupabaseAuthError,
} from "@/lib/auth/authErrors";

export const PASSWORD_RESET_NEXT_PATH = "/reset-password" as const;

export const RESET_LINK_EXPIRED_TITLE = "Reset link expired";

export const RESET_LINK_EXPIRED_MESSAGE =
  "This password reset link is invalid or has expired. Please request a new password reset email.";

/** @deprecated Use AUTH_PASSWORD_RESET_SEND_FAILURE_MESSAGE from authErrors */
export const PASSWORD_RESET_SEND_FAILURE_MESSAGE = AUTH_PASSWORD_RESET_SEND_FAILURE_MESSAGE;

/** @deprecated Use AUTH_PASSWORD_RESET_UPDATE_FAILURE_MESSAGE from authErrors */
export const PASSWORD_RESET_UPDATE_FAILURE_MESSAGE = AUTH_PASSWORD_RESET_UPDATE_FAILURE_MESSAGE;

/** Supabase password recovery redirect — must go through /auth/callback for PKCE. */
export function buildPasswordResetCallbackUrl(origin?: string): string {
  const callbackUrl = buildAuthCallbackUrl({
    origin: origin ?? getConfiguredAppUrl(),
    next: PASSWORD_RESET_NEXT_PATH,
  });

  if (!callbackUrl) {
    throw new Error("Unable to build password reset callback URL");
  }

  return callbackUrl;
}

export function isPasswordRecoveryCallback(next: string | null): boolean {
  if (!next) return false;
  const pathname = next.split(/[?#]/)[0] ?? next;
  return pathname === PASSWORD_RESET_NEXT_PATH;
}

export function mapPasswordResetRequestError(message: string): string {
  return mapSupabaseAuthError(message, "forgot-password");
}

export function mapPasswordResetUpdateError(message: string): string {
  return mapSupabaseAuthError(message, "reset-password");
}

export function logPasswordRecoveryDev(context: string, error: unknown): void {
  logAuthErrorDev(`password-recovery/${context}`, error);
}
