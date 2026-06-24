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

  const parsed = PaymentFormSchema.parse(rawValues);
  const supabase = await supabaseServer();

  // 1) Query invoices table directly to check archived status (invoices_view excludes archived)
  const { data: invoiceRow, error: invoiceRowError } = await supabase
    .from("invoices")
    .select("id, archived_at, client_id")
    .eq("id", parsed.invoiceId)
    .eq("workspace_id", workspaceId)
    .single();

  // Validate: invoice exists and is not archived
  if (invoiceRowError || !invoiceRow) {
    const errorDetails = {
      message: invoiceRowError?.message || "Unknown error",
      code: invoiceRowError?.code || null,
      details: invoiceRowError?.details || null,
      hint: invoiceRowError?.hint || null,
    };
    console.error("[createPayment] failed to load invoice", errorDetails);
    return { 
      error: `Invoice not found: ${errorDetails.message}`,
      code: errorDetails.code,
      details: errorDetails.details,
      hint: errorDetails.hint,
    };
  }

  if (invoiceRow.archived_at) {
    return { error: "Cannot create payment for archived invoice" };
  }

  // 2) Query invoices_view for invoice validation (canonical contract)
  const { data: invoiceView, error: invoiceViewError } = await supabase
    .from("invoices_view")
    .select("id, workspace_id, client_id, currency, total, paid, outstanding, base_status, display_status")
    .eq("id", parsed.invoiceId)
    .eq("workspace_id", workspaceId)
    // Explicit filter (even if invoices_view excludes archived invoices at SQL layer)
    .is("archived_at", null)
    .single();

  // Validate: invoice exists in view (should exist since not archived)
  if (invoiceViewError || !invoiceView) {
    const errorDetails = {
      message: invoiceViewError?.message || "Unknown error",
      code: invoiceViewError?.code || null,
      details: invoiceViewError?.details || null,
      hint: invoiceViewError?.hint || null,
    };
    console.error("[createPayment] failed to load invoice from invoices_view", errorDetails);
    return { 
      error: `Invoice not found: ${errorDetails.message}`,
      code: errorDetails.code,
      details: errorDetails.details,
      hint: errorDetails.hint,
    };
  }

  // Validate: invoice.client_id === values.clientId
  if (invoiceView.client_id !== parsed.clientId) {
    return { error: "Selected invoice does not belong to selected client." };
  }

  // 3) Validate client eligibility (archived_at IS NULL, is_active = true)
  const { data: clientRow, error: clientRowError } = await supabase
    .from("clients")
    .select("id, archived_at, is_active")
    .eq("id", parsed.clientId)
    .eq("workspace_id", workspaceId)
    .single();

  if (clientRowError || !clientRow) {
    return { error: `Client not found: ${clientRowError?.message || "Unknown error"}` };
  }

  if (clientRow.archived_at) {
    return { error: "Cannot create payment for archived client" };
  }

  if (!clientRow.is_active) {
    return { error: "Cannot create payment for inactive client" };
  }

  // Validate: base_status === 'sent' (not void, not draft)
  if (invoiceView.base_status === "void") {
    return { error: "Cannot create payment for void invoice" };
  }

  if (invoiceView.base_status === "draft") {
    return { error: "Cannot create payment for draft invoice. Invoice must be sent first." };
  }

  // Validate: outstanding > 0
  const currentOutstanding = Number(invoiceView.outstanding ?? 0);
  if (currentOutstanding <= 0) {
    return { error: `Invoice has no outstanding balance (${currentOutstanding.toFixed(2)}). Cannot record payment.` };
  }

  // Validate payment amount against outstanding balance (overpayment guard)
  // When payment amount > outstanding: Reject with clear error message
  const paymentAmount = Number(parsed.amount);
  const tolerance = 0.01; // Allow small floating point differences

  if (paymentAmount > currentOutstanding + tolerance) {
    return { 
      error: `Payment amount (${paymentAmount.toFixed(2)}) exceeds the invoice outstanding balance (${currentOutstanding.toFixed(2)}). Please enter an amount less than or equal to ${currentOutstanding.toFixed(2)}.` 
    };
  }

  // 2) Get currency from invoices_view (canonical contract includes currency)
  const currency = invoiceView.currency || "USD";

  // 3) Insert payment, INCLUDING currency and payment_date
  const { data, error } = await supabase
    .from("payments")
    .insert({
      organization_id: organizationId,
      workspace_id: validatedWorkspaceId, // Use validated workspace_id
      client_id: parsed.clientId,
      invoice_id: parsed.invoiceId,
      amount: parsed.amount,
      payment_date: parsed.date, // Map form's 'date' to database's 'payment_date'
      method: parsed.method,
      status: parsed.status,
      transaction_id: parsed.transactionId ?? null,
      notes: parsed.notes ?? null,
      payment_provider: parsed.payment_provider || null,
      currency, // Set currency from invoices table (or default to USD)
    })
    .select("id")
    .single();

  if (error || !data) {
    const errorDetails = {
      message: error?.message || "Unknown error",
      code: error?.code || null,
      details: (error as { details?: string | null })?.details || null,
      hint: (error as { hint?: string | null })?.hint || null,
    };
    logPostgresUniqueViolation("createPayment", error, {
      workspaceId: validatedWorkspaceId,
      organizationId,
      invoiceId: parsed.invoiceId,
    });
    console.error("[createPayment] insert failed", errorDetails);
    return { 
      error: `Failed to create payment: ${errorDetails.message}`,
      code: errorDetails.code,
      details: errorDetails.details,
      hint: errorDetails.hint,
    };
  }

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

  // Revalidate pages after insert
  revalidatePath(`/${workspaceId}/invoices`); // Invoices page
  revalidatePath(`/${workspaceId}/invoices/${parsed.invoiceId}`); // Invoice details
  revalidatePath(`/${workspaceId}/payments`); // Payments list

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

  const parsed = PaymentFormSchema.parse(rawValues);
  const supabase = await supabaseServer();

  // 1) Get existing payment to know old amount, invoice_id, client_id, and workspace_id
  const { data: existingPayment, error: existingPaymentError } = await supabase
    .from("payments")
    .select("invoice_id, client_id, amount, status, workspace_id")
    .eq("id", paymentId)
    .eq("workspace_id", validatedWorkspaceId)
    .single();

  if (existingPaymentError || !existingPayment) {
    const errorDetails = {
      message: existingPaymentError?.message || "Unknown error",
      code: existingPaymentError?.code || null,
      details: (existingPaymentError as any)?.details || null,
      hint: (existingPaymentError as any)?.hint || null,
    };
    console.error("[updatePayment] failed to load existing payment:", errorDetails);
    return { error: `Payment not found: ${errorDetails.message}` };
  }

  // Financial integrity: Prevent changing client_id or invoice_id
  const oldClientId = existingPayment.client_id;
  const oldInvoiceId = existingPayment.invoice_id;
  const newClientId = parsed.clientId;
  const newInvoiceId = parsed.invoiceId;
  
  if (oldClientId && newClientId && oldClientId !== newClientId) {
    return { error: "Cannot change client for an existing payment" };
  }
  
  if (oldInvoiceId && newInvoiceId && oldInvoiceId !== newInvoiceId) {
    return { error: "Cannot change invoice for an existing payment" };
  }

  const oldAmount = Number(existingPayment.amount ?? 0);
  const newAmount = Number(parsed.amount);

  // 2) Use existing invoice_id (cannot be changed)
  const targetInvoiceId = oldInvoiceId;
  
  if (!targetInvoiceId) {
    return { error: "Invalid payment: missing invoice_id" };
  }

  // 3) Load invoice state for validation (canonical contract)
  // If invoice changed, we need to validate both old and new invoices
  // If only amount changed, validate against the same invoice
  const { data: invoiceView, error: invoiceViewError } = await supabase
    .from("invoices_view")
    .select("id, total, paid, outstanding")
    .eq("id", targetInvoiceId)
    .eq("workspace_id", workspaceId)
    // Explicit filter (even if invoices_view excludes archived invoices at SQL layer)
    .is("archived_at", null)
    .single();

  if (invoiceViewError || !invoiceView) {
    const errorDetails = {
      message: invoiceViewError?.message || "Unknown error",
      code: invoiceViewError?.code || null,
      details: (invoiceViewError as any)?.details || null,
      hint: (invoiceViewError as any)?.hint || null,
    };
    console.error("[updatePayment] failed to load invoice:", errorDetails);
    return { error: `Invoice not found: ${errorDetails.message}` };
  }

  // 4) Calculate what the new outstanding will be after this update
  // Only count payments with status "completed" (or null, which we treat as completed)
  // IMPORTANT: invoices_view is the source of truth for outstanding.
  // This logic must stay in sync with its definition (which excludes archived payments and
  // only counts completed/paid/null statuses in the paid sum).
  // Note: invoices_view.outstanding = total - paid, where paid includes all completed payments
  // Note: Database may have "paid" status, but form schema only allows "completed"
  const oldPaymentWasCompleted = 
    !existingPayment.status || 
    existingPayment.status === "completed" || 
    (existingPayment.status as string) === "paid"; // Database may have "paid" even if form doesn't
  
  const newPaymentWillBeCompleted = 
    !parsed.status || 
    parsed.status === "completed";

  // Current outstanding from the view (this already accounts for all completed payments)
  const currentOutstanding = Number(invoiceView.outstanding ?? 0);

  // Calculate effective change in total_paid:
  // - If old payment was completed: it's currently in total_paid, so removing it increases outstanding
  // - If new payment will be completed: it will be added to total_paid, so it decreases outstanding
  // Therefore: newOutstanding = currentOutstanding + oldAmount (if completed) - newAmount (if will be completed)
  let effectiveDelta = 0;
  if (oldPaymentWasCompleted) {
    effectiveDelta -= oldAmount; // Removing from total_paid increases outstanding
  }
  if (newPaymentWillBeCompleted) {
    effectiveDelta += newAmount; // Adding to total_paid decreases outstanding
  }

  // Calculate new outstanding after update
  // effectiveDelta is negative when we're reducing total_paid (increasing outstanding)
  // effectiveDelta is positive when we're increasing total_paid (decreasing outstanding)
  const newOutstanding = currentOutstanding - effectiveDelta;

  // 5) Validate: new outstanding cannot be negative
  if (newOutstanding < 0) {
    const currentOutstandingFormatted = currentOutstanding.toFixed(2);
    const amountChange = effectiveDelta > 0 ? `+${effectiveDelta.toFixed(2)}` : effectiveDelta.toFixed(2);
    return { 
      error: `Updating this payment would result in overpayment. Current outstanding: ${currentOutstandingFormatted}, payment change: ${amountChange}.` 
    };
  }

  // 6) Invoice cannot be changed (already validated above), so skip new invoice validation

  // 6) Perform the update (only safe fields - client_id and invoice_id cannot be changed)
  const { error } = await supabase
    .from("payments")
    .update({
      // Do NOT update client_id or invoice_id (financial integrity)
      amount: parsed.amount,
      payment_date: parsed.date, // Map form's 'date' to database's 'payment_date'
      method: parsed.method,
      status: parsed.status,
      transaction_id: parsed.transactionId ?? null,
      notes: parsed.notes ?? null,
      payment_provider: parsed.payment_provider || null,
    })
    .eq("id", paymentId)
    .eq("workspace_id", validatedWorkspaceId);

  if (error) {
    const errorDetails = {
      message: error?.message || "Unknown error",
      code: error?.code || null,
      details: (error as any)?.details || null,
      hint: (error as any)?.hint || null,
    };
    console.error("[updatePayment] update failed:", errorDetails);
    return { error: `Failed to update payment: ${errorDetails.message}` };
  }

  // REMOVED: recalculateInvoiceState call
  // invoices_view computes paid/outstanding automatically from payments

  // 7) Log audit event with user.id and workspace_id
  // Use workspaceId param (guaranteed valid after requireWorkspace validation) - never use optional fields
  // Audit log failure must never break payment update (logAuditEvent is non-blocking)
  await logAuditEvent({
    workspaceId,
    userId: user.id,
    entityType: "payment",
    entityId: paymentId,
    action: "updated",
    metadata: {
      invoice_id: oldInvoiceId, // Use existing invoice_id (cannot be changed)
      amount: parsed.amount,
      method: parsed.method,
      status: parsed.status,
      payment_date: parsed.date,
      invoice_changed: false, // Invoice cannot be changed
    },
  });

  revalidatePath(`/${workspaceId}/payments`);
  revalidatePath(`/${workspaceId}/payments/${paymentId}`);
  revalidatePath(`/${workspaceId}/invoices`);
  if (oldInvoiceId) {
    revalidatePath(`/${workspaceId}/invoices/${oldInvoiceId}`);
  }
  return { success: true };
}

