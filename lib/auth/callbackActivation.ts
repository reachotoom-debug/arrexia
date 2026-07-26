import type { User } from "@supabase/supabase-js";
import type { AccountActivationMethod } from "./accountActivation";

const OAUTH_PROVIDERS = new Set(["google", "apple", "github", "azure", "facebook", "twitter"]);

const NON_SIGNUP_TYPE_PARAMS = new Set([
  "recovery",
  "magiclink",
  "invite",
  "email_change",
  "phone_change",
]);

const EMAIL_SIGNUP_TYPE_PARAMS = new Set(["signup", "email", "email_confirmation"]);

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

function hasEmailIdentity(providers: string[]): boolean {
  return providers.includes("email");
}

/**
 * Determines whether a successful non-recovery auth callback should record Arrexia activation.
 *
 * Limitation: Supabase does not expose a signed "purpose" beyond `type` and identities.
 * We require provider/session evidence — never `next` or `plan` alone.
 *
 * - OAuth: non-email identity from a known OAuth provider.
 * - Email signup: explicit Supabase signup-confirmation `type` with email identity.
 */
export function resolveCallbackActivationMethod(
  input: CallbackActivationInput
): AccountActivationMethod | null {
  if (input.isRecovery) {
    return null;
  }

  const typeParam = input.typeParam?.trim().toLowerCase() ?? null;

  if (typeParam && NON_SIGNUP_TYPE_PARAMS.has(typeParam)) {
    return null;
  }

  const providers = listIdentityProviders(input.user);

  if (hasOAuthIdentity(providers)) {
    return "oauth";
  }

  if (typeParam && EMAIL_SIGNUP_TYPE_PARAMS.has(typeParam) && hasEmailIdentity(providers)) {
    return "email_signup";
  }

  return null;
}
