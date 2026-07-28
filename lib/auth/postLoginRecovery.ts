import { AUTH_WORKSPACE_SETUP_FAILED_MESSAGE } from "@/lib/auth/authErrors";
import { resolveHonoredNextPath, sanitizeNextPath } from "@/lib/auth/safeNextPath";
import type { PublicSignupTrialPlan } from "@/lib/billing/publicTrialPlan";

/** Authenticated workspace bootstrap recovery entry point. */
export const AUTH_WORKSPACE_RECOVERY_PATH = "/start" as const;

export type WorkspaceRecoveryOptions = {
  initialTrialPlan?: PublicSignupTrialPlan | null;
  nextPath?: string | null;
};

/** Builds /start recovery URL preserving allowlisted trial intent and safe next path. */
export function buildWorkspaceRecoveryPath(
  options?: WorkspaceRecoveryOptions
): string {
  const params = new URLSearchParams();

  if (options?.initialTrialPlan) {
    params.set("plan", options.initialTrialPlan);
  }

  const nextPath = sanitizeNextPath(options?.nextPath);
  if (nextPath) {
    params.set("next", nextPath);
  }

  const query = params.toString();
  return query ? `${AUTH_WORKSPACE_RECOVERY_PATH}?${query}` : AUTH_WORKSPACE_RECOVERY_PATH;
}

export function isWorkspaceSetupFailureMessage(message: string | null | undefined): boolean {
  if (!message) return false;
  const normalized = message.trim().toLowerCase();
  return (
    normalized === AUTH_WORKSPACE_SETUP_FAILED_MESSAGE.toLowerCase() ||
    normalized.includes("workspace setup failed")
  );
}

export function buildPostLoginDestinationPath(
  workspaceId: string,
  nextUrl: string | null | undefined,
  memberWorkspaceIds: Iterable<string>
): string {
  const honoredNext = resolveHonoredNextPath(nextUrl, memberWorkspaceIds);
  return honoredNext ?? `/${workspaceId}/dashboard`;
}

export function resolveAuthenticatedBootstrapFailureRedirect(
  errorMessage: string,
  recoveryOptions?: WorkspaceRecoveryOptions
): string | null {
  if (!isWorkspaceSetupFailureMessage(errorMessage)) {
    return null;
  }

  return buildWorkspaceRecoveryPath(recoveryOptions);
}

export function resolveAuthCallbackFailureRedirect(options: {
  origin: string;
  returnTo: "/login" | "/register";
  errorMessage: string;
  sessionEstablished: boolean;
  initialTrialPlan?: PublicSignupTrialPlan | null;
  nextPath?: string | null;
}): string {
  if (options.sessionEstablished) {
    const recoveryPath = resolveAuthenticatedBootstrapFailureRedirect(options.errorMessage, {
      initialTrialPlan: options.initialTrialPlan,
      nextPath: options.nextPath,
    });
    if (recoveryPath) {
      return `${options.origin}${recoveryPath}`;
    }
  }

  return `${options.origin}${options.returnTo}?error=${encodeURIComponent(options.errorMessage)}`;
}
