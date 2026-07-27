import { resolveCustomerFacingBusinessName } from "@/lib/branding/resolveCustomerFacingBusinessName";
import type { supabaseServer } from "@/lib/supabase/server";

type SupabaseClient = Awaited<ReturnType<typeof supabaseServer>>;

export async function loadCustomerFacingBusinessName(
  supabase: SupabaseClient,
  workspaceId: string
): Promise<string> {
  const [{ data: settings }, { data: workspace }] = await Promise.all([
    supabase
      .from("settings")
      .select("branding_business_legal_name, business_name, workspace_display_name")
      .eq("workspace_id", workspaceId)
      .maybeSingle(),
    supabase.from("workspaces").select("name").eq("id", workspaceId).maybeSingle(),
  ]);

  return resolveCustomerFacingBusinessName({
    brandingBusinessLegalName: settings?.branding_business_legal_name,
    businessName: settings?.business_name,
    workspaceDisplayName: settings?.workspace_display_name,
    workspaceName: workspace?.name,
  });
}
