"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";
import { requireWorkspace } from "@/lib/auth/server";
import {
  ClientFormSchema,
  type ClientFormValues,
} from "@/lib/clients/schema";
import { assertClientCreateAllowed, PlanLimitError, PLAN_LIMIT_CLIENTS_MESSAGE } from "@/lib/billing/assertWithinPlanLimits";
import { type ActionResult, ok, fail } from "@/lib/actions/result";

export async function createClient(
  workspaceId: string,
  rawValues: ClientFormValues
) {
  const { workspace } = await requireWorkspace(workspaceId);
  const validatedWorkspaceId = workspace.id;

  // Guard: workspace_id must be present
  if (!validatedWorkspaceId) {
    return fail("workspace_id is required");
  }

  const parsed = ClientFormSchema.parse(rawValues);
  
  // Validate plan limit - throw error if exceeded (do NOT redirect here)
  try {
    await assertClientCreateAllowed(workspaceId);
  } catch (error) {
    if (error instanceof PlanLimitError && error.code === "PLAN_LIMIT_CLIENTS") {
      return fail(PLAN_LIMIT_CLIENTS_MESSAGE, "PLAN_LIMIT_CLIENTS");
    }
    throw error;
  }
  
  const supabase = await supabaseServer();

  // Convert paymentTerms string to number
  const paymentTermsNum =
    parsed.paymentTerms === "custom" || !parsed.paymentTerms
      ? 30
      : parseInt(parsed.paymentTerms, 10);

  // Ensure defaults: is_active = true (default), archived_at = null
  // Note: We respect the form's status field, but default to active for new clients
  const isActive = parsed.status === "active";
  
  // Build insert payload with required fields
  // ALWAYS includes: workspace_id, name, is_active (default true), archived_at (null)
  const insertPayload = {
    workspace_id: validatedWorkspaceId,
    name: parsed.name, // Required
    is_active: isActive, // true when status is "active", false when "inactive"
    archived_at: null, // Explicitly set to null for new clients
    email: parsed.email ?? null,
    whatsapp: parsed.phone ?? null, // Map phone to whatsapp column
    company: parsed.company ?? null,
    country: parsed.country,
    payment_terms: paymentTermsNum,
    status: parsed.status === "active" ? "active" : "archived",
    notes: parsed.notes ?? null,
    // Do NOT set created_at/updated_at - let database defaults handle it
  };

  const { data, error } = await supabase
    .from("clients")
    .insert(insertPayload)
    .select("id")
    .single();

  if (error) {
    const errorDetails = error.details ? ` Details: ${error.details}` : "";
    const errorMessage = `[createClient] ${error.code || "UNKNOWN"}: ${error.message}${errorDetails}`;
    console.error("[createClient] insert failed:", {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
      workspaceId,
      payload: insertPayload,
    });
    return fail(errorMessage, error.code);
  }

  if (!data) {
    console.error("[createClient] insert returned no data", {
      workspaceId,
      payload: insertPayload,
    });
    return fail("[createClient] Insert succeeded but no data returned");
  }


  revalidatePath(`/${workspaceId}/clients`);
  revalidatePath(`/${workspaceId}/dashboard`);
  return ok(`/${workspaceId}/clients?status=active&view=default&sort=client_name&dir=asc&page=1&pageSize=10`);
}

export async function updateClient(
  workspaceId: string,
  clientId: string,
  rawValues: ClientFormValues
) {
  const { workspace } = await requireWorkspace(workspaceId);
  const validatedWorkspaceId = workspace.id;

  // Guard: workspace_id must be present
  if (!validatedWorkspaceId) {
    return fail("workspace_id is required");
  }

  const parsed = ClientFormSchema.parse(rawValues);
  const supabase = await supabaseServer();

  // Convert paymentTerms string to number
  const paymentTermsNum =
    parsed.paymentTerms === "custom" || !parsed.paymentTerms
      ? 30
      : parseInt(parsed.paymentTerms, 10);

  const { error } = await supabase
    .from("clients")
    .update({
      name: parsed.name,
      email: parsed.email ?? null,
      whatsapp: parsed.phone ?? null,
      company: parsed.company ?? null,
      country: parsed.country,
      payment_terms: paymentTermsNum,
      status: parsed.status === "active" ? "active" : "archived",
      is_active: parsed.status === "active", // Set is_active based on status
      notes: parsed.notes ?? null,
    })
    .eq("id", clientId)
    .eq("workspace_id", validatedWorkspaceId);

  if (error) {
    console.error("[updateClient] update failed:", error);
    return fail(`Failed to update client: ${error.message}`, error.code);
  }

  revalidatePath(`/${workspaceId}/clients`);
  revalidatePath(`/${workspaceId}/clients/${clientId}`);
  revalidatePath(`/${workspaceId}/dashboard`);
  return ok(`/${workspaceId}/clients/${clientId}`);
}

