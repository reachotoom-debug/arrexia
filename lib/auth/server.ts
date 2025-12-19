import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export type AuthUserInfo = {
  id: string;
  email: string | null;
};

export async function requireUser(): Promise<{ user: AuthUserInfo }> {
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
    // Handle expired/invalid refresh token: redirect without signing out
    if (
      userError?.code === "refresh_token_not_found" ||
      (userError as any)?.status === 400
    ) {
      redirect("/login");
    }
    redirect("/login");
  }

  return {
    user: {
      id: user.id,
      email: user.email ?? null,
    },
  };
}

export async function requireWorkspace(workspaceId: string) {
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
    // Handle expired/invalid refresh token: redirect without signing out
    if (
      userError?.code === "refresh_token_not_found" ||
      (userError as any)?.status === 400
    ) {
      redirect("/login");
    }
    redirect("/login");
  }

  const { data: membership } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("workspace_id", workspaceId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership) {
    redirect("/login");
  }

  return { user, workspaceId };
}
