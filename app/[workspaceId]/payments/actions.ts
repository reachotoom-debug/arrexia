"use server";

/**
 * Server actions for payments (create/update).
 */

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";
import { requireUser, requireWorkspace } from "@/lib/auth/server";
import {
  PaymentFormSchema,
  type PaymentFormValues,
} from "@/lib/payments/schema";
import { logAuditEvent } from "@/lib/audit/log";
import { logPostgresUniqueViolation } from "@/lib/db/postgres-errors";
import { assertWorkspaceMutationAllowed } from "@/lib/billing/entitlementGuard";
import { EntitlementError } from "@/lib/billing/entitlementErrors";
import { revalidateFinancialSurfacesAfterPayment } from "@/lib/payments/revalidateFinancialSurfaces";
import {
  mapCreatePaymentRpcError,
  mapUpdatePaymentRpcError,
  mapUnarchivePaymentRpcError,
} from "@/lib/payments/mapCreatePaymentRpcError";

/**
 * Server action to load eligible invoices for a specific client (for payment recording)
 * Only returns invoices with outstanding > 0 and allowed statuses
 */
export async function getInvoicesForPaymentClient(opts: {
  workspaceId: string;
  clientId: string;
}) {
  const { workspaceId, clientId } = opts;

  const start = performance.now();

  await requireWorkspace(workspaceId);

  const supabase = await supabaseServer();

  // Eligibility: clients must be active AND not archived.
  // Record Payment must never offer invoices for inactive/archived clients.
  const { data: client, error: clientError } = await supabase
    .from("clients")
    .select("id, is_active, archived_at")
    .eq("workspace_id", workspaceId)
    .eq("id", clientId)
    .maybeSingle();

  if (clientError) {
    console.error("[getInvoicesForPaymentClient] client load error:", clientError.message);
    throw new Error("Failed to load client");
  }

  if (!client || client.archived_at || client.is_active === false) {
    // Not eligible → return empty list (avoid leaking invoices in dropdown)
    return [];
  }

  const { data, error } = await supabase
    .from("invoices_view")
    // IMPORTANT: invoices_view is the single source of truth for outstanding/paid amounts.
    .select("id, workspace_id, client_id, client_name, invoice_number, issue_date, due_date, total, paid, outstanding, base_status, display_status, currency, archived_at")
    .eq("workspace_id", workspaceId)
    .eq("client_id", clientId)
    // Explicit filter (even if invoices_view excludes archived invoices at SQL layer)
    .is("archived_at", null)
    .gt("outstanding", 0)
    .in("display_status", ["sent", "overdue", "partially_paid"])
    .order("issue_date", { ascending: false });

  if (error) {
    console.error("[getInvoicesForPaymentClient] error:", error.message);
    if (process.env.NODE_ENV !== "production") {
      const duration = performance.now() - start;
      console.log(`[getInvoicesForPaymentClient] (error): ${duration.toFixed(1)}ms`);
    }
    throw new Error("Failed to load invoices for client");
  }

  // Map to PaymentForm invoice format
  const invoices = (data ?? []).map((inv) => ({
    id: inv.id,
    client_id: inv.client_id ?? null,
    invoice_number: inv.invoice_number ?? "",
    status: inv.display_status ?? "sent",
    outstanding_amount: Number(inv.outstanding ?? 0),
    currency: inv.currency || "USD",
  }));

  if (process.env.NODE_ENV !== "production") {
    const duration = performance.now() - start;
    console.log(`[getInvoicesForPaymentClient]: ${duration.toFixed(1)}ms`);
  }

  return invoices;
}

/**
 * Helper function to recalculate and update invoice derived state
 */
async function recalculateInvoiceState(invoiceId: string) {
  // No-op by design:
  // paid/outstanding/display status are derived in invoices_view.
  // Keep this function for call-site compatibility only.
  void invoiceId;
}

