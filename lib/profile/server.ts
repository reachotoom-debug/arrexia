import { cache } from "react";

import { getAuthenticatedUser } from "@/lib/auth/server";
import { perfTime } from "@/lib/perf/server";
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

async function loadCurrentProfileUncached(): Promise<AccountProfileResult> {
  const user = await getAuthenticatedUser();

  if (!user) {
    return {
      profile: null,
      error: "User not authenticated",
    };
  }

  const supabase = await supabaseServer();
  const { data, error } = await perfTime(
    "getCurrentProfile",
    "profilesQuery",
    async () =>
      supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
    (result) => `found=${result.data ? 1 : 0}`
  );

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

/** Request-scoped memoized profile lookup (reuses cached auth user). */
export const getCurrentProfile = cache(loadCurrentProfileUncached);

export type UpsertProfileResult = {
  error?: string;
};

export async function upsertProfile(input: {
  full_name?: string;
  avatar_url?: string | null;
}): Promise<UpsertProfileResult> {
  const user = await getAuthenticatedUser();

  if (!user) {
    return { error: "User not authenticated" };
  }

  const supabase = await supabaseServer();
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
