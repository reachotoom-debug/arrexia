import { NextResponse } from "next/server";
import { getServerAppOrigin } from "@/lib/config/appUrl";
import { getOAuthCallbackErrorMessage, isSocialAuthEnabled } from "@/lib/auth/oauthErrors";
import {
  isPasswordRecoveryCallback,
  PASSWORD_RESET_NEXT_PATH,
} from "@/lib/auth/passwordRecovery";
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

function redirectRecoveryExpired(origin: string) {
  return NextResponse.redirect(`${origin}${PASSWORD_RESET_NEXT_PATH}?state=expired`);
}

function copyCookies(from: NextResponse, to: NextResponse) {
  from.cookies.getAll().forEach(({ name, value, ...options }) => {
    to.cookies.set(name, value, options);
  });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const origin = getServerAppOrigin(request);
  const code = searchParams.get("code");
  const next = sanitizeNext(searchParams.get("next"));
  const returnTo = sanitizeReturnTo(searchParams.get("returnTo"));
  const isRecovery = isPasswordRecoveryCallback(next);

  const oauthError = searchParams.get("error");
  const oauthErrorDescription = searchParams.get("error_description");

  if (oauthError) {
    if (isRecovery) {
      return redirectRecoveryExpired(origin);
    }
    if (!isSocialAuthEnabled()) {
      return NextResponse.redirect(`${origin}${returnTo}`);
    }
    const message = oauthErrorDescription || oauthError || "OAuth sign-in failed";
    return redirectWithError(origin, returnTo, message);
  }

  if (!code) {
    if (isRecovery) {
      return redirectRecoveryExpired(origin);
    }
    if (!isSocialAuthEnabled()) {
      return NextResponse.redirect(`${origin}${returnTo}`);
    }
    return redirectWithError(origin, returnTo, "Missing authorization code");
  }

  const cookieHolder = NextResponse.next();
  const supabase = await supabaseRouteHandler(cookieHolder);

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("[auth/callback/recovery]", error.message);
    }
    if (isRecovery) {
      return redirectRecoveryExpired(origin);
    }
    return redirectWithError(origin, returnTo, error.message);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    if (isRecovery) {
      return redirectRecoveryExpired(origin);
    }
    return redirectWithError(origin, returnTo, "Signed in, but no user found");
  }

  if (isRecovery) {
    const finalRedirect = NextResponse.redirect(`${origin}${PASSWORD_RESET_NEXT_PATH}`);
    copyCookies(cookieHolder, finalRedirect);
    return finalRedirect;
  }

  const destination = await resolvePostLoginDestination(user.id, next);

  if ("error" in destination) {
    return redirectWithError(origin, returnTo, WORKSPACE_SETUP_FAILED_MESSAGE);
  }

  const finalRedirect = NextResponse.redirect(`${origin}${destination.path}`);
  copyCookies(cookieHolder, finalRedirect);

  return finalRedirect;
}
