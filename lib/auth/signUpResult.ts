import type { AuthError, Session, User } from "@supabase/supabase-js";
import { buildAuthCallbackUrl } from "@/lib/config/appUrl";

export type SignUpResultData = {
  user: User | null;
  session: Session | null;
};

export type SignUpOutcome =
  | { kind: "confirmation_sent"; email: string }
  | { kind: "already_registered" }
  | { kind: "ready_to_sign_in"; email: string }
  | { kind: "error"; message: string };

export const SIGNUP_CONFIRMATION_HEADING = "Check your email to confirm your account.";

export const SIGNUP_CONFIRMATION_BODY =
  "We sent a confirmation link to your email. Please check your inbox and confirm your account before signing in.";

export const SIGNUP_ALREADY_REGISTERED_MESSAGE =
  "If this email is already registered, please sign in or reset your password.";

export const SIGNUP_READY_TO_SIGN_IN_MESSAGE =
  "Your account is ready. You can sign in now with your email and password.";

export function getEmailRedirectTo(origin?: string): string | undefined {
  return buildAuthCallbackUrl({ origin });
}

export function getSupabaseProjectHost(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return "missing";
  try {
    return new URL(url).host;
  } catch {
    return "invalid-url";
  }
}

export function isLocalSupabaseHost(host: string): boolean {
  return host === "127.0.0.1" || host === "localhost" || host.startsWith("127.0.0.1:");
}

export function analyzeSignUpResponse(
  data: SignUpResultData | null,
  error: AuthError | null
): SignUpOutcome {
  if (error) {
    return { kind: "error", message: error.message || "Failed to create account" };
  }

  const user = data?.user;
  if (!user) {
    return { kind: "error", message: "Unexpected sign-up response. Please try again." };
  }

  const identitiesCount = user.identities?.length ?? 0;

  // Supabase anti-enumeration: existing email returns user with empty identities, no email sent.
  if (identitiesCount === 0) {
    return { kind: "already_registered" };
  }

  // Session without pending confirmation means confirmations are disabled server-side.
  if (data?.session && user.email_confirmed_at) {
    return { kind: "ready_to_sign_in", email: user.email ?? "" };
  }

  if (data?.session && !user.email_confirmed_at) {
    return { kind: "ready_to_sign_in", email: user.email ?? "" };
  }

  return { kind: "confirmation_sent", email: user.email ?? "" };
}

export function logSignUpResultDev(
  data: SignUpResultData | null,
  error: AuthError | null
): void {
  if (process.env.NODE_ENV !== "development") return;

  const user = data?.user;

  console.info("[auth/signUp]", {
    supabaseHost: getSupabaseProjectHost(),
    isLocalSupabase: isLocalSupabaseHost(getSupabaseProjectHost()),
    errorMessage: error?.message ?? null,
    userIdExists: user?.id ? "yes" : "no",
    identitiesLength: user?.identities?.length ?? 0,
    sessionExists: data?.session ? "yes" : "no",
    emailConfirmed: user?.email_confirmed_at ? "yes" : "no",
    confirmationSentAt: user?.confirmation_sent_at ?? null,
  });
}
