import { NextResponse } from "next/server";
import {
  parseRecoveryConfirmSearchParams,
  RECOVERY_CONFIRM_OTP_TYPE,
} from "@/lib/auth/recoveryConfirm";
import {
  buildPasswordResetExpiredUrl,
  PASSWORD_RESET_NEXT_PATH,
} from "@/lib/auth/passwordRecovery";
import { getServerAppOrigin } from "@/lib/config/appUrl";
import { supabaseRouteHandler } from "@/lib/supabase/route-handler";

function copyCookies(from: NextResponse, to: NextResponse) {
  from.cookies.getAll().forEach(({ name, value, ...options }) => {
    to.cookies.set(name, value, options);
  });
}

function redirectRecoveryExpired(origin: string) {
  return NextResponse.redirect(buildPasswordResetExpiredUrl(origin));
}

export async function GET(request: Request) {
  const origin = getServerAppOrigin(request);
  const { searchParams } = new URL(request.url);
  const parsed = parseRecoveryConfirmSearchParams(searchParams);

  if (!parsed.ok) {
    return redirectRecoveryExpired(origin);
  }

  const { tokenHash, otpType } = parsed.request;

  const cookieHolder = NextResponse.next();
  const supabase = await supabaseRouteHandler(cookieHolder);

  const { error: verifyError } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: otpType,
  });

  if (verifyError) {
    if (process.env.NODE_ENV === "development") {
      console.error("[auth/recover/verifyOtp]", verifyError.message);
    }
    return redirectRecoveryExpired(origin);
  }

  const finalRedirect = NextResponse.redirect(`${origin}${PASSWORD_RESET_NEXT_PATH}`);
  copyCookies(cookieHolder, finalRedirect);
  return finalRedirect;
}

// Exported for contract tests only.
export const RECOVERY_ROUTE_OTP_TYPE = RECOVERY_CONFIRM_OTP_TYPE;
