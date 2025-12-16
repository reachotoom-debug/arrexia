import { supabaseServer } from "@/lib/supabase/server";

export type AccountProfileResult = {
  profile: {
    id: string;
    full_name: string | null;
    avatar_url: string | null;
    email: string;
  } | null;
  error?: string;
};

export async function getCurrentProfile(): Promise<AccountProfileResult> {
  const supabase = await supabaseServer();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    console.error("[getCurrentProfile] auth error:", userError);
    return {
      profile: null,
      error: "User not authenticated",
    };
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    console.error("[getCurrentProfile] profile load error:", error);
    return {
      profile: null,
      error: "Failed to load your profile.",
    };
  }

  if (!data) {
    return {
      profile: null,
    };
  }

  return {
    profile: {
      id: data.id,
      full_name: data.full_name ?? null,
      avatar_url: data.avatar_url ?? null,
      email: user.email ?? "",
    },
  };
}

export type UpsertProfileResult = {
  error?: string;
};

export async function upsertProfile(input: {
  full_name?: string;
  avatar_url?: string | null;
}): Promise<UpsertProfileResult> {
  const supabase = await supabaseServer();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    console.error("[upsertProfile] auth error:", userError);
    return { error: "User not authenticated" };
  }

  const { error } = await supabase
    .from("profiles")
    .upsert(
      {
        id: user.id,
        full_name: input.full_name,
        avatar_url: input.avatar_url,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    );

  if (error) {
    console.error("[upsertProfile] update error:", error);
    return { error: "Failed to update profile" };
  }

  return {};
}
