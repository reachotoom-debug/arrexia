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
import { deriveInvoiceState } from "@/lib/invoices/deriveState";
import { logAuditEvent } from "@/lib/audit/log";

const ORGANIZATION_ID = "05d2d292-d95b-44f4-b774-22f10068124f";

/**
 * Type for invoice money fields used in payment validation
 */
type InvoiceMoney = {
  id: string;
  amount: number;
  total_paid: number;
  outstanding: number;
};

/**
 * Helper function to recalculate and update invoice derived state
 */
async function recalculateInvoiceState(invoiceId: string) {
  const supabase = await supabaseServer();

  // 1) Get the invoice row
  const { data: invoice, error: invoiceError } = await supabase
    .from("invoices")
    .select("id, status, amount, issue_date, due_date")
    .eq("id", invoiceId)
    .single();

  if (invoiceError || !invoice) {
    const errorDetails = {
      message: invoiceError?.message || "Unknown error",
      code: invoiceError?.code || null,
      details: (invoiceError as any)?.details || null,
      hint: (invoiceError as any)?.hint || null,
    };
    console.error("[recalculateInvoiceState] failed to load invoice:", errorDetails);
    return;
  }

  // 2) Get all payments for that invoice
  const { data: payments, error: paymentsError } = await supabase
    .from("payments")
    .select("amount, status")
    .eq("invoice_id", invoiceId);

  if (paymentsError) {
    const errorDetails = {
      message: paymentsError?.message || "Unknown error",
      code: paymentsError?.code || null,
      details: (paymentsError as any)?.details || null,
      hint: (paymentsError as any)?.hint || null,
    };
    console.error("[recalculateInvoiceState] failed to load payments:", errorDetails);
    return;
  }

  // 3) Derive numeric state (status is computed by invoices_view.display_status in SQL)
  const derived = deriveInvoiceState({
    status: invoice.status as "draft" | "sent" | "void",
    amount: Number(invoice.amount || 0),
    payments: payments ?? [],
  });

  // 4) Update invoice numeric fields
  // NOTE: Status is NOT stored here - it's computed by invoices_view.display_status
  // We only update numeric fields that affect the status calculation
  const { error: updateError } = await supabase
    .from("invoices")
    .update({
      total_paid: derived.totalPaid,
      outstanding_amount: derived.outstanding,
      payment_state: derived.paymentState,
    })
    .eq("id", invoiceId);

  if (updateError) {
    const errorDetails = {
      message: updateError?.message || "Unknown error",
      code: updateError?.code || null,
      details: (updateError as any)?.details || null,
      hint: (updateError as any)?.hint || null,
    };
    console.error("[recalculateInvoiceState] failed to update invoice:", errorDetails);
  }
}

