import { NextResponse } from "next/server";
import { getOAuthCallbackErrorMessage, isSocialAuthEnabled } from "@/lib/auth/oauthErrors";
import {
  resolvePostLoginDestination,
  WORKSPACE_SETUP_FAILED_MESSAGE,
} from "@/lib/auth/resolvePostLoginDestination";
import { supabaseRouteHandler } from "@/lib/supabase/route-handler";

function sanitizeNext(next: string | null): string | null {
  if (!next) return null;
  if (!next.startsWith("/") || next.startsWith("//")) return null;
  return next;
}

function sanitizeReturnTo(returnTo: string | null): "/login" | "/register" {
  return returnTo === "/register" ? "/register" : "/login";
}

function redirectWithError(origin: string, returnTo: "/login" | "/register", message: string) {
  const friendlyMessage = getOAuthCallbackErrorMessage(message) ?? message;
  return NextResponse.redirect(
    `${origin}${returnTo}?error=${encodeURIComponent(friendlyMessage)}`
  );
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = sanitizeNext(searchParams.get("next"));
  const returnTo = sanitizeReturnTo(searchParams.get("returnTo"));

  const oauthError = searchParams.get("error");
  const oauthErrorDescription = searchParams.get("error_description");

  if (oauthError) {
    if (!isSocialAuthEnabled()) {
      return NextResponse.redirect(`${origin}${returnTo}`);
    }
    const message = oauthErrorDescription || oauthError || "OAuth sign-in failed";
    return redirectWithError(origin, returnTo, message);
  }

  if (!code) {
    if (!isSocialAuthEnabled()) {
      return NextResponse.redirect(`${origin}${returnTo}`);
    }
    return redirectWithError(origin, returnTo, "Missing authorization code");
  }

  const cookieHolder = NextResponse.next();
  const supabase = await supabaseRouteHandler(cookieHolder);

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return redirectWithError(origin, returnTo, error.message);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return redirectWithError(origin, returnTo, "Signed in, but no user found");
  }

  const destination = await resolvePostLoginDestination(user.id, next);

  if ("error" in destination) {
    return redirectWithError(origin, returnTo, WORKSPACE_SETUP_FAILED_MESSAGE);
  }

  const finalRedirect = NextResponse.redirect(`${origin}${destination.path}`);
  cookieHolder.cookies.getAll().forEach(({ name, value, ...options }) => {
    finalRedirect.cookies.set(name, value, options);
  });

  return finalRedirect;
}
