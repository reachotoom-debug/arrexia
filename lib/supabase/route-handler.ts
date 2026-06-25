import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { NextResponse } from "next/server";

/**
 * Supabase client for Route Handlers where auth cookies must be written to the
 * outgoing response (required for cookie persistence in production).
 */
export async function supabaseRouteHandler(response: NextResponse) {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            try {
              cookieStore.set(name, value, options);
            } catch {
              // Route handlers should allow this; ignore if called elsewhere.
            }
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );
}
