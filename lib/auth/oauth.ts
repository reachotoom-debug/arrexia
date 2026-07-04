"use client";

import { supabaseBrowser } from "@/lib/supabase/client";
import { buildAuthCallbackUrl } from "@/lib/config/appUrl";
import {
  getOAuthErrorMessage,
  type OAuthProvider,
} from "@/lib/auth/oauthErrors";

export type { OAuthProvider };

type SignInWithOAuthOptions = {
  next?: string | null;
  returnTo?: "/login" | "/register";
};

export async function signInWithOAuthProvider(
  provider: OAuthProvider,
  options: SignInWithOAuthOptions = {}
) {
  const supabase = supabaseBrowser();

  const redirectTo = buildAuthCallbackUrl({
    next: options.next,
    returnTo: options.returnTo ?? "/login",
  });

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo,
    },
  });

  if (error) {
    return { error: { message: getOAuthErrorMessage(provider, error.message) } };
  }

  if (data?.url) {
    window.location.assign(data.url);
    return { error: null };
  }

  return {
    error: {
      message: getOAuthErrorMessage(provider, "OAuth sign-in failed"),
    },
  };
}
