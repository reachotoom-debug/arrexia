import type { User } from "@supabase/supabase-js";
import type { AccountActivationMethod } from "./accountActivation";

const OAUTH_PROVIDERS = new Set(["google", "apple", "github", "azure", "facebook", "twitter"]);

export type CallbackActivationInput = {
  /** True when callback is classified as password recovery (never activates). */
  isRecovery: boolean;
  /** Supabase `type` query parameter when present. */
  typeParam: string | null;
  user: Pick<User, "identities">;
};

function listIdentityProviders(user: Pick<User, "identities">): string[] {
  return (user.identities ?? [])
    .map((identity) => identity.provider?.trim().toLowerCase())
    .filter((provider): provider is string => Boolean(provider));
}

function hasOAuthIdentity(providers: string[]): boolean {
  return providers.some((provider) => provider !== "email" && OAUTH_PROVIDERS.has(provider));
}

/**
 * Determines whether a successful non-recovery /auth/callback should record Arrexia activation.
 *
 * Email/password signup confirmation is authoritative via /auth/confirm (verifyOtp + type=email).
 * This helper only classifies OAuth callbacks.
 */
export function resolveCallbackActivationMethod(
  input: CallbackActivationInput
): AccountActivationMethod | null {
  if (input.isRecovery) {
    return null;
  }

  const providers = listIdentityProviders(input.user);

  if (hasOAuthIdentity(providers)) {
    return "oauth";
  }

  return null;
}
