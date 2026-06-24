"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";

type ActionResult = { ok: true } | { ok: false; error: string };

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
 * 
 * @param cascade - If true, also archives all invoices and payments for this client
 */
export async function archiveClient(
  workspaceId: string,
  clientId: string,
  cascade: boolean = false
): Promise<ActionResult> {
  try {
    const supabase = await supabaseServer();

    console.log("[archiveClient] updating public.clients", { workspaceId, clientId, cascade });

    // Step 1: Archive the client
    const { error: clientError, data } = await supabase
      .from("clients")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", clientId)
      .eq("workspace_id", workspaceId)
      .select("id")
      .single();

    if (clientError) {
      console.error("[archiveClient] client update failed", {
        code: clientError.code,
        message: clientError.message,
        details: clientError.details,
        hint: clientError.hint,
        relation: "clients",
        workspaceId,
        clientId,
      });
      return { ok: false, error: clientError.message };
    }

    // Step 2: Cascade to invoices and payments if requested
    if (cascade) {
      const now = new Date().toISOString();

      // Get all invoice IDs for this client
      const { data: invoices, error: invoicesError } = await supabase
        .from("invoices")
        .select("id")
        .eq("workspace_id", workspaceId)
        .eq("client_id", clientId);

      if (invoicesError) {
        console.error("[archiveClient] failed to fetch invoices for cascade", {
          error: invoicesError.message,
          workspaceId,
          clientId,
        });
        // Continue anyway - client is archived, cascade is optional
      } else {
        const invoiceIds = invoices?.map((inv) => inv.id) || [];

        // Archive all invoices for this client
        if (invoiceIds.length > 0) {
          const { error: invoicesUpdateError } = await supabase
            .from("invoices")
            .update({ archived_at: now })
            .eq("workspace_id", workspaceId)
            .eq("client_id", clientId);

          if (invoicesUpdateError) {
            console.error("[archiveClient] failed to cascade archive invoices", {
              error: invoicesUpdateError.message,
              workspaceId,
              clientId,
              invoiceCount: invoiceIds.length,
            });
            // Continue anyway - client is archived
          } else {
            console.log("[archiveClient] cascaded archive to invoices", {
              workspaceId,
              clientId,
              invoiceCount: invoiceIds.length,
            });
          }

          // Archive all payments for this client (via client_id) OR for these invoices (via invoice_id)
          // Payments can have both client_id and invoice_id, so we need to handle both
          let paymentsQuery = supabase
            .from("payments")
            .select("id")
            .eq("workspace_id", workspaceId);
          
          // Build OR condition: client_id = clientId OR invoice_id IN (invoiceIds)
          if (invoiceIds.length > 0) {
            paymentsQuery = paymentsQuery.or(`client_id.eq.${clientId},invoice_id.in.(${invoiceIds.join(",")})`);
          } else {
            paymentsQuery = paymentsQuery.eq("client_id", clientId);
          }
          
          const { data: paymentsToArchive, error: paymentsFetchError } = await paymentsQuery;

          if (paymentsFetchError) {
            console.error("[archiveClient] failed to fetch payments for cascade", {
              error: paymentsFetchError.message,
              workspaceId,
              clientId,
            });
          } else if (paymentsToArchive && paymentsToArchive.length > 0) {
            const paymentIds = paymentsToArchive.map((p) => p.id);
            const { error: paymentsUpdateError } = await supabase
              .from("payments")
              .update({ archived_at: now })
              .eq("workspace_id", workspaceId)
              .in("id", paymentIds);

            if (paymentsUpdateError) {
              console.error("[archiveClient] failed to cascade archive payments", {
                error: paymentsUpdateError.message,
                workspaceId,
                clientId,
              });
            } else {
              console.log("[archiveClient] cascaded archive to payments", {
                workspaceId,
                clientId,
                paymentCount: paymentIds.length,
              });
            }
          }
        }
      }
    }


    revalidatePath(`/${workspaceId}/clients`);
    revalidatePath(`/${workspaceId}/clients/${clientId}`);
    revalidatePath(`/${workspaceId}/invoices`);
    revalidatePath(`/${workspaceId}/payments`);
    return { ok: true };
  } catch (e) {
    const errorMsg = getErrorMessage(e);
    console.error("[archiveClient] exception", {
      error: errorMsg,
      workspaceId,
      clientId,
      cascade,
      exception: e,
    });
    return { ok: false, error: errorMsg };
  }
}

/**
 * Unarchive client: sets archived_at = null and is_active = true (safe default)
 * IMPORTANT: Updates ONLY the base table public.clients (not any view)
 * 
 * @param cascade - If true, also unarchives all invoices and payments for this client
 */
