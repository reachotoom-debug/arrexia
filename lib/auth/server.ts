import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { Database } from "@/types/supabase";
import type { PostgrestError } from "@supabase/supabase-js";

type WorkspaceRow = Database["public"]["Tables"]["workspaces"]["Row"];

export type AuthUserInfo = {
  id: string;
  email: string | null;
  fullName: string | null;
  avatarUrl: string | null;
};

export type WorkspaceInfo = {
  id: string;
  name: string;
  logoUrl: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  country: string | null;
  taxNumber: string | null;
};

export interface RequireWorkspaceResult {
  user: AuthUserInfo;
  workspace: WorkspaceInfo;
  workspaceId: string;
}

// 🔴 Your single dev workspace – TEMPORARY fallback to unstick everything
const FALLBACK_WORKSPACE_ID = "4fcdda2b-6006-44d8-a87d-6c8b3e768374";

export async function requireUser(): Promise<{ user: AuthUserInfo; userError: PostgrestError | null }> {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll().map((cookie) => ({
            name: cookie.name,
            value: cookie.value,
          }));
        },
        setAll() {
          // no-op: server components should not modify cookies
        },
      },
    }
  );

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("User not authenticated");
  }

  // Load profile from profiles table
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("full_name, avatar_url")
    .eq("id", user.id)
    .maybeSingle();

  // Log profile error but don't fail - profile is optional
  if (profileError && profileError.code !== "PGRST116") {
    console.warn("[requireUser] profile load error:", profileError);
  }

  return {
    user: {
      id: user.id,
      email: user.email,
      fullName: profile?.full_name || null,
      avatarUrl: profile?.avatar_url || null,
    },
    userError: profileError || null,
  };
}

export async function requireWorkspace(
  workspaceId?: string
): Promise<RequireWorkspaceResult> {
  // Get user from cookie-based client for auth
  const cookieStore = await cookies();
  const authSupabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll().map((cookie) => ({
            name: cookie.name,
            value: cookie.value,
          }));
        },
        setAll() {
          // no-op: server components should not modify cookies
        },
      },
    }
  );

  const {
    data: { user },
    error: userError,
  } = await authSupabase.auth.getUser();

  if (userError || !user) {
    throw new Error("User not authenticated");
  }

  // Load user profile
  const { data: profile } = await authSupabase
    .from("profiles")
    .select("full_name, avatar_url")
    .eq("id", user.id)
    .maybeSingle();

  const authUser: AuthUserInfo = {
    id: user.id,
    email: user.email,
    fullName: profile?.full_name || null,
    avatarUrl: profile?.avatar_url || null,
  };

  // 1) Normalize workspaceId
  let effectiveWorkspaceId = workspaceId;

  if (!effectiveWorkspaceId || effectiveWorkspaceId === "undefined") {
    console.warn("[requireWorkspace] missing/undefined workspaceId, using fallback");
    effectiveWorkspaceId = FALLBACK_WORKSPACE_ID;
  }

  // 2) Load workspace using admin client
  const admin = supabaseAdmin();

  const { data: workspace, error: workspaceError } = await admin
    .from("workspaces")
    .select("*")
    .eq("id", effectiveWorkspaceId)
    .maybeSingle();

  if (workspaceError) {
    throw new Error(
      `[requireWorkspace] workspace query failed: ${workspaceError.message} (${workspaceError.code})`,
    );
  }

  if (!workspace) {
    throw new Error(
      `Workspace not found via admin client: ${effectiveWorkspaceId}`,
    );
  }

  // 3) Check workspace membership using admin client
  const { data: membership, error: membershipError } = await admin
    .from("workspace_members")
    .select("*")
    .eq("workspace_id", workspace.id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (membershipError) {
    console.error("[requireWorkspace] membership load error:", {
      message: membershipError.message,
      code: membershipError.code,
    });
    throw new Error(
      `[requireWorkspace] membership query failed: ${membershipError.message} (${membershipError.code})`,
    );
  }

  if (!membership) {
    throw new Error(
      `Access denied to workspace ${workspace.id} for user ${user.id}`,
    );
  }

  // 4) Load workspace settings to get full profile info
  const supabase = await supabaseServer();
  const { data: settings } = await supabase
    .from("settings")
    .select("workspace_display_name, workspace_logo_url, business_email, business_phone, business_website, business_country, business_tax_number")
    .eq("workspace_id", effectiveWorkspaceId)
    .maybeSingle();

  // Build WorkspaceInfo from workspace + settings
  const workspaceInfo: WorkspaceInfo = {
    id: workspace.id,
    name: settings?.workspace_display_name || workspace.name || "Workspace",
    logoUrl: settings?.workspace_logo_url || workspace.profile_image_url || null,
    email: settings?.business_email || null,
    phone: settings?.business_phone || null,
    website: settings?.business_website || null,
    country: settings?.business_country || null,
    taxNumber: settings?.business_tax_number || null,
  };

  console.log("[requireWorkspace]", {
    userId: user.id,
    workspaceId: workspace.id,
  });

  return {
    user: authUser,
    workspace: workspaceInfo,
    workspaceId: workspace.id,
  };
}
