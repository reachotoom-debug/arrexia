export const AUTH_EMAIL_RATE_LIMIT_MESSAGE =
  "Too many authentication emails have been requested. Please wait a few minutes before trying again.";

export const AUTH_INVALID_CREDENTIALS_MESSAGE = "Incorrect email or password.";

export const AUTH_USER_ALREADY_REGISTERED_MESSAGE =
  "An account with this email already exists.";

export const AUTH_GENERIC_FAILURE_MESSAGE =
  "Something went wrong. Please try again in a few minutes.";

export const AUTH_REGISTER_FAILURE_MESSAGE =
  "We couldn't create your account right now. Please try again in a few minutes.";

export const AUTH_WORKSPACE_SETUP_FAILED_MESSAGE =
  "Your account is confirmed, but workspace setup failed. Please try again.";

export const AUTH_CONFIRMATION_LINK_INVALID_MESSAGE =
  "This confirmation link is invalid or has expired. Please sign in or register again.";

export const AUTH_SESSION_COULD_NOT_BE_ESTABLISHED_MESSAGE =
  "Your session could not be established. Please sign in again.";

export const AUTH_EMAIL_NOT_CONFIRMED_MESSAGE =
  "Please confirm your email before signing in. Check your inbox for the confirmation link.";

export const AUTH_PASSWORD_RESET_SEND_FAILURE_MESSAGE =
  "We couldn't send a reset email right now. Please try again in a few minutes.";

export const AUTH_PASSWORD_RESET_UPDATE_FAILURE_MESSAGE =
  "We couldn't update your password. Please request a new reset link and try again.";

export type AuthErrorContext =
  | "login"
  | "register"
  | "forgot-password"
  | "reset-password"
  | "resend-confirmation";

function normalizeAuthErrorMessage(message: string): string {
  return message.trim().toLowerCase();
}

export function mapSupabaseAuthError(
  message: string,
  context: AuthErrorContext = "login",
): string {
  const normalized = normalizeAuthErrorMessage(message);

  if (normalized.includes("rate limit") || normalized.includes("email rate limit")) {
    return AUTH_EMAIL_RATE_LIMIT_MESSAGE;
  }

  if (
    normalized.includes("email not confirmed") ||
    normalized.includes("email address not confirmed")
  ) {
    return AUTH_EMAIL_NOT_CONFIRMED_MESSAGE;
  }

  if (
    normalized.includes("invalid login credentials") ||
    normalized.includes("invalid credentials")
  ) {
    return AUTH_INVALID_CREDENTIALS_MESSAGE;
  }

  if (
    normalized.includes("user already registered") ||
    normalized.includes("already registered")
  ) {
    return AUTH_USER_ALREADY_REGISTERED_MESSAGE;
  }

  if (normalized.includes("valid email") || normalized.includes("invalid email")) {
    return "Please enter a valid email address.";
  }

  if (
    normalized.includes("session") ||
    normalized.includes("expired") ||
    normalized.includes("pkce") ||
    normalized.includes("code verifier")
  ) {
    return AUTH_PASSWORD_RESET_UPDATE_FAILURE_MESSAGE;
  }

  if (normalized.includes("password") && normalized.includes("least")) {
    return "Password must be at least 6 characters.";
  }

  switch (context) {
    case "login":
      return AUTH_INVALID_CREDENTIALS_MESSAGE;
    case "register":
    case "resend-confirmation":
      return AUTH_REGISTER_FAILURE_MESSAGE;
    case "forgot-password":
      return AUTH_PASSWORD_RESET_SEND_FAILURE_MESSAGE;
    case "reset-password":
      return AUTH_PASSWORD_RESET_UPDATE_FAILURE_MESSAGE;
    default:
      return AUTH_GENERIC_FAILURE_MESSAGE;
  }
}

export function mapAuthCallbackExchangeError(message: string): string {
  const normalized = normalizeAuthErrorMessage(message);

  if (
    normalized.includes("expired") ||
    normalized.includes("invalid") ||
    normalized.includes("pkce") ||
    normalized.includes("code verifier") ||
    normalized.includes("auth code") ||
    normalized.includes("flow state")
  ) {
    return AUTH_CONFIRMATION_LINK_INVALID_MESSAGE;
  }

  return AUTH_SESSION_COULD_NOT_BE_ESTABLISHED_MESSAGE;
}

export function logAuthErrorDev(context: string, error: unknown): void {
  if (process.env.NODE_ENV !== "development") return;

  const message = error instanceof Error ? error.message : String(error);
  console.error(`[auth/${context}]`, message);
}
