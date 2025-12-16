// lib/supabase/server.ts
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function supabaseServer() {
  const cookieStore = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        // READ ONLY: used so Supabase can see the auth cookies for the current request.
        getAll() {
          return cookieStore.getAll();
        },
        // IMPORTANT:
        // On the server (RSC), we MUST NOT mutate cookies, otherwise Next 16
        // throws "Cookies can only be modified in a Server Action or Route Handler".
        // So this is a NO-OP.
        setAll() {
          // no-op on purpose
        },
      },
    }
  );

  return supabase;
}