async function getPaymentMutationEntitlementBlock(workspaceId: string): Promise<{
  error: string;
  code: EntitlementError["code"];
} | null> {
  try {
    await assertWorkspaceMutationAllowed(workspaceId, "payment_mutation");
    return null;
  } catch (error) {
    if (error instanceof EntitlementError) {
      return { error: error.message, code: error.code };
    }
    throw error;
  }
}

type RestorePaymentRpcSuccess = {
  ok: true;
  paymentId: string;
  alreadyUnarchived: boolean;
  invoiceId: string | null;
  clientId: string | null;
};

type RestorePaymentRpcFailure = {
  ok: false;
  error: string;
  code?: string;
};

async function restorePaymentViaRpc(
  supabase: Awaited<ReturnType<typeof supabaseServer>>,
  workspaceId: string,
  paymentId: string
): Promise<RestorePaymentRpcSuccess | RestorePaymentRpcFailure> {
  const { data, error } = await supabase.rpc("rpc_unarchive_payment_manual", {
    p_workspace_id: workspaceId,
    p_payment_id: paymentId,
  });

  if (error) {
    console.error("[restorePaymentViaRpc] rpc_unarchive_payment_manual failed:", {
      workspaceId,
      paymentId,
      code: error.code,
      message: error.message,
    });
    const mapped = mapUnarchivePaymentRpcError(error);
    return { ok: false, error: mapped.error, code: mapped.code };
  }

  const payload = data as {
    payment_id?: string;
    already_unarchived?: boolean;
    invoice_id?: string | null;
    client_id?: string | null;
  } | null;

  if (!payload?.payment_id) {
    return { ok: false, error: "Failed to restore payment: missing payment_id from RPC" };
  }

  return {
    ok: true,
    paymentId: payload.payment_id,
    alreadyUnarchived: payload.already_unarchived === true,
    invoiceId: payload.invoice_id ?? null,
    clientId: payload.client_id ?? null,
  };
}

export async function createPayment(
  workspaceId: string,
  rawValues: PaymentFormValues
) {
  // Validate user and workspace access at the start
  const { user } = await requireUser();
  const { workspace } = await requireWorkspace(workspaceId);
  const validatedWorkspaceId = workspace.id;
  const organizationId = workspace.organization_id;

  // Guard: workspace_id must be present
  if (!validatedWorkspaceId) {
    return { error: "workspace_id is required" };
  }

  const entitlementBlock = await getPaymentMutationEntitlementBlock(workspaceId);
  if (entitlementBlock) {
    return { error: entitlementBlock.error, code: entitlementBlock.code };
  }

  const parsed = PaymentFormSchema.parse(rawValues);
  const supabase = await supabaseServer();

  const { data: rpcData, error: rpcError } = await supabase.rpc("rpc_create_payment_manual", {
    p_workspace_id: validatedWorkspaceId,
    p_client_id: parsed.clientId,
    p_invoice_id: parsed.invoiceId,
    p_amount: parsed.amount,
    p_payment_date: parsed.date,
    p_method: parsed.method,
    p_status: parsed.status,
    p_transaction_id: parsed.transactionId ?? null,
    p_notes: parsed.notes ?? null,
    p_payment_provider: parsed.payment_provider || null,
  });

  if (rpcError) {
    logPostgresUniqueViolation("createPayment", rpcError, {
      workspaceId: validatedWorkspaceId,
      organizationId,
      invoiceId: parsed.invoiceId,
    });
    console.error("[createPayment] rpc_create_payment_manual failed:", rpcError);
    return mapCreatePaymentRpcError(rpcError);
  }

  const paymentId = (rpcData as { payment_id?: string } | null)?.payment_id;
  if (!paymentId) {
    return { error: "Failed to create payment: missing payment_id from RPC" };
  }

  const data = { id: paymentId };

  // REMOVED: recalculateInvoiceState call
  // invoices_view computes paid/outstanding automatically from payments

  // 4) Log audit event with user.id and workspace_id
  // Audit log failure must never break payment creation
  try {
    await logAuditEvent({
      workspaceId,
      userId: user.id,
      entityType: "payment",
      entityId: data.id,
      action: "created",
      metadata: {
        invoice_id: parsed.invoiceId,
        amount: parsed.amount,
        method: parsed.method,
        status: parsed.status,
        payment_date: parsed.date,
      },
    });
  } catch (auditError) {
    // Log but don't fail - audit logging should never break payment creation
    console.error("[createPayment] audit log failed (non-blocking):", auditError);
  }

  revalidateFinancialSurfacesAfterPayment(workspaceId, revalidatePath, {
    invoiceId: parsed.invoiceId,
    clientId: parsed.clientId,
  });

  return { id: data.id };
}

