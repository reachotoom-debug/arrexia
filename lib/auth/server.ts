import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";

export type AuthUserInfo = {
  id: string;
  email: string | null;
};

export type WorkspaceInfo = {
  id: string;
  name: string;
};

export async function requireUser(): Promise<{ user: AuthUserInfo }> {
  const supabase = await supabaseServer();
  const { data: { user }, error } = await supabase.auth.getUser();
  
  // Treat refresh_token_not_found and any auth errors as unauthenticated
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
}> {
  const supabase = await supabaseServer();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  
  // Treat refresh_token_not_found and any auth errors as unauthenticated
  if (!user || authError) {
    redirect("/login");
  }

  // Check membership first
  const { data: membership } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("workspace_id", workspaceId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership) {
    redirect("/start");
  }

  // Load workspace - must exist if membership exists
  const { data: workspace, error: wsError } = await supabase
    .from("workspaces")
    .select("*")
    .eq("id", workspaceId)
    .single();

  if (!workspace || wsError) {
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
    },
  };
}