export async function toggleClientActive(
  workspaceId: string,
  clientId: string,
  isActive: boolean
) {
  const supabase = await supabaseServer();

  const { error } = await supabase
    .from("clients")
    .update({ is_active: isActive })
    .eq("id", clientId)
    .eq("workspace_id", workspaceId);

  if (error) {
    console.error("[toggleClientActive] update failed:", error);
    throw new Error(`Failed to update client active status: ${error.message}`);
  }

  revalidatePath(`/${workspaceId}/clients`);
  revalidatePath(`/${workspaceId}/clients/${clientId}`);
  revalidatePath(`/${workspaceId}/dashboard`);
}

function getErrorMessage(e: unknown): string {
  if (!e) return "Unknown error";
  if (typeof e === "string") return e;
  const anyE = e as any;
  return anyE?.message || anyE?.error_description || JSON.stringify(anyE);
}

/**
 * Archive client: sets archived_at = now()
 * Also ensures workspace scoping.
 * IMPORTANT: Updates ONLY the base table public.clients (not any view)
 */
export async function archiveClient(workspaceId: string, clientId: string): Promise<ActionResult> {
  try {
    const supabase = await supabaseServer();

    console.log("[archiveClient] updating public.clients", { workspaceId, clientId });

    // Explicitly target the base table public.clients
    const { error, data } = await supabase
      .from("clients")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", clientId)
      .eq("workspace_id", workspaceId)
      .select("id")
      .single(); // Use select + single to verify the update target

    if (error) {
      console.error("[archiveClient] update failed", {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
        relation: "clients", // Log the relation name used
        workspaceId,
        clientId,
      });
      return fail(error.message, error.code);
    }


    revalidatePath(`/${workspaceId}/clients`);
    revalidatePath(`/${workspaceId}/clients/${clientId}`);
    revalidatePath(`/${workspaceId}/dashboard`);
    return { ok: true };
  } catch (e) {
    const errorMsg = getErrorMessage(e);
    console.error("[archiveClient] exception", {
      error: errorMsg,
      workspaceId,
      clientId,
      exception: e,
    });
    return fail(errorMsg);
  }
}

/**
 * Unarchive client: sets archived_at = null and is_active = true (safe default)
 * IMPORTANT: Updates ONLY the base table public.clients (not any view)
 */
export async function unarchiveClient(workspaceId: string, clientId: string): Promise<ActionResult> {
  try {
    const supabase = await supabaseServer();

    console.log("[unarchiveClient] updating public.clients", { workspaceId, clientId });

    // Explicitly target the base table public.clients
    const { error, data } = await supabase
      .from("clients")
      .update({ 
        archived_at: null,
        is_active: true, // Ensure client is active when unarchived
      })
      .eq("id", clientId)
      .eq("workspace_id", workspaceId)
      .select("id")
      .single(); // Use select + single to verify the update target

    if (error) {
      console.error("[unarchiveClient] update failed", {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
        relation: "clients", // Log the relation name used
        workspaceId,
        clientId,
      });
      return fail(error.message, error.code);
    }


    revalidatePath(`/${workspaceId}/clients`);
    revalidatePath(`/${workspaceId}/clients/${clientId}`);
    revalidatePath(`/${workspaceId}/dashboard`);
    return { ok: true };
  } catch (e) {
    const errorMsg = getErrorMessage(e);
    console.error("[unarchiveClient] exception", {
      error: errorMsg,
      workspaceId,
      clientId,
      exception: e,
    });
    return fail(errorMsg);
  }
}

