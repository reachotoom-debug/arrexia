import { supabaseServer } from "@/lib/supabase/server";

/**
 * Get clients for payment form
 * 
 * For "new payment": returns all non-archived clients (active + inactive)
 * For "edit payment": returns all non-archived clients, plus the payment's client
 *   (even if archived) to ensure the form can display it
 * 
 * @param workspaceId - Workspace ID
 * @param includeClientId - Optional client ID to include even if archived (for edit mode)
 * @returns Array of clients with id and name
 */
export async function getPaymentClients(
  workspaceId: string,
  includeClientId?: string | null
): Promise<{ id: string; name: string }[]> {
  const supabase = await supabaseServer();

  // Base query: all non-archived clients (active + inactive) - not paginated/limited
  const { data: clientsData, error } = await supabase
    .from("clients")
    .select("id, name, email, company, whatsapp, is_active, archived_at")
    .eq("workspace_id", workspaceId)
    .is("archived_at", null)
    .order("name", { ascending: true });

  if (error) {
    console.error("[getPaymentClients] failed to load clients:", error);
    return [];
  }

  const clients = clientsData?.map((c) => ({ id: c.id, name: c.name })) ?? [];

  // For edit mode: if payment's client is not in the list (inactive/archived), fetch it separately
  if (includeClientId && !clients.some((c) => c.id === includeClientId)) {
    const { data: includedClient } = await supabase
      .from("clients")
      .select("id, name")
      .eq("id", includeClientId)
      .eq("workspace_id", workspaceId)
      .maybeSingle();

    if (includedClient) {
      // Add to the beginning of the list for visibility
      clients.unshift({ id: includedClient.id, name: includedClient.name });
    }
  }

  return clients;
}

