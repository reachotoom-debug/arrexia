import { NextResponse } from "next/server";
import { z } from "zod";
import { isAccountActivated } from "@/lib/auth/accountActivation";
import {
  AUTH_ACCOUNT_NOT_ACTIVATED_RESET_MESSAGE,
  AUTH_PASSWORD_RESET_UPDATE_FAILURE_MESSAGE,
} from "@/lib/auth/authErrors";
import {
  logResetPasswordStageSafe,
  mapRecoveryPasswordUpdateError,
} from "@/lib/auth/resetPasswordUpdate";
import { supabaseRouteHandler } from "@/lib/supabase/route-handler";

const resetPasswordSchema = z.object({
  password: z.string().min(6),
});

function jsonResponse(
  body: { ok: boolean; error?: string },
  status: number,
  cookieSource?: NextResponse
) {
  const response = NextResponse.json(body, {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });

  if (cookieSource) {
    cookieSource.cookies.getAll().forEach(({ name, value, ...options }) => {
      response.cookies.set(name, value, options);
    });
  }

  return response;
}

export async function POST(request: Request) {
  let cookieHolder: NextResponse | undefined;

  try {
    const body = (await request.json().catch(() => null)) as unknown;
    const parsed = resetPasswordSchema.safeParse(body);

    if (!parsed.success) {
      logResetPasswordStageSafe({ stage: "validate_body" });
      return jsonResponse({ ok: false, error: AUTH_PASSWORD_RESET_UPDATE_FAILURE_MESSAGE }, 400);
    }

    cookieHolder = jsonResponse({ ok: true }, 200);
    const supabase = await supabaseRouteHandler(cookieHolder);

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      logResetPasswordStageSafe({
        stage: "resolve_session",
        hasUser: false,
        errorCode: userError?.code ?? null,
        errorStatus: userError?.status ?? null,
        errorMessage: userError?.message ?? "missing_user",
      });
      return jsonResponse(
        { ok: false, error: AUTH_PASSWORD_RESET_UPDATE_FAILURE_MESSAGE },
        401,
        cookieHolder
      );
    }

    const activated = await isAccountActivated(user.id);
    if (!activated) {
      logResetPasswordStageSafe({
        stage: "activation_gate",
        hasUser: true,
        activationPassed: false,
      });
      await supabase.auth.signOut().catch(() => undefined);
      return jsonResponse(
        { ok: false, error: AUTH_ACCOUNT_NOT_ACTIVATED_RESET_MESSAGE },
        403,
        cookieHolder
      );
    }

    const { error: updateError } = await supabase.auth.updateUser({
      password: parsed.data.password,
    });

    if (updateError) {
      logResetPasswordStageSafe({
        stage: "update_password",
        hasUser: true,
        activationPassed: true,
        errorCode: updateError.code ?? null,
        errorStatus: updateError.status ?? null,
        errorMessage: updateError.message ?? null,
      });
      return jsonResponse(
        { ok: false, error: mapRecoveryPasswordUpdateError(updateError) },
        400,
        cookieHolder
      );
    }

    await supabase.auth.signOut().catch(() => undefined);

    return jsonResponse({ ok: true }, 200, cookieHolder);
  } catch (error) {
    logResetPasswordStageSafe({
      stage: "update_password",
      errorMessage: error instanceof Error ? error.message : "reset-password failed",
    });

    return jsonResponse(
      { ok: false, error: AUTH_PASSWORD_RESET_UPDATE_FAILURE_MESSAGE },
      500,
      cookieHolder
    );
  }
}
