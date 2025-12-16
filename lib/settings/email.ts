"use server";

import { supabaseServer } from "@/lib/supabase/server";

export type WorkspaceEmailSettings = {
  workspace_id: string;
  from_name: string | null;
  from_email: string;
};

export async function getWorkspaceEmailSettings(
  workspaceId: string
): Promise<WorkspaceEmailSettings | null> {
  const supabase = await supabaseServer();

  const { data, error } = await supabase
    .from("workspace_email_settings")
    .select("workspace_id, from_name, from_email")
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (error) {
    console.error("[getWorkspaceEmailSettings] error", {
      message: error instanceof Error ? error.message : String(error),
      code: typeof error === "object" && error !== null && "code" in error ? String(error.code) : undefined,
    });
    return null;
  }

  if (!data || !data.from_email) {
    return null;
  }

  return {
    workspace_id: data.workspace_id,
    from_name: data.from_name ?? null,
    from_email: data.from_email,
  };
}
