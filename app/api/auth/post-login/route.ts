import { NextResponse } from "next/server";
import { resolvePostLoginDestination } from "@/lib/auth/resolvePostLoginDestination";
import { supabaseRouteHandler } from "@/lib/supabase/route-handler";

function jsonResponse(
  body: { ok: true; redirectTo: string } | { ok: false; error: string },
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

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const next = searchParams.get("next");

    const successResponse = jsonResponse({ ok: true, redirectTo: "" }, 200);
    const supabase = await supabaseRouteHandler(successResponse);
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return jsonResponse({ ok: false, error: "Not authenticated" }, 401);
    }

    const result = await resolvePostLoginDestination(user.id, next);

    if ("error" in result) {
      return jsonResponse({ ok: false, error: result.error }, 500);
    }

    return jsonResponse({ ok: true, redirectTo: result.path }, 200, successResponse);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to resolve post-login destination";

    if (process.env.NODE_ENV === "development") {
      console.error("[api/auth/post-login]", { status: 500, error: message });
    }

    return jsonResponse({ ok: false, error: "Failed to resolve post-login destination" }, 500);
  }
}