export async function updatePayment(
  workspaceId: string,
  paymentId: string,
  rawValues: PaymentFormValues
) {
  // Validate user and workspace access at the start
  const { user } = await requireUser();
  const { workspace } = await requireWorkspace(workspaceId);
  const validatedWorkspaceId = workspace.id;

  // Guard: workspace_id must be present
  if (!validatedWorkspaceId) {
    return { error: "workspace_id is required" };
  }

  const entitlementBlock = await getPaymentMutationEntitlementBlock(workspaceId);
  if (entitlementBlock) {
    return { error: entitlementBlock.error, code: entitlementBlock.code };
  }

  const parsed = PaymentFormSchema.parse(rawValues);
  const supabase = await supabaseServer();

  const { data: rpcData, error: rpcError } = await supabase.rpc("rpc_update_payment_manual", {
    p_workspace_id: validatedWorkspaceId,
    p_payment_id: paymentId,
    p_client_id: parsed.clientId,
    p_invoice_id: parsed.invoiceId,
    p_amount: parsed.amount,
    p_payment_date: parsed.date,
    p_method: parsed.method,
    p_status: parsed.status,
    p_transaction_id: parsed.transactionId ?? null,
    p_notes: parsed.notes ?? null,
    p_payment_provider: parsed.payment_provider || null,
  });

  if (rpcError) {
    logPostgresUniqueViolation("updatePayment", rpcError, {
      workspaceId: validatedWorkspaceId,
      paymentId,
      invoiceId: parsed.invoiceId,
    });
    console.error("[updatePayment] rpc_update_payment_manual failed:", rpcError);
    return mapUpdatePaymentRpcError(rpcError);
  }

  const updatedPaymentId = (rpcData as { payment_id?: string } | null)?.payment_id;
  if (!updatedPaymentId) {
    return { error: "Failed to update payment: missing payment_id from RPC" };
  }

  // Audit log failure must never break payment update (logAuditEvent is non-blocking)
  await logAuditEvent({
    workspaceId,
    userId: user.id,
    entityType: "payment",
    entityId: paymentId,
    action: "updated",
    metadata: {
      invoice_id: parsed.invoiceId,
      amount: parsed.amount,
      method: parsed.method,
      status: parsed.status,
      payment_date: parsed.date,
      invoice_changed: false,
    },
  });

  revalidateFinancialSurfacesAfterPayment(workspaceId, revalidatePath, {
    invoiceId: parsed.invoiceId,
    clientId: parsed.clientId,
    paymentId,
  });
  return { success: true };
}