export async function createPayment(
  workspaceId: string,
  rawValues: PaymentFormValues
) {
  // Validate user and workspace access at the start
  const { user } = await requireUser();
  const { workspaceId: validatedWorkspaceId } = await requireWorkspace(workspaceId);

  const parsed = PaymentFormSchema.parse(rawValues);
  const supabase = await supabaseServer();

  // 1) Query invoices_view for invoice validation (canonical contract)
  const { data: invoiceView, error: invoiceViewError } = await supabase
    .from("invoices_view")
    .select("id, workspace_id, client_id, currency, total, paid, outstanding, base_status, display_status")
    .eq("id", parsed.invoiceId)
    .eq("workspace_id", workspaceId)
    .single();

  // Validate: invoice exists
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

  // Validate: base_status === 'sent'
  if (invoiceView.base_status !== "sent") {
    return { error: `Invoice must have status 'sent' to record a payment. Current status: ${invoiceView.base_status}` };
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
      organization_id: ORGANIZATION_ID,
      workspace_id: workspaceId,
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
      details: (error as any)?.details || null,
      hint: (error as any)?.hint || null,
    };
    console.error("[createPayment] insert failed", errorDetails);
    return { 
      error: `Failed to create payment: ${errorDetails.message}`,
      code: errorDetails.code,
      details: errorDetails.details,
      hint: errorDetails.hint,
    };
  }

  // 4) Recalculate invoice state after payment is created
  // This updates invoices.total_paid and invoices.outstanding_amount
  // Do NOT touch invoice status directly - it's derived from display_status in view
  await recalculateInvoiceState(parsed.invoiceId);

  // 5) Log audit event with user.id and workspace_id
  // Audit log failure must never break payment creation
  try {
    await logAuditEvent({
      workspaceId: validatedWorkspaceId,
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
  const { workspaceId: validatedWorkspaceId } = await requireWorkspace(workspaceId);

  const parsed = PaymentFormSchema.parse(rawValues);
  const supabase = await supabaseServer();

  // 1) Get existing payment to know old amount and invoice_id
  const { data: existingPayment, error: existingPaymentError } = await supabase
    .from("payments")
    .select("invoice_id, amount, status")
    .eq("id", paymentId)
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

  const oldAmount = Number(existingPayment.amount ?? 0);
  const newAmount = Number(parsed.amount);
  const oldInvoiceId = existingPayment.invoice_id;
  const newInvoiceId = parsed.invoiceId;

  // 2) Determine which invoice(s) to validate against
  const invoiceChanged = oldInvoiceId && newInvoiceId && oldInvoiceId !== newInvoiceId;
  const targetInvoiceId = newInvoiceId || oldInvoiceId;
  
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

  // 6) If invoice changed, validate that new invoice can accept the payment
  if (invoiceChanged && newInvoiceId) {
    const { data: newInvoiceView, error: newInvoiceViewError } = await supabase
      .from("invoices_view")
      .select("id, outstanding")
      .eq("id", newInvoiceId)
      .eq("workspace_id", workspaceId)
      .single();

    if (newInvoiceViewError || !newInvoiceView) {
      const errorDetails = {
        message: newInvoiceViewError?.message || "Unknown error",
        code: newInvoiceViewError?.code || null,
        details: (newInvoiceViewError as any)?.details || null,
        hint: (newInvoiceViewError as any)?.hint || null,
      };
      console.error("[updatePayment] failed to load new invoice:", errorDetails);
      return { error: `New invoice not found: ${errorDetails.message}` };
    }

    // Validate: if new payment will be completed, check it doesn't exceed new invoice's outstanding
    if (newPaymentWillBeCompleted) {
      const newInvoiceOutstanding = Number(newInvoiceView.outstanding ?? 0);
      if (newAmount > newInvoiceOutstanding) {
        return { 
          error: `Payment amount (${newAmount.toFixed(2)}) exceeds the new invoice outstanding balance (${newInvoiceOutstanding.toFixed(2)}).` 
        };
      }
    }
  }

  // 6) Perform the update
  const { error } = await supabase
    .from("payments")
    .update({
      client_id: parsed.clientId,
      invoice_id: parsed.invoiceId,
      amount: parsed.amount,
      payment_date: parsed.date, // Map form's 'date' to database's 'payment_date'
      method: parsed.method,
      status: parsed.status,
      transaction_id: parsed.transactionId ?? null,
      notes: parsed.notes ?? null,
      payment_provider: parsed.payment_provider || null,
    })
    .eq("id", paymentId);

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

  // 8) Recalculate invoice state for both old and new invoice (if changed)
  if (oldInvoiceId) {
    await recalculateInvoiceState(oldInvoiceId);
  }
  if (newInvoiceId && newInvoiceId !== oldInvoiceId) {
    await recalculateInvoiceState(newInvoiceId);
  }

  // 9) Log audit event with user.id and workspace_id
  // Audit log failure must never break payment update
  try {
    await logAuditEvent({
      workspaceId: validatedWorkspaceId,
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
        invoice_changed: invoiceChanged,
      },
    });
  } catch (auditError) {
    // Log but don't fail - audit logging should never break payment update
    console.error("[updatePayment] audit log failed (non-blocking):", auditError);
  }

  revalidatePath(`/${workspaceId}/payments`);
  revalidatePath(`/${workspaceId}/invoices`);
  if (oldInvoiceId) {
    revalidatePath(`/${workspaceId}/invoices/${oldInvoiceId}`);
  }
  if (newInvoiceId) {
    revalidatePath(`/${workspaceId}/invoices/${newInvoiceId}`);
  }
  return { success: true };
}

export async function deletePayment(workspaceId: string, paymentId: string) {
  // Get user for audit logging
  const { user } = await requireUser();

  const supabase = await supabaseServer();

  // Get payment details before deletion (to recalculate state and for audit log)
  const { data: existingPayment } = await supabase
    .from("payments")
    .select("invoice_id, amount")
    .eq("id", paymentId)
    .single();

  const { error } = await supabase
    .from("payments")
    .delete()
    .eq("id", paymentId)
    .eq("workspace_id", workspaceId);

  if (error) {
    const errorDetails = {
      message: error?.message || "Unknown error",
      code: error?.code || null,
      details: (error as any)?.details || null,
      hint: (error as any)?.hint || null,
    };
    console.error("[deletePayment] delete failed:", errorDetails);
    throw new Error(`Failed to delete payment: ${errorDetails.message}`);
  }

  // Recalculate invoice state after payment is deleted
  if (existingPayment?.invoice_id) {
    await recalculateInvoiceState(existingPayment.invoice_id);
  }

  // Log audit event
  await logAuditEvent({
    workspaceId,
    userId: user.id,
    entityType: "payment",
    entityId: paymentId,
    action: "deleted",
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
