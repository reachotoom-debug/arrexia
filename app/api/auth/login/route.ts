import { NextResponse } from "next/server";
import { supabaseRouteHandler } from "@/lib/supabase/route-handler";

function jsonResponse(
  body: { ok: true } | { ok: false; error: string },
  status: number
) {
  return NextResponse.json(body, {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { email?: string; password?: string };
    const email = body.email?.trim();
    const password = body.password;

    if (!email || !password) {
      return jsonResponse({ ok: false, error: "Email and password are required" }, 400);
    }

    const response = jsonResponse({ ok: true }, 200);
    const supabase = await supabaseRouteHandler(response);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      return jsonResponse({ ok: false, error: error.message || "Failed to sign in" }, 401);
    }

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return jsonResponse({ ok: false, error: "Signed in, but no user found" }, 401);
    }

    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to sign in";
    return jsonResponse({ ok: false, error: message }, 500);
  }
}
