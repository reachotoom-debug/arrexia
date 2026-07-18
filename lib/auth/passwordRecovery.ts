import { normalizeAuthRedirectOrigin } from "@/lib/config/appUrl";
import {
  AUTH_PASSWORD_RESET_SEND_FAILURE_MESSAGE,
  AUTH_PASSWORD_RESET_UPDATE_FAILURE_MESSAGE,
  logAuthErrorDev,
  mapSupabaseAuthError,
} from "@/lib/auth/authErrors";
import { sanitizeNextPath } from "@/lib/auth/safeNextPath";

export const PASSWORD_RESET_NEXT_PATH = "/reset-password" as const;

export const PASSWORD_RESET_EXPIRED_QUERY = "state=expired" as const;

export const PASSWORD_RESET_CALLBACK_QUERY = `next=${PASSWORD_RESET_NEXT_PATH}` as const;

export const RESET_LINK_EXPIRED_TITLE = "Reset link expired";

export const RESET_LINK_EXPIRED_MESSAGE =
  "This password reset link is invalid or has expired. Please request a new password reset email.";

export const PASSWORD_RESET_SUCCESS_TITLE = "Password updated";

export const PASSWORD_RESET_SUCCESS_MESSAGE =
  "You can now sign in with your new password.";

export const RECOVERY_SESSION_MAX_ATTEMPTS = 4;

export const RECOVERY_SESSION_RETRY_MS = 150;

/** @deprecated Use AUTH_PASSWORD_RESET_SEND_FAILURE_MESSAGE from authErrors */
export const PASSWORD_RESET_SEND_FAILURE_MESSAGE = AUTH_PASSWORD_RESET_SEND_FAILURE_MESSAGE;

/** @deprecated Use AUTH_PASSWORD_RESET_UPDATE_FAILURE_MESSAGE from authErrors */
export const PASSWORD_RESET_UPDATE_FAILURE_MESSAGE = AUTH_PASSWORD_RESET_UPDATE_FAILURE_MESSAGE;

export type PasswordRecoveryCallbackDecision =
  | { action: "recovery_expired" }
  | { action: "recovery_success" }
  | { action: "continue_auth"; next: string | null };

/**
 * Supabase password recovery redirect — must go through /auth/callback for PKCE.
 * Built as a literal query string so `next=/reset-password` matches Supabase redirect allowlists
 * (URLSearchParams encodes the slash as %2F, which Supabase may reject and fall back to site_url).
 */
export function buildPasswordResetCallbackUrl(origin?: string): string {
  const base = normalizeAuthRedirectOrigin(origin);
  return `${base}/auth/callback?${PASSWORD_RESET_CALLBACK_QUERY}`;
}

export function buildPasswordResetExpiredUrl(origin?: string): string {
  const base = normalizeAuthRedirectOrigin(origin);
  return `${base}${PASSWORD_RESET_NEXT_PATH}?${PASSWORD_RESET_EXPIRED_QUERY}`;
}

export function isPasswordRecoveryCallback(next: string | null): boolean {
  if (!next) return false;
  const pathname = next.split(/[?#]/)[0] ?? next;
  return pathname === PASSWORD_RESET_NEXT_PATH;
}

export function isPasswordRecoveryRequest(
  next: string | null | undefined,
  typeParam?: string | null
): boolean {
  if (typeParam === "recovery") {
    return true;
  }

  return isPasswordRecoveryCallback(next ?? null);
}

export function sanitizeRecoveryNextPath(next: string | null | undefined): string | null {
  return sanitizeNextPath(next);
}

export function resolvePasswordRecoveryCallbackDecision(input: {
  next: string | null;
  typeParam: string | null;
  code: string | null;
  oauthError: string | null;
  exchangeSucceeded: boolean;
  hasUser: boolean;
}): PasswordRecoveryCallbackDecision {
  const isRecovery = isPasswordRecoveryRequest(input.next, input.typeParam);

  if (input.oauthError || !input.code || !input.exchangeSucceeded || !input.hasUser) {
    return isRecovery ? { action: "recovery_expired" } : { action: "continue_auth", next: input.next };
  }

  if (isRecovery) {
    return { action: "recovery_success" };
  }

  return { action: "continue_auth", next: input.next };
}

export function shouldSkipWorkspaceBootstrapForRecovery(
  decision: PasswordRecoveryCallbackDecision
): boolean {
  return decision.action === "recovery_success" || decision.action === "recovery_expired";
}

export async function verifyRecoverySessionWithRetry(
  getUser: () => Promise<{ data: { user: { id: string } | null } }>
): Promise<boolean> {
  for (let attempt = 1; attempt <= RECOVERY_SESSION_MAX_ATTEMPTS; attempt++) {
    const { data } = await getUser();
    if (data.user) {
      return true;
    }

    if (attempt < RECOVERY_SESSION_MAX_ATTEMPTS) {
      await delay(RECOVERY_SESSION_RETRY_MS * attempt);
    }
  }

  return false;
}

export function shouldAllowPasswordResetSubmit(options: {
  submitLocked: boolean;
  isSubmitting: boolean;
  sessionExpired: boolean;
  completed: boolean;
}): boolean {
  return (
    !options.submitLocked &&
    !options.isSubmitting &&
    !options.sessionExpired &&
    !options.completed
  );
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
