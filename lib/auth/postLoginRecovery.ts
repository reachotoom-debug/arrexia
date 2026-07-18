import { AUTH_WORKSPACE_SETUP_FAILED_MESSAGE } from "@/lib/auth/authErrors";
import { resolveHonoredNextPath } from "@/lib/auth/safeNextPath";

/** Authenticated workspace bootstrap recovery entry point. */
export const AUTH_WORKSPACE_RECOVERY_PATH = "/start" as const;

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
  errorMessage: string
): typeof AUTH_WORKSPACE_RECOVERY_PATH | null {
  return isWorkspaceSetupFailureMessage(errorMessage) ? AUTH_WORKSPACE_RECOVERY_PATH : null;
}

export function resolveAuthCallbackFailureRedirect(options: {
  origin: string;
  returnTo: "/login" | "/register";
  errorMessage: string;
  sessionEstablished: boolean;
}): string {
  if (options.sessionEstablished) {
    const recoveryPath = resolveAuthenticatedBootstrapFailureRedirect(options.errorMessage);
    if (recoveryPath) {
      return `${options.origin}${recoveryPath}`;
    }
  }

  return `${options.origin}${options.returnTo}?error=${encodeURIComponent(options.errorMessage)}`;
}
