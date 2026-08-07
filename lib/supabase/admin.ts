import { createClient, SupabaseClient } from "@supabase/supabase-js";

let cachedAdminClient: SupabaseClient | null = null;

/** Test-only hook to inject a mock Supabase admin client. */
export function setSupabaseAdminClientForTests(client: SupabaseClient | null): void {
  cachedAdminClient = client;
}

export function supabaseAdmin(): SupabaseClient {
  if (!cachedAdminClient) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !serviceKey) {
      throw new Error(
        "supabaseAdmin: missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY",
      );
    }

    cachedAdminClient = createClient(url, serviceKey, {
      auth: {
        persistSession: false,
      },
    });
  }

  return cachedAdminClient;
}