export async function deletePayment(workspaceId: string, paymentId: string) {
  const { user } = await requireUser();
  await requireWorkspace(workspaceId);

  const entitlementBlock = await getPaymentMutationEntitlementBlock(workspaceId);
  if (entitlementBlock) {
    throw new Error(entitlementBlock.error);
  }

  const supabase = await supabaseServer();

  // Get payment details before archiving (to recalculate state and for audit log)
  const { data: existingPayment } = await supabase
    .from("payments")
    .select("invoice_id, client_id, amount")
    .eq("id", paymentId)
    .eq("workspace_id", workspaceId)
    .is("archived_at", null)
    .single();

  if (!existingPayment) {
    throw new Error("Payment not found or already archived");
  }

  // Archive payment instead of delete
  const { error } = await supabase
    .from("payments")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", paymentId)
    .eq("workspace_id", workspaceId);

  if (error) {
    const errorDetails = {
      message: error?.message || "Unknown error",
      code: error?.code || null,
      details: (error as any)?.details || null,
      hint: (error as any)?.hint || null,
    };
    console.error("[deletePayment] archive failed:", errorDetails);
    throw new Error(`Failed to archive payment: ${errorDetails.message}`);
  }

  // Recalculate invoice state after payment is archived
  if (existingPayment.invoice_id) {
    await recalculateInvoiceState(existingPayment.invoice_id);
  }

  // Log audit event
  await logAuditEvent({
    workspaceId,
    userId: user.id,
    entityType: "payment",
    entityId: paymentId,
    action: "archived",
    metadata: {
      invoice_id: existingPayment?.invoice_id,
      amount: existingPayment?.amount,
    },
  });

  revalidateFinancialSurfacesAfterPayment(workspaceId, revalidatePath, {
    invoiceId: existingPayment?.invoice_id,
    clientId: existingPayment?.client_id,
    paymentId,
  });
}

/**
 * Archive payment: sets archived_at = now()
 */
/**
 * Archive payment: sets archived_at = now()
 * Idempotent: returns success if already archived
 */
