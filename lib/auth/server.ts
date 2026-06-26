import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";

export type AuthUserInfo = {
  id: string;
  email: string | null;
};

export type WorkspaceInfo = {
  id: string;
  name: string;
  organization_id: string;
};

export type MembershipInfo = {
  workspace_id: string;
  role: string | null;
};

export async function requireUser(): Promise<{ user: AuthUserInfo }> {
  const supabase = await supabaseServer();
  let user = null as any;
  let error: unknown = null;
  try {
    const result = await supabase.auth.getUser();
    user = result.data.user;
    error = result.error;
  } catch (err) {
    error = err;
  }

  if (!user || error) {
    redirect("/login");
  }

  return {
    user: {
      id: user.id,
      email: user.email ?? null,
    },
  };
}

export async function requireWorkspace(workspaceId: string): Promise<{
  user: AuthUserInfo;
  workspace: WorkspaceInfo;
  membership: MembershipInfo;
}> {
  const supabase = await supabaseServer();
  let user = null as any;
  let authError: unknown = null;
  try {
    const result = await supabase.auth.getUser();
    user = result.data.user;
    authError = result.error;
  } catch (err) {
    authError = err;
  }

  if (!user || authError) {
    redirect("/login");
  }

  const { data: membership } = await supabase
    .from("workspace_members")
    .select("workspace_id, role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership) {
    redirect("/start");
  }

  const { data: workspace, error: wsError } = await supabase
    .from("workspaces")
    .select("id, name, organization_id")
    .eq("id", workspaceId)
    .single();

  if (!workspace || wsError || !workspace.organization_id) {
    redirect("/start");
  }

  return {
    user: {
      id: user.id,
      email: user.email ?? null,
    },
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
  const supabase = await supabaseServer();
  let user = null as { id: string; email?: string | null } | null;
  let authError: unknown = null;

  try {
    const result = await supabase.auth.getUser();
    user = result.data.user;
    authError = result.error;
  } catch (err) {
    authError = err;
  }

  if (!user || authError) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }

  const { data: membership } = await supabase
    .from("workspace_members")
    .select("workspace_id, role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership) {
    return { ok: false, status: 403, error: "Forbidden" };
  }

  const { data: workspace, error: wsError } = await supabase
    .from("workspaces")
    .select("id, name, organization_id")
    .eq("id", workspaceId)
    .single();

  if (!workspace || wsError || !workspace.organization_id) {
    return { ok: false, status: 403, error: "Forbidden" };
  }

  return {
    ok: true,
    user: {
      id: user.id,
      email: user.email ?? null,
    },
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