export async function deletePayment(workspaceId: string, paymentId: string) {
  // Get user for audit logging
  const { user } = await requireUser();

  const supabase = await supabaseServer();

  // Get payment details before archiving (to recalculate state and for audit log)
  const { data: existingPayment } = await supabase
    .from("payments")
    .select("invoice_id, amount")
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

  revalidatePath(`/${workspaceId}/payments`);
  revalidatePath(`/${workspaceId}/invoices`);
  if (existingPayment?.invoice_id) {
    revalidatePath(`/${workspaceId}/invoices/${existingPayment.invoice_id}`);
  }
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
  const supabase = await supabaseServer();

  // Step 1: Fetch existing row to check state and get invoice_id
  const { data: existing, error: fetchError } = await supabase
    .from("payments")
    .select("id, workspace_id, invoice_id, archived_at")
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

  // Step 6: Revalidate paths
  revalidatePath(`/${workspaceId}/payments`);
  if (existing.invoice_id) {
    revalidatePath(`/${workspaceId}/invoices/${existing.invoice_id}`);
    revalidatePath(`/${workspaceId}/invoices`);
  }
}

/**
 * Unarchive payment: sets archived_at = null
 * Idempotent: returns success if already unarchived
 */
export async function unarchivePayment(workspaceId: string, paymentId: string) {
  const { user } = await requireUser();
  const supabase = await supabaseServer();

  // Step 1: Fetch existing row to check state and get invoice_id
  const { data: existing, error: fetchError } = await supabase
    .from("payments")
    .select("id, workspace_id, invoice_id, archived_at")
    .eq("id", paymentId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (fetchError) {
    console.error("[unarchivePayment] fetch failed", {
      code: fetchError.code,
      message: fetchError.message,
      workspaceId,
      paymentId,
    });
    throw new Error(`Failed to fetch payment: ${fetchError.message}`);
  }

  if (!existing) {
    console.error("[unarchivePayment] payment not found", { workspaceId, paymentId });
    throw new Error("Payment not found");
  }

  // Step 2: Check if already unarchived (idempotent)
  if (!existing.archived_at) {
    // Already unarchived - return success without updating
    return { ok: true, alreadyUnarchived: true, invoiceId: existing.invoice_id || null };
  }

  // Step 3: Update archived_at = null (filter by BOTH id AND workspace_id, use select to verify update)
  const { error: updateError, data: updatedPayments } = await supabase
    .from("payments")
    .update({ archived_at: null })
    .eq("id", paymentId)
    .eq("workspace_id", workspaceId)
    .not("archived_at", "is", null)
    .select("id, invoice_id");

  if (updateError) {
    console.error("[unarchivePayment] update failed", {
      code: updateError.code,
      message: updateError.message,
      workspaceId,
      paymentId,
    });
    throw new Error(`Failed to unarchive payment: ${updateError.message}`);
  }

  // Check if update affected exactly one row (should always be 1 for single ID update)
  if (!updatedPayments || updatedPayments.length === 0) {
    // No rows updated - payment was already unarchived (race condition) or doesn't exist in workspace
    // Since we already checked it exists and is archived, this is a race condition - treat as idempotent
    return { ok: true, alreadyUnarchived: true, invoiceId: existing.invoice_id || null };
  }

  // If more than 1 row updated (shouldn't happen with single ID), log warning but proceed
  if (updatedPayments.length > 1) {
    console.warn("[unarchivePayment] update affected multiple rows (unexpected)", {
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
      console.error("[unarchivePayment] invoice recalculation failed (non-blocking):", recalcError);
    }
  }

  // Step 5: Log audit event (non-blocking)
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

  // Step 6: Revalidate paths
  revalidatePath(`/${workspaceId}/payments`);
  if (existing.invoice_id) {
    revalidatePath(`/${workspaceId}/invoices/${existing.invoice_id}`);
    revalidatePath(`/${workspaceId}/invoices`);
  }
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

  // Step 5: Revalidate paths
  revalidatePath(`/${workspaceId}/payments`);
  revalidatePath(`/${workspaceId}/invoices`);
  invoiceIds.forEach((invoiceId) => {
    revalidatePath(`/${workspaceId}/invoices/${invoiceId}`);
  });

  return { ok: true, count: updatedPayments.length };
}

/**
 * Bulk unarchive payments: sets archived_at = null for multiple payments
 * Workspace-scoped and id-scoped (eq workspace_id + in ids)
 * Idempotent: skips already unarchived payments via .not("archived_at", "is", null) filter
 * 
 * Financial integrity: Recalculates invoice states for affected invoices
 */
export async function bulkUnarchivePayments(workspaceId: string, paymentIds: string[]) {
  const { user } = await requireUser();
  const supabase = await supabaseServer();

  if (paymentIds.length === 0) {
    return { ok: false, message: "No payments selected" };
  }

  // Step 1: Fetch existing payments to get invoice_ids before unarchiving
  const { data: existingPayments, error: fetchError } = await supabase
    .from("payments")
    .select("id, invoice_id")
    .eq("workspace_id", workspaceId)
    .in("id", paymentIds)
    .not("archived_at", "is", null);

  if (fetchError) {
    console.error("[bulkUnarchivePayments] fetch failed", {
      code: fetchError.code,
      message: fetchError.message,
      workspaceId,
      paymentIds,
    });
    return { ok: false, message: `Failed to fetch payments: ${fetchError.message}` };
  }

  if (!existingPayments || existingPayments.length === 0) {
    // All payments are already unarchived or don't exist - idempotent success
    return { ok: true, count: 0, message: "No payments to unarchive" };
  }

  const idsToUnarchive = existingPayments.map((p) => p.id);

  // Step 2: Update archived_at = null (using select array is safe, no single() here)
  const { error: updateError, data: updatedPayments } = await supabase
    .from("payments")
    .update({ archived_at: null })
    .eq("workspace_id", workspaceId)
    .in("id", idsToUnarchive)
    .not("archived_at", "is", null)
    .select("id, invoice_id");

  if (updateError) {
    console.error("[bulkUnarchivePayments] update failed", {
      code: updateError.code,
      message: updateError.message,
      workspaceId,
      paymentIds: idsToUnarchive,
    });
    return { ok: false, message: `Failed to unarchive payments: ${updateError.message}` };
  }

  if (!updatedPayments || updatedPayments.length === 0) {
    // Race condition: payments were unarchived between fetch and update - idempotent success
    return { ok: true, count: 0, message: "No payments updated" };
  }

  // Step 3: Recalculate invoice states for affected invoices (financial integrity)
  const invoiceIds = Array.from(new Set(updatedPayments.map((p) => p.invoice_id).filter(Boolean) as string[]));
  try {
    await Promise.all(invoiceIds.map((invoiceId) => recalculateInvoiceState(invoiceId)));
  } catch (recalcError) {
    console.error("[bulkUnarchivePayments] invoice recalculation failed (non-blocking):", recalcError);
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
          action: "unarchived",
        })
      )
    );
  } catch (auditError) {
    console.error("[bulkUnarchivePayments] audit log failed (non-blocking):", auditError);
  }

  // Step 5: Revalidate paths
  revalidatePath(`/${workspaceId}/payments`);
  revalidatePath(`/${workspaceId}/invoices`);
  invoiceIds.forEach((invoiceId) => {
    revalidatePath(`/${workspaceId}/invoices/${invoiceId}`);
  });

  return { ok: true, count: updatedPayments.length };
}
