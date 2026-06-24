import { resolveHonoredNextPath } from "@/lib/auth/safeNextPath";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { ensureWorkspaceForUser } from "@/lib/workspaces/ensureWorkspaceForUser";

export const WORKSPACE_SETUP_FAILED_MESSAGE =
  "Your account is confirmed, but workspace setup failed. Please try again.";

export type PostLoginDestinationResult = {
  path: string;
  workspaceFound: boolean;
  workspaceCreated: boolean;
};

export type PostLoginDestinationError = {
  error: string;
};

export async function resolvePostLoginDestination(
  userId: string,
  nextUrl?: string | null
): Promise<PostLoginDestinationResult | PostLoginDestinationError> {
  const admin = supabaseAdmin();

  const { data: existingMemberships, error: membershipLookupError } = await admin
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  if (membershipLookupError) {
    logPostLoginDev({
      userId,
      workspaceFound: false,
      workspaceCreated: false,
      finalPath: null,
      error: membershipLookupError.message,
    });
    return { error: WORKSPACE_SETUP_FAILED_MESSAGE };
  }

  const workspaceFound = Boolean(existingMemberships?.[0]?.workspace_id);

  try {
    const workspaceId = await ensureWorkspaceForUser(userId);
    const workspaceCreated = !workspaceFound;
    const memberWorkspaceIds = new Set(
      (existingMemberships ?? []).map((membership) => membership.workspace_id)
    );
    memberWorkspaceIds.add(workspaceId);

    const defaultPath = `/${workspaceId}/dashboard`;
    const honoredNext = resolveHonoredNextPath(nextUrl, memberWorkspaceIds);
    const path = honoredNext ?? defaultPath;

    logPostLoginDev({
      userId,
      workspaceFound,
      workspaceCreated,
      finalPath: path,
      usedExplicitNext: honoredNext ? "yes" : "no",
    });

    return {
      path,
      workspaceFound,
      workspaceCreated,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown workspace setup error";
    logPostLoginDev({
      userId,
      workspaceFound,
      workspaceCreated: false,
      finalPath: null,
      error: message,
    });
    return { error: WORKSPACE_SETUP_FAILED_MESSAGE };
  }
}

function logPostLoginDev(details: {
  userId: string;
  workspaceFound: boolean;
  workspaceCreated: boolean;
  finalPath: string | null;
  usedExplicitNext?: string;
  error?: string;
}): void {
  if (process.env.NODE_ENV !== "development") return;

  console.info("[auth/post-login]", {
    userId: details.userId,
    workspaceFound: details.workspaceFound ? "yes" : "no",
    workspaceCreated: details.workspaceCreated ? "yes" : "no",
    finalRedirectPath: details.finalPath,
    usedExplicitNext: details.usedExplicitNext ?? "no",
    error: details.error ?? null,
  });
}
