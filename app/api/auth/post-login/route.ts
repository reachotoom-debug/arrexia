import { NextResponse } from "next/server";
import { resolvePostLoginDestination } from "@/lib/auth/resolvePostLoginDestination";
import { supabaseRouteHandler } from "@/lib/supabase/route-handler";

function jsonResponse(body: { ok: true; redirectTo: string } | { ok: false; error: string }, status: number) {
  return NextResponse.json(body, {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

export async function GET(request: Request) {
  try {
    const supabase = await supabaseRouteHandler();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      if (process.env.NODE_ENV === "development") {
        console.info("[api/auth/post-login]", {
          status: 401,
          authenticated: "no",
          error: userError?.message ?? "no user",
        });
      }
      return jsonResponse({ ok: false, error: "Not authenticated" }, 401);
    }

    const { searchParams } = new URL(request.url);
    const next = searchParams.get("next");
    const result = await resolvePostLoginDestination(user.id, next);

    if ("error" in result) {
      if (process.env.NODE_ENV === "development") {
        console.info("[api/auth/post-login]", {
          status: 500,
          userId: user.id,
          error: result.error,
        });
      }
      return jsonResponse({ ok: false, error: result.error }, 500);
    }

    if (process.env.NODE_ENV === "development") {
      console.info("[api/auth/post-login]", {
        status: 200,
        userId: user.id,
        redirectTo: result.path,
        workspaceFound: result.workspaceFound ? "yes" : "no",
        workspaceCreated: result.workspaceCreated ? "yes" : "no",
      });
    }

    return jsonResponse({ ok: true, redirectTo: result.path }, 200);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to resolve post-login destination";

    if (process.env.NODE_ENV === "development") {
      console.error("[api/auth/post-login]", { status: 500, error: message });
    }

    return jsonResponse({ ok: false, error: "Failed to resolve post-login destination" }, 500);
  }
}
