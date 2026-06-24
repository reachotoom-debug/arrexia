"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/supabase/index";

let browserClient: ReturnType<typeof createBrowserClient<Database>> | null = null;

export function supabaseBrowser() {
  if (browserClient) return browserClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Supabase env vars are missing. Check NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local"
    );
  }

  browserClient = createBrowserClient<Database>(url, anonKey);
  return browserClient;
}