export async function archivePayment(workspaceId: string, paymentId: string) {
  const { user } = await requireUser();
  await requireWorkspace(workspaceId);

  const entitlementBlock = await getPaymentMutationEntitlementBlock(workspaceId);
  if (entitlementBlock) {
    throw new Error(entitlementBlock.error);
  }

  const supabase = await supabaseServer();

  // Step 1: Fetch existing row to check state and get invoice_id
  const { data: existing, error: fetchError } = await supabase
    .from("payments")
    .select("id, workspace_id, invoice_id, client_id, archived_at")
    .eq("id", paymentId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (fetchError) {
    console.error("[archivePayment] fetch failed", {
      code: fetchError.code,
      message: fetchError.message,
      workspaceId,
      paymentId,
    });
    throw new Error(`Failed to fetch payment: ${fetchError.message}`);
  }

  if (!existing) {
    console.error("[archivePayment] payment not found", { workspaceId, paymentId });
    throw new Error("Payment not found");
  }

  // Step 2: Check if already archived (idempotent)
  if (existing.archived_at) {
    // Already archived - return success without updating
    return { ok: true, alreadyArchived: true, invoiceId: existing.invoice_id || null };
  }

  // Step 3: Update archived_at (filter by BOTH id AND workspace_id, use select to verify update)
  const { error: updateError, data: updatedPayments } = await supabase
    .from("payments")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", paymentId)
    .eq("workspace_id", workspaceId)
    .is("archived_at", null)
    .select("id, invoice_id");

  if (updateError) {
    console.error("[archivePayment] update failed", {
      code: updateError.code,
      message: updateError.message,
      workspaceId,
      paymentId,
    });
    throw new Error(`Failed to archive payment: ${updateError.message}`);
  }

  // Check if update affected exactly one row (should always be 1 for single ID update)
  if (!updatedPayments || updatedPayments.length === 0) {
    // No rows updated - payment was already archived (race condition) or doesn't exist in workspace
    // Since we already checked it exists and is not archived, this is a race condition - treat as idempotent
    return { ok: true, alreadyArchived: true, invoiceId: existing.invoice_id || null };
  }

  // If more than 1 row updated (shouldn't happen with single ID), log warning but proceed
  if (updatedPayments.length > 1) {
    console.warn("[archivePayment] update affected multiple rows (unexpected)", {
      workspaceId,
      paymentId,
      count: updatedPayments.length,
    });
  }

  // Step 4: Recalculate invoice state if payment was linked to an invoice
  if (existing.invoice_id) {
    try {
      await recalculateInvoiceState(existing.invoice_id);
    } catch (recalcError) {
      console.error("[archivePayment] invoice recalculation failed (non-blocking):", recalcError);
    }
  }

  // Step 5: Log audit event (non-blocking)
  try {
    await logAuditEvent({
      workspaceId,
      userId: user.id,
      entityType: "payment",
      entityId: paymentId,
      action: "archived",
    });
  } catch (auditError) {
    console.error("[archivePayment] audit log failed (non-blocking):", auditError);
  }

  revalidateFinancialSurfacesAfterPayment(workspaceId, revalidatePath, {
    invoiceId: existing.invoice_id,
    clientId: existing.client_id,
    paymentId,
  });
}

/**
 * Unarchive payment: sets archived_at = null
 * Idempotent: returns success if already unarchived
 */
export async function unarchivePayment(workspaceId: string, paymentId: string) {
  const { user } = await requireUser();
  await requireWorkspace(workspaceId);

  const entitlementBlock = await getPaymentMutationEntitlementBlock(workspaceId);
  if (entitlementBlock) {
    throw new Error(entitlementBlock.error);
  }

  const supabase = await supabaseServer();
  const restoreResult = await restorePaymentViaRpc(supabase, workspaceId, paymentId);

  if (!restoreResult.ok) {
    throw new Error(restoreResult.error);
  }

  if (restoreResult.alreadyUnarchived) {
    return {
      ok: true,
      alreadyUnarchived: true,
      invoiceId: restoreResult.invoiceId,
    };
  }

  try {
    await logAuditEvent({
      workspaceId,
      userId: user.id,
      entityType: "payment",
      entityId: paymentId,
      action: "unarchived",
    });
  } catch (auditError) {
    console.error("[unarchivePayment] audit log failed (non-blocking):", auditError);
  }

  revalidateFinancialSurfacesAfterPayment(workspaceId, revalidatePath, {
    invoiceId: restoreResult.invoiceId,
    clientId: restoreResult.clientId,
    paymentId,
  });
}

/**
 * Bulk archive payments: sets archived_at = now() for multiple payments
 * Workspace-scoped and id-scoped (eq workspace_id + in ids)
 * Idempotent: skips already archived payments
 * 
 * Financial integrity: Recalculates invoice states for affected invoices
 */
export async function bulkArchivePayments(workspaceId: string, paymentIds: string[]) {
  const { user } = await requireUser();
  await requireWorkspace(workspaceId);

  const entitlementBlock = await getPaymentMutationEntitlementBlock(workspaceId);
  if (entitlementBlock) {
    return { ok: false, message: entitlementBlock.error };
  }

  const supabase = await supabaseServer();

  if (paymentIds.length === 0) {
    return { ok: false, message: "No payments selected" };
  }

  // Step 1: Fetch existing payments to get invoice_ids before archiving
  const { data: existingPayments, error: fetchError } = await supabase
    .from("payments")
    .select("id, invoice_id")
    .eq("workspace_id", workspaceId)
    .in("id", paymentIds)
    .is("archived_at", null);

  if (fetchError) {
    console.error("[bulkArchivePayments] fetch failed", {
      code: fetchError.code,
      message: fetchError.message,
      workspaceId,
      paymentIds,
    });
    return { ok: false, message: `Failed to fetch payments: ${fetchError.message}` };
  }

  if (!existingPayments || existingPayments.length === 0) {
    // All payments are already archived or don't exist - idempotent success
    return { ok: true, count: 0, message: "No payments to archive" };
  }

  const idsToArchive = existingPayments.map((p) => p.id);

  // Step 2: Update archived_at (using select array is safe, no single() here)
  const { error: updateError, data: updatedPayments } = await supabase
    .from("payments")
    .update({ archived_at: new Date().toISOString() })
    .eq("workspace_id", workspaceId)
    .in("id", idsToArchive)
    .is("archived_at", null)
    .select("id, invoice_id");

  if (updateError) {
    console.error("[bulkArchivePayments] update failed", {
      code: updateError.code,
      message: updateError.message,
      workspaceId,
      paymentIds: idsToArchive,
    });
    return { ok: false, message: `Failed to archive payments: ${updateError.message}` };
  }

  if (!updatedPayments || updatedPayments.length === 0) {
    // Race condition: payments were archived between fetch and update - idempotent success
    return { ok: true, count: 0, message: "No payments updated" };
  }

  // Step 3: Recalculate invoice states for affected invoices (financial integrity)
  const invoiceIds = Array.from(new Set(updatedPayments.map((p) => p.invoice_id).filter(Boolean) as string[]));
  try {
    await Promise.all(invoiceIds.map((invoiceId) => recalculateInvoiceState(invoiceId)));
  } catch (recalcError) {
    console.error("[bulkArchivePayments] invoice recalculation failed (non-blocking):", recalcError);
  }

  // Step 4: Log audit events for each payment (non-blocking)
  try {
    await Promise.all(
      updatedPayments.map((p) =>
        logAuditEvent({
          workspaceId,
          userId: user.id,
          entityType: "payment",
          entityId: p.id,
          action: "archived",
        })
      )
    );
  } catch (auditError) {
    console.error("[bulkArchivePayments] audit log failed (non-blocking):", auditError);
  }

  revalidateFinancialSurfacesAfterPayment(workspaceId, revalidatePath);
  invoiceIds.forEach((invoiceId) => {
    revalidatePath(`/${workspaceId}/invoices/${invoiceId}`);
  });

  return { ok: true, count: updatedPayments.length };
}

/**
 * Bulk unarchive payments via atomic restore RPC (one payment per transaction).
 * Successful restores remain committed; failures return a clean message without rollback.
 */
export async function bulkUnarchivePayments(workspaceId: string, paymentIds: string[]) {
  const { user } = await requireUser();
  await requireWorkspace(workspaceId);

  const entitlementBlock = await getPaymentMutationEntitlementBlock(workspaceId);
  if (entitlementBlock) {
    return { ok: false, message: entitlementBlock.error };
  }

  const supabase = await supabaseServer();

  if (paymentIds.length === 0) {
    return { ok: false, message: "No payments selected" };
  }

  const sortedPaymentIds = [...paymentIds].sort();
  let restoredCount = 0;
  let firstError: string | null = null;
  const invoiceIds = new Set<string>();

  for (const paymentId of sortedPaymentIds) {
    const restoreResult = await restorePaymentViaRpc(supabase, workspaceId, paymentId);

    if (!restoreResult.ok) {
      if (!firstError) {
        firstError = restoreResult.error;
      }
      continue;
    }

    if (restoreResult.alreadyUnarchived) {
      continue;
    }

    restoredCount += 1;
    if (restoreResult.invoiceId) {
      invoiceIds.add(restoreResult.invoiceId);
    }

    try {
      await logAuditEvent({
        workspaceId,
        userId: user.id,
        entityType: "payment",
        entityId: paymentId,
        action: "unarchived",
      });
    } catch (auditError) {
      console.error("[bulkUnarchivePayments] audit log failed (non-blocking):", auditError);
    }
  }

  if (restoredCount === 0) {
    if (firstError) {
      return { ok: false, message: firstError };
    }
    return { ok: true, count: 0, message: "No payments to unarchive" };
  }

  revalidateFinancialSurfacesAfterPayment(workspaceId, revalidatePath);
  invoiceIds.forEach((invoiceId) => {
    revalidatePath(`/${workspaceId}/invoices/${invoiceId}`);
  });

  if (firstError) {
    return {
      ok: true,
      count: restoredCount,
      message: `${restoredCount} payment${restoredCount !== 1 ? "s" : ""} restored. Some restores failed: ${firstError}`,
    };
  }

  return { ok: true, count: restoredCount };
}
