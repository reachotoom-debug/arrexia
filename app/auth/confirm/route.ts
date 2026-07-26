import { NextResponse } from "next/server";
import { activateAccount } from "@/lib/auth/accountActivation";
import {
  AUTH_CONFIRMATION_LINK_INVALID_MESSAGE,
  AUTH_WORKSPACE_SETUP_FAILED_MESSAGE,
} from "@/lib/auth/authErrors";
import { resolveAuthCallbackFailureRedirect } from "@/lib/auth/postLoginRecovery";
import { resolvePostLoginDestination } from "@/lib/auth/resolvePostLoginDestination";
import {
  parseSignupConfirmSearchParams,
  SIGNUP_CONFIRM_EMAIL_OTP_TYPE,
} from "@/lib/auth/signupConfirm";
import { getServerAppOrigin } from "@/lib/config/appUrl";
import { supabaseRouteHandler } from "@/lib/supabase/route-handler";

function copyCookies(from: NextResponse, to: NextResponse) {
  from.cookies.getAll().forEach(({ name, value, ...options }) => {
    to.cookies.set(name, value, options);
  });
}

function redirectSignupConfirmFailure(origin: string, message: string) {
  return NextResponse.redirect(
    `${origin}/login?error=${encodeURIComponent(message)}`
  );
}

export async function GET(request: Request) {
  const origin = getServerAppOrigin(request);
  const { searchParams } = new URL(request.url);
  const parsed = parseSignupConfirmSearchParams(searchParams);

  if (!parsed.ok) {
    return redirectSignupConfirmFailure(origin, AUTH_CONFIRMATION_LINK_INVALID_MESSAGE);
  }

  const { tokenHash, otpType, nextPath, initialTrialPlan } = parsed.request;

  const cookieHolder = NextResponse.next();
  const supabase = await supabaseRouteHandler(cookieHolder);

  const { error: verifyError } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: otpType,
  });

  if (verifyError) {
    if (process.env.NODE_ENV === "development") {
      console.error("[auth/confirm/verifyOtp]", verifyError.message);
    }
    return redirectSignupConfirmFailure(origin, AUTH_CONFIRMATION_LINK_INVALID_MESSAGE);
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return redirectSignupConfirmFailure(origin, AUTH_CONFIRMATION_LINK_INVALID_MESSAGE);
  }

  const activation = await activateAccount(user.id, "email_signup");
  if (!activation.ok) {
    if (process.env.NODE_ENV === "development") {
      console.error("[auth/confirm/activateAccount]", activation.reason);
    }
    return redirectSignupConfirmFailure(origin, AUTH_WORKSPACE_SETUP_FAILED_MESSAGE);
  }

  const destination = await resolvePostLoginDestination(user.id, nextPath, {
    initialTrialPlan,
  });

  if ("error" in destination) {
    const recoveryUrl = resolveAuthCallbackFailureRedirect({
      origin,
      returnTo: "/login",
      errorMessage: destination.error,
      sessionEstablished: true,
    });
    const recoveryRedirect = NextResponse.redirect(recoveryUrl);
    copyCookies(cookieHolder, recoveryRedirect);
    return recoveryRedirect;
  }

  const finalRedirect = NextResponse.redirect(`${origin}${destination.path}`);
  copyCookies(cookieHolder, finalRedirect);
  return finalRedirect;
}

// Exported for contract tests only.
export const SIGNUP_CONFIRM_ROUTE_OTP_TYPE = SIGNUP_CONFIRM_EMAIL_OTP_TYPE;
