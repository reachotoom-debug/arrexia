import { supabaseAdmin } from "@/lib/supabase/admin";

/** Primary workspace dashboard for an admin user, or /start when none exists. */
export async function resolveAdminBackToAppPath(userId: string): Promise<string> {
  try {
    const admin = supabaseAdmin();
    const { data, error } = await admin
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", userId)
      .order("created_at", { ascending: true })
      .limit(1);

    const workspaceId = data?.[0]?.workspace_id;
    if (error || !workspaceId) {
      return "/start";
    }

    return `/${workspaceId}/dashboard`;
  } catch {
    return "/start";
  }
}
