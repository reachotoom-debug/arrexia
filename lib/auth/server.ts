import { cache } from "react";
import { redirect } from "next/navigation";

import {
  loadAuthenticatedUserUncached,
  loadWorkspaceAccessUncached,
} from "./requestScope";
import type { AuthUserInfo, MembershipInfo, WorkspaceAccessResult, WorkspaceInfo } from "./types";

export type { AuthUserInfo, MembershipInfo, WorkspaceInfo } from "./types";

/** Request-scoped memoized auth lookup (one getUser() per server request). */
export const getAuthenticatedUser = cache(loadAuthenticatedUserUncached);

const getWorkspaceAccess = cache(
  async (workspaceId: string): Promise<WorkspaceAccessResult> => {
    const user = await getAuthenticatedUser();
    if (!user) {
      return { status: "unauthenticated" };
    }

    return loadWorkspaceAccessUncached(workspaceId, user);
  }
);

function assertWorkspacePageAccess(access: WorkspaceAccessResult): {
  user: AuthUserInfo;
  workspace: WorkspaceInfo;
  membership: MembershipInfo;
} {
  if (access.status === "unauthenticated") {
    redirect("/login");
  }

  if (access.status === "forbidden") {
    redirect("/start");
  }

  return {
    user: access.user,
    workspace: access.workspace,
    membership: access.membership,
  };
}

export async function requireUser(): Promise<{ user: AuthUserInfo }> {
  const user = await getAuthenticatedUser();
  if (!user) {
    redirect("/login");
  }

  return { user };
}

export async function requireWorkspace(workspaceId: string): Promise<{
  user: AuthUserInfo;
  workspace: WorkspaceInfo;
  membership: MembershipInfo;
}> {
  const access = await getWorkspaceAccess(workspaceId);
  return assertWorkspacePageAccess(access);
}

export type ApiAuthFailure = {
  ok: false;
  status: 401 | 403;
  error: string;
};

export type ApiAuthSuccess = {
  ok: true;
  user: AuthUserInfo;
  workspace: WorkspaceInfo;
  membership: MembershipInfo;
};

/** API-safe workspace auth: returns JSON-friendly errors instead of redirecting. */
export async function requireWorkspaceForApi(
  workspaceId: string
): Promise<ApiAuthSuccess | ApiAuthFailure> {
  const access = await getWorkspaceAccess(workspaceId);

  if (access.status === "unauthenticated") {
    return { ok: false, status: 401, error: "Unauthorized" };
  }

  if (access.status === "forbidden") {
    return { ok: false, status: 403, error: "Forbidden" };
  }

  return {
    ok: true,
    user: access.user,
    workspace: access.workspace,
    membership: access.membership,
  };
}