/**
 * @deprecated Use archiveClient instead. This function is kept for backward compatibility.
 */
/**
 * Safe admin helper to archive duplicate clients by email
 * 
 * Finds clients with duplicate lower(email) within a workspace,
 * keeps the newest record (created_at desc),
 * and archives all others (sets archived_at).
 * 
 * Never deletes rows - only archives.
 * 
 * @param workspaceId - Workspace ID
 * @returns Object with affectedCount (number of clients archived)
 */
export async function archiveDuplicateClients(workspaceId: string): Promise<{
  success: boolean;
  affectedCount: number;
  error?: string;
}> {
  const supabase = await supabaseServer();

  try {
    // Find all clients with duplicate emails in this workspace
    // We'll use a subquery to identify duplicates
    const { data: duplicateGroups, error: queryError } = await supabase
      .from("clients")
      .select("id, email, created_at")
      .eq("workspace_id", workspaceId)
      .not("email", "is", null)
      .order("created_at", { ascending: false }); // Newest first

    if (queryError) {
      console.error("[archiveDuplicateClients] query error:", queryError);
      return {
        success: false,
        affectedCount: 0,
        error: queryError.message,
      };
    }

    if (!duplicateGroups || duplicateGroups.length === 0) {
      return {
        success: true,
        affectedCount: 0,
      };
    }

    // Group by lowercase email and find duplicates
    const emailGroups = new Map<string, Array<{ id: string; created_at: string | null }>>();
    
    for (const client of duplicateGroups) {
      if (!client.email) continue;
      const emailLower = client.email.toLowerCase();
      if (!emailGroups.has(emailLower)) {
        emailGroups.set(emailLower, []);
      }
      emailGroups.get(emailLower)!.push({
        id: client.id,
        created_at: client.created_at,
      });
    }

    // Find email groups with duplicates (more than 1 client)
    const duplicateEmailGroups: Array<{ email: string; clients: Array<{ id: string; created_at: string | null }> }> = [];
    for (const [email, clients] of emailGroups.entries()) {
      if (clients.length > 1) {
        // Sort by created_at desc (newest first)
        clients.sort((a, b) => {
          const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
          const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
          return dateB - dateA;
        });
        duplicateEmailGroups.push({ email, clients });
      }
    }

    if (duplicateEmailGroups.length === 0) {
      return {
        success: true,
        affectedCount: 0,
      };
    }

    // Collect IDs to archive (all except the newest for each email)
    const idsToArchive: string[] = [];
    for (const group of duplicateEmailGroups) {
      // Keep the first (newest) client, archive the rest
      const toArchive = group.clients.slice(1);
      idsToArchive.push(...toArchive.map((c) => c.id));
    }

    if (idsToArchive.length === 0) {
      return {
        success: true,
        affectedCount: 0,
      };
    }

    // Archive all duplicate clients (except the newest ones)
    const { data: updatedData, error: updateError } = await supabase
      .from("clients")
      .update({
        archived_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .in("id", idsToArchive)
      .eq("workspace_id", workspaceId)
      .is("archived_at", null) // Only archive if not already archived
      .select("id");

    if (updateError) {
      console.error("[archiveDuplicateClients] update error:", updateError);
      return {
        success: false,
        affectedCount: 0,
        error: updateError.message,
      };
    }

    const affectedCount = updatedData?.length || 0;

    // Revalidate paths
    revalidatePath(`/${workspaceId}/clients`);
    revalidatePath(`/${workspaceId}/dashboard`);

    console.log("[archiveDuplicateClients] archived duplicate clients", {
      workspaceId,
      affectedCount,
      duplicateEmailGroups: duplicateEmailGroups.length,
    });

    return {
      success: true,
      affectedCount,
    };
  } catch (error) {
    console.error("[archiveDuplicateClients] exception:", error);
    return {
      success: false,
      affectedCount: 0,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export async function deleteClient(workspaceId: string, clientId: string) {
  const result = await archiveClient(workspaceId, clientId);
  if (!result.ok) {
    throw new Error(result.message);
  }
}
