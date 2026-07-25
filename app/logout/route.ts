import { NextResponse } from "next/server";
import { supabaseRouteHandler } from "@/lib/supabase/route-handler";

export async function GET(request: Request) {
  const response = NextResponse.redirect(new URL("/pricing", request.url));
  const supabase = await supabaseRouteHandler(response);
  await supabase.auth.signOut();

  return response;
}
