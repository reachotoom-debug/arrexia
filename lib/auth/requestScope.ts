import { supabaseServer } from "@/lib/supabase/server";
import { isPerfEnabled, perfLog, perfTime } from "@/lib/perf/server";

import type { AuthUserInfo, WorkspaceAccessResult } from "./types";

type SupabaseClient = Awaited<ReturnType<typeof supabaseServer>>;

export type AuthLoaderDeps = {
  getSupabase: () => Promise<SupabaseClient>;
};

const defaultAuthLoaderDeps: AuthLoaderDeps = {
  getSupabase: supabaseServer,
};

/**
 * Loads the authenticated user from Supabase session cookies.
 * Uncached — wrap with React cache() at the server entry boundary.
 */
export async function loadAuthenticatedUserUncached(
  deps: AuthLoaderDeps = defaultAuthLoaderDeps
): Promise<AuthUserInfo | null> {
  if (isPerfEnabled()) {
    perfLog("requireWorkspace", "uncachedAuthLoaderCall=1");
  }

  const supabase = await deps.getSupabase();
  let user: { id: string; email?: string | null } | null = null;
  let authError: unknown = null;

  try {
    const result = await perfTime(
      "requireWorkspace",
      "authGetUser",
      async () => supabase.auth.getUser(),
      (authResult) =>
        `authenticated=${authResult.data.user && !authResult.error ? 1 : 0}`
    );
    user = result.data.user;
    authError = result.error;
  } catch (err) {
    authError = err;
  }

  if (!user || authError) {
    return null;
  }

  return {
    id: user.id,
    email: user.email ?? null,
  };
}

/**
 * Validates workspace membership and loads workspace metadata for an already-authenticated user.
 * Uncached — compose with cached auth + cached workspaceId key at the server entry boundary.
 */
export async function loadWorkspaceAccessUncached(
  workspaceId: string,
  user: AuthUserInfo,
  deps: AuthLoaderDeps = defaultAuthLoaderDeps
): Promise<Exclude<WorkspaceAccessResult, { status: "unauthenticated" }>> {
  if (isPerfEnabled()) {
    perfLog("requireWorkspace", "uncachedWorkspaceAccessCall=1");
  }

  const supabase = await deps.getSupabase();

  const { data: membership } = await perfTime(
    "requireWorkspace",
    "membershipLookup",
    async () =>
      supabase
        .from("workspace_members")
        .select("workspace_id, role")
        .eq("workspace_id", workspaceId)
        .eq("user_id", user.id)
        .maybeSingle(),
    (result) => `found=${result.data ? 1 : 0}`
  );

  if (!membership) {
    return { status: "forbidden" };
  }

  const { data: workspace, error: wsError } = await perfTime(
    "requireWorkspace",
    "workspaceLookup",
    async () =>
      supabase
        .from("workspaces")
        .select("id, name, organization_id")
        .eq("id", workspaceId)
        .single(),
    (result) => `found=${result.data ? 1 : 0}`
  );

  if (!workspace || wsError || !workspace.organization_id) {
    return { status: "forbidden" };
  }

  return {
    status: "ok",
    user,
    workspace: {
      id: workspace.id,
      name: workspace.name,
      organization_id: workspace.organization_id,
    },
    membership: {
      workspace_id: membership.workspace_id,
      role: membership.role,
    },
  };
}

export async function loadWorkspaceAccessUncachedForSession(
  workspaceId: string,
  deps: AuthLoaderDeps = defaultAuthLoaderDeps
): Promise<WorkspaceAccessResult> {
  const user = await loadAuthenticatedUserUncached(deps);
  if (!user) {
    return { status: "unauthenticated" };
  }

  return loadWorkspaceAccessUncached(workspaceId, user, deps);
}
