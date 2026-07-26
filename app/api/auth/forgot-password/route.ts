import { NextResponse } from "next/server";
import { z } from "zod";
import {
  isAccountActivated,
  lookupAuthUserIdByEmail,
} from "@/lib/auth/accountActivation";
import { AUTH_FORGOT_PASSWORD_GENERIC_SUCCESS_MESSAGE } from "@/lib/auth/authErrors";
import { buildPasswordResetCallbackUrl } from "@/lib/auth/passwordRecovery";
import { getServerAppOrigin } from "@/lib/config/appUrl";
import { supabaseAdmin } from "@/lib/supabase/admin";

const forgotPasswordSchema = z.object({
  email: z.string().trim().email(),
});

function genericSuccessResponse() {
  return NextResponse.json(
    {
      ok: true,
      message: AUTH_FORGOT_PASSWORD_GENERIC_SUCCESS_MESSAGE,
    },
    {
      status: 200,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    }
  );
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as unknown;
    const parsed = forgotPasswordSchema.safeParse(body);

    if (!parsed.success) {
      return genericSuccessResponse();
    }

    const email = parsed.data.email.trim();
    const lookupEmail = email.toLowerCase();
    const userId = await lookupAuthUserIdByEmail(lookupEmail);

    if (!userId) {
      return genericSuccessResponse();
    }

    const activated = await isAccountActivated(userId);
    if (!activated) {
      return genericSuccessResponse();
    }

    const redirectTo = buildPasswordResetCallbackUrl(getServerAppOrigin(request));
    const admin = supabaseAdmin();
    const { error } = await admin.auth.resetPasswordForEmail(email, {
      redirectTo,
    });

    if (error && process.env.NODE_ENV === "development") {
      console.error("[api/auth/forgot-password]", error.message);
    }

    return genericSuccessResponse();
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      const message = error instanceof Error ? error.message : "forgot-password failed";
      console.error("[api/auth/forgot-password]", message);
    }

    return genericSuccessResponse();
  }
}
