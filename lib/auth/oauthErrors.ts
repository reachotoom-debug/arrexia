export type OAuthProvider = "google";

const PROVIDER_DISABLED_MESSAGES: Record<OAuthProvider, string> = {
  google: "Google sign-in is not enabled yet. Please use email and password for now.",
};

const GENERIC_SOCIAL_DISABLED_MESSAGE =
  "Social sign-in is not enabled yet. Please use email and password for now.";

const GENERIC_OAUTH_FAILURE_MESSAGE =
  "Sign-in failed. Please try again or use email and password.";

/** Social login is opt-in — only enabled when explicitly set to "true". */
export function isSocialAuthEnabled(): boolean {
  return process.env.NEXT_PUBLIC_ENABLE_SOCIAL_AUTH === "true";
}

export function isProviderNotEnabledError(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("provider is not enabled") ||
    normalized.includes("unsupported provider") ||
    normalized.includes("provider not enabled")
  );
}

function isPkceOrTechnicalOAuthError(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("pkce") ||
    normalized.includes("code verifier") ||
    normalized.includes("auth session missing") ||
    normalized.includes("invalid request") ||
    isProviderNotEnabledError(message) ||
    looksLikeRawOAuthJson(message)
  );
}

function looksLikeRawOAuthJson(message: string): boolean {
  const trimmed = message.trim();
  return trimmed.startsWith("{") || trimmed.includes('"error"');
}

export function getOAuthErrorMessage(
  provider: OAuthProvider,
  rawError: string | null | undefined
): string {
  if (!rawError) {
    return GENERIC_OAUTH_FAILURE_MESSAGE;
  }

  if (isPkceOrTechnicalOAuthError(rawError)) {
    return PROVIDER_DISABLED_MESSAGES[provider];
  }

  return GENERIC_OAUTH_FAILURE_MESSAGE;
}

export function getOAuthCallbackErrorMessage(
  rawError: string | null | undefined
): string | null {
  if (!rawError || !isSocialAuthEnabled()) {
    return null;
  }

  const normalized = rawError.toLowerCase();

  if (isPkceOrTechnicalOAuthError(rawError)) {
    if (normalized.includes("google")) {
      return PROVIDER_DISABLED_MESSAGES.google;
    }
    return GENERIC_SOCIAL_DISABLED_MESSAGE;
  }

  return GENERIC_OAUTH_FAILURE_MESSAGE;
}
