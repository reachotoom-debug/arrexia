import { NextResponse } from "next/server";
import { z } from "zod";
import { isAccountActivated } from "@/lib/auth/accountActivation";
import {
  AUTH_ACCOUNT_NOT_ACTIVATED_RESET_MESSAGE,
  AUTH_PASSWORD_RESET_UPDATE_FAILURE_MESSAGE,
} from "@/lib/auth/authErrors";
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
  try {
    const body = (await request.json().catch(() => null)) as unknown;
    const parsed = resetPasswordSchema.safeParse(body);

    if (!parsed.success) {
      return jsonResponse({ ok: false, error: AUTH_PASSWORD_RESET_UPDATE_FAILURE_MESSAGE }, 400);
    }

    const cookieHolder = jsonResponse({ ok: true }, 200);
    const supabase = await supabaseRouteHandler(cookieHolder);
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return jsonResponse({ ok: false, error: AUTH_PASSWORD_RESET_UPDATE_FAILURE_MESSAGE }, 401);
    }

    const activated = await isAccountActivated(user.id);
    if (!activated) {
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
      return jsonResponse(
        { ok: false, error: AUTH_PASSWORD_RESET_UPDATE_FAILURE_MESSAGE },
        400
      );
    }

    await supabase.auth.signOut().catch(() => undefined);

    return jsonResponse({ ok: true }, 200, cookieHolder);
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      const message = error instanceof Error ? error.message : "reset-password failed";
      console.error("[api/auth/reset-password]", message);
    }

    return jsonResponse({ ok: false, error: AUTH_PASSWORD_RESET_UPDATE_FAILURE_MESSAGE }, 500);
  }
}