export async function unarchiveClient(
  workspaceId: string,
  clientId: string,
  cascade: boolean = false
): Promise<ActionResult> {
  try {
    const supabase = await supabaseServer();

    console.log("[unarchiveClient] updating public.clients", { workspaceId, clientId, cascade });

    // Step 1: Unarchive the client
    const { error: clientError, data } = await supabase
      .from("clients")
      .update({ 
        archived_at: null,
        is_active: true, // Ensure client is active when unarchived
      })
      .eq("id", clientId)
      .eq("workspace_id", workspaceId)
      .select("id")
      .single();

    if (clientError) {
      console.error("[unarchiveClient] client update failed", {
        code: clientError.code,
        message: clientError.message,
        details: clientError.details,
        hint: clientError.hint,
        relation: "clients",
        workspaceId,
        clientId,
      });
      return { ok: false, error: clientError.message };
    }

    // Step 2: Cascade to invoices and payments if requested
    if (cascade) {
      // Get all invoice IDs for this client
      const { data: invoices, error: invoicesError } = await supabase
        .from("invoices")
        .select("id")
        .eq("workspace_id", workspaceId)
        .eq("client_id", clientId);

      if (invoicesError) {
        console.error("[unarchiveClient] failed to fetch invoices for cascade", {
          error: invoicesError.message,
          workspaceId,
          clientId,
        });
        // Continue anyway - client is unarchived, cascade is optional
      } else {
        const invoiceIds = invoices?.map((inv) => inv.id) || [];

        // Unarchive all invoices for this client
        if (invoiceIds.length > 0) {
          const { error: invoicesUpdateError } = await supabase
            .from("invoices")
            .update({ archived_at: null })
            .eq("workspace_id", workspaceId)
            .eq("client_id", clientId);

          if (invoicesUpdateError) {
            console.error("[unarchiveClient] failed to cascade unarchive invoices", {
              error: invoicesUpdateError.message,
              workspaceId,
              clientId,
              invoiceCount: invoiceIds.length,
            });
            // Continue anyway - client is unarchived
          } else {
            console.log("[unarchiveClient] cascaded unarchive to invoices", {
              workspaceId,
              clientId,
              invoiceCount: invoiceIds.length,
            });
          }

          // Unarchive all payments for this client (via client_id) OR for these invoices (via invoice_id)
          // Payments can have both client_id and invoice_id, so we need to handle both
          let paymentsQuery = supabase
            .from("payments")
            .select("id")
            .eq("workspace_id", workspaceId);
          
          // Build OR condition: client_id = clientId OR invoice_id IN (invoiceIds)
          if (invoiceIds.length > 0) {
            paymentsQuery = paymentsQuery.or(`client_id.eq.${clientId},invoice_id.in.(${invoiceIds.join(",")})`);
          } else {
            paymentsQuery = paymentsQuery.eq("client_id", clientId);
          }
          
          const { data: paymentsToUnarchive, error: paymentsFetchError } = await paymentsQuery;

          if (paymentsFetchError) {
            console.error("[unarchiveClient] failed to fetch payments for cascade", {
              error: paymentsFetchError.message,
              workspaceId,
              clientId,
            });
          } else if (paymentsToUnarchive && paymentsToUnarchive.length > 0) {
            const paymentIds = paymentsToUnarchive.map((p) => p.id);
            const { error: paymentsUpdateError } = await supabase
              .from("payments")
              .update({ archived_at: null })
              .eq("workspace_id", workspaceId)
              .in("id", paymentIds);

            if (paymentsUpdateError) {
              console.error("[unarchiveClient] failed to cascade unarchive payments", {
                error: paymentsUpdateError.message,
                workspaceId,
                clientId,
              });
            } else {
              console.log("[unarchiveClient] cascaded unarchive to payments", {
                workspaceId,
                clientId,
                paymentCount: paymentIds.length,
              });
            }
          }
        }
      }
    }


    revalidatePath(`/${workspaceId}/clients`);
    revalidatePath(`/${workspaceId}/clients/${clientId}`);
    revalidatePath(`/${workspaceId}/invoices`);
    revalidatePath(`/${workspaceId}/payments`);
    return { ok: true };
  } catch (e) {
    const errorMsg = getErrorMessage(e);
    console.error("[unarchiveClient] exception", {
      error: errorMsg,
      workspaceId,
      clientId,
      cascade,
      exception: e,
    });
    return { ok: false, error: errorMsg };
  }
}
