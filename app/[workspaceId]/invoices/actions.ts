"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";
import { requireUser, requireWorkspace } from "@/lib/auth/server";
import {
  InvoiceFormSchema,
  type InvoiceFormValues,
} from "@/lib/invoices/schema";
import { calculateInvoiceMoney } from "@/lib/invoices/calc";
import { deriveInvoiceState } from "@/lib/invoices/deriveState";
import { 
  resolvePaymentTermsDays, 
  computeDueDate, 
  type PaymentTermsCode 
} from "@/lib/invoices/paymentTerms";
import { logAuditEvent } from "@/lib/audit/log";
import { assertInvoiceCreateAllowed } from "@/lib/billing/assertWithinPlanLimits";
import { redirect } from "next/navigation";

const ORGANIZATION_ID = "05d2d292-d95b-44f4-b774-22f10068124f";

export async function createInvoice(
  workspaceId: string,
  rawValues: InvoiceFormValues
) {
  console.log("[createInvoice] called with workspaceId:", workspaceId);

  // Validate user and workspace access at the start
  const { user } = await requireUser();
  const { workspaceId: validatedWorkspaceId } = await requireWorkspace(workspaceId);

  try {
    await assertInvoiceCreateAllowed(workspaceId);
  } catch (error: any) {
    if (error?.code === "PLAN_LIMIT_INVOICES") {
      redirect(`/${workspaceId}/invoices?limit=PLAN_LIMIT_INVOICES`);
    }
    throw error;
  }

  const parsed = InvoiceFormSchema.parse(rawValues);
  const supabase = await supabaseServer();

  // Step 1: Fetch client & workspace defaults for payment terms
  let clientDefaultDays: number | null = null;
  let workspaceDefaultDays: number | null = null;

  if (parsed.clientId) {
    const { data: clientRow } = await supabase
      .from("clients")
      .select("payment_terms_days")
      .eq("id", parsed.clientId)
      .single();
    
    clientDefaultDays = clientRow?.payment_terms_days ?? null;
  }

  // Fetch workspace defaults (if workspace table has default_payment_terms_days)
  // Note: workspaces table may not have this field, so we use maybeSingle and handle gracefully
  const { data: workspaceRow } = await supabase
    .from("workspaces")
    .select("*")
    .eq("id", workspaceId)
    .maybeSingle();
  
  // Check if workspace has default_payment_terms_days (may not exist in schema)
  workspaceDefaultDays = (workspaceRow as any)?.default_payment_terms_days ?? null;

  // Step 2: Resolve effective payment terms days
  const effectiveDays = resolvePaymentTermsDays(
    parsed.paymentTerms as PaymentTermsCode,
    parsed.paymentTermsDays ?? null,
    clientDefaultDays,
    workspaceDefaultDays
  );

  // Step 3: Compute due date from issueDate + effectiveDays (server-side authoritative)
  const dueDate = computeDueDate(parsed.issueDate, effectiveDays);
  if (!dueDate) {
    throw new Error(`Invalid issue date: ${parsed.issueDate}`);
  }

  // Step 4: Calculate invoice money values using the shared helper
  const money = calculateInvoiceMoney({
    items: parsed.items.map((item) => ({
      quantity: Number(item.quantity),
      unit_price: Number(item.unit_price),
    })),
    discountPercent: Number(parsed.discountPercent ?? 0),
    taxPercent: Number(parsed.taxPercent ?? 0),
  });

  // Step 5: Insert invoice with computed due_date and payment_terms_days
  // IMPORTANT: Store all money calculation fields in the database for consistency
  // CRITICAL: MUST set workspace_id so invoices appear in the list page
  const { data: invoice, error: invoiceError } = await supabase
    .from("invoices")
    .insert({
      workspace_id: workspaceId, // MUST be set - used for filtering in list page
      organization_id: ORGANIZATION_ID, // Keep for backward compatibility if needed
      client_id: parsed.clientId,
      invoice_number: parsed.invoiceNumber,
      issue_date: parsed.issueDate,
      due_date: dueDate, // Computed server-side, not from form
      po_number: parsed.poNumber ?? null,
      notes: parsed.notes ?? null,
      status: parsed.status,
      payment_terms: parsed.paymentTerms,
      payment_terms_days: effectiveDays, // Computed server-side
      currency: "USD",
      // Money fields - ALL computed server-side, stored in database as authoritative values
      subtotal: money.subtotal,
      discount_percent: money.discountPercent,
      discount_amount: money.discountAmount,
      tax_percent: money.taxPercent,
      tax_amount: money.taxAmount,
      amount: money.total,
      // Initialize payment fields (will be updated after insert)
      total_paid: 0,
      outstanding_amount: money.total, // Temporary, will be recalculated below
      payment_state: "unpaid",
    })
    .select("id, workspace_id, organization_id, status, amount, issue_date, due_date")
    .single();

  if (invoiceError || !invoice) {
    console.error("[createInvoice] invoice insert failed:", invoiceError);
    throw new Error(`Failed to create invoice: ${invoiceError?.message}`);
  }

  console.log("[createInvoice] invoice created:", invoice.id);

  // 2) Insert items
  // IMPORTANT: invoice_items table only contains: name, description, quantity, unit_price, invoice_id, organization_id, position
  // We do NOT write: subtotal, line_total (these columns don't exist)
  const itemsPayload = parsed.items.map((item, index) => ({
    organization_id: ORGANIZATION_ID,
    invoice_id: invoice.id,
    name: item.name,
    description: item.description ?? null,
    quantity: item.quantity,
    unit_price: item.unit_price,
    position: index + 1,
  }));

  const { error: itemsError } = await supabase
    .from("invoice_items")
    .insert(itemsPayload);

  if (itemsError) {
    console.error("[createInvoice] items insert failed:", itemsError);
    throw new Error(`Failed to create invoice items: ${itemsError.message}`);
  }

  console.log("[createInvoice] items created for invoice:", invoice.id);

  // 3) Calculate derived state (no payments yet for new invoice)
  // For new invoices, total_paid = 0, outstanding_amount = amount
  // outstanding_amount cannot go negative
  const outstandingAmount = Math.max(0, money.total - 0);

  // 4) Update invoice with final state
  await supabase
    .from("invoices")
    .update({
      total_paid: 0,
      outstanding_amount: outstandingAmount,
      payment_state: "unpaid",
    })
    .eq("id", invoice.id);

  // 5) Log audit event with user.id and workspace_id
  await logAuditEvent({
    workspaceId: validatedWorkspaceId,
    userId: user.id,
    entityType: "invoice",
    entityId: invoice.id,
    action: "created",
    metadata: {
      invoice_number: parsed.invoiceNumber,
      total: money.total,
      client_id: parsed.clientId,
      status: parsed.status,
    },
  });

  revalidatePath(`/${workspaceId}/invoices`);
  return invoice.id;
}

export async function updateInvoice(
  workspaceId: string,
  invoiceId: string,
  rawValues: InvoiceFormValues
) {
  // Validate user and workspace access at the start
  const { user } = await requireUser();
  const { workspaceId: validatedWorkspaceId } = await requireWorkspace(workspaceId);

  const parsed = InvoiceFormSchema.parse(rawValues);
  const supabase = await supabaseServer();

  // Step 1: Fetch existing invoice to get total_paid and current values
  const { data: invoiceRow, error: invoiceError } = await supabase
    .from("invoices")
    .select("id, organization_id, invoice_number, status, issue_date, due_date, total_paid, client_id")
    .eq("id", invoiceId)
    .single();

  if (invoiceError || !invoiceRow) {
    return { error: `Failed to load invoice: ${invoiceError?.message}` };
  }

  // Step 2: Fetch client defaults for payment terms (if client changed or we need defaults)
  let clientDefaultDays: number | null = null;
  const clientIdToUse = parsed.clientId || invoiceRow.client_id;
  
  if (clientIdToUse) {
    const { data: clientRow } = await supabase
      .from("clients")
      .select("payment_terms_days")
      .eq("id", clientIdToUse)
      .single();
    
    clientDefaultDays = clientRow?.payment_terms_days ?? null;
  }

  // Step 3: Resolve effective payment terms days
  // Use form values if provided, otherwise keep existing
  const issueDate = parsed.issueDate || invoiceRow.issue_date;
  const paymentTermsCode = (parsed.paymentTerms as PaymentTermsCode) || (invoiceRow.payment_terms as PaymentTermsCode);
  const paymentTermsDays = parsed.paymentTermsDays ?? null;

  const effectiveDays = resolvePaymentTermsDays(
    paymentTermsCode,
    paymentTermsDays,
    clientDefaultDays,
    null // workspace default not available in schema
  );

  // Step 4: Compute due date from issueDate + effectiveDays (server-side authoritative)
  // Always recompute to ensure consistency
  const dueDate = computeDueDate(issueDate, effectiveDays);
  if (!dueDate) {
    return { error: `Invalid issue date: ${issueDate}` };
  }

  // Step 5: Calculate invoice money values using the shared helper
  const money = calculateInvoiceMoney({
    items: parsed.items.map((item) => ({
      quantity: Number(item.quantity),
      unit_price: Number(item.unit_price),
    })),
    discountPercent: Number(parsed.discountPercent ?? 0),
    taxPercent: Number(parsed.taxPercent ?? 0),
  });

  // Get existing total_paid (from database or calculate from payments)
  const existingTotalPaid = Number(invoiceRow.total_paid ?? 0);

  // Step 6: Update invoice with computed due_date and payment_terms_days
  // IMPORTANT: Store all money calculation fields in the database for consistency
  const { error: updateError } = await supabase
    .from("invoices")
    .update({
      client_id: parsed.clientId,
      issue_date: issueDate,
      due_date: dueDate, // Computed server-side, not from form
      po_number: parsed.poNumber ?? null,
      notes: parsed.notes ?? null,
      status: parsed.status,
      payment_terms: paymentTermsCode,
      payment_terms_days: effectiveDays, // Computed server-side
      // Money fields - ALL computed server-side, stored in database as authoritative values
      subtotal: money.subtotal,
      discount_percent: money.discountPercent,
      discount_amount: money.discountAmount,
      tax_percent: money.taxPercent,
      tax_amount: money.taxAmount,
      amount: money.total,
      // Calculate outstanding_amount = amount - total_paid (cannot go negative)
      outstanding_amount: Math.max(0, money.total - existingTotalPaid),
      // keep invoice_number and currency unchanged
      // total_paid remains unchanged (updated separately by payment actions)
    })
    .eq("id", invoiceId);

  if (updateError) {
    return { error: `Failed to update invoice: ${updateError.message}` };
  }

  // Simple approach: delete all items and reinsert
  await supabase.from("invoice_items").delete().eq("invoice_id", invoiceId);

  // IMPORTANT: invoice_items table only contains: name, description, quantity, unit_price, invoice_id, organization_id, position
  // We do NOT write: subtotal, line_total (these columns don't exist)
  const itemsPayload = parsed.items.map((item, index) => ({
    organization_id: invoiceRow.organization_id,
    invoice_id: invoiceRow.id,
    name: item.name,
    description: item.description ?? null,
    quantity: item.quantity,
    unit_price: item.unit_price,
    position: index + 1,
  }));

  const { error: itemsError } = await supabase
    .from("invoice_items")
    .insert(itemsPayload);

  if (itemsError) {
    return { error: `Failed to update invoice items: ${itemsError.message}` };
  }

  // Recalculate payment state after updating invoice
  // Fetch payments to recalculate total_paid and outstanding_amount
  const { data: payments } = await supabase
    .from("payments")
    .select("amount, status")
    .eq("invoice_id", invoiceId);

  // Calculate total_paid from payments
  const totalPaid = (payments ?? [])
    .filter((p) => p.status === "completed" || p.status === "paid" || !p.status)
    .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);

  // Calculate outstanding_amount = amount - total_paid (cannot go negative)
  const outstandingAmount = Math.max(0, money.total - totalPaid);

  // Determine payment state
  let paymentState: "unpaid" | "partially_paid" | "paid" = "unpaid";
  if (outstandingAmount <= 0 && totalPaid > 0) {
    paymentState = "paid";
  } else if (outstandingAmount > 0 && totalPaid > 0) {
    paymentState = "partially_paid";
  }

  // Determine if overdue
  // Use computed dueDate (server-side authoritative) instead of parsed.dueDate
  const dueDateObj = new Date(dueDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  // Update invoice with payment state
  // Note: is_overdue is deprecated - use dynamic logic: (due_date < today) AND (outstanding_amount > 0)
  await supabase
    .from("invoices")
    .update({
      total_paid: totalPaid,
      outstanding_amount: outstandingAmount,
      payment_state: paymentState,
    })
    .eq("id", invoiceId);

  // Log audit event with user.id and workspace_id
  await logAuditEvent({
    workspaceId: validatedWorkspaceId,
    userId: user.id,
    entityType: "invoice",
    entityId: invoiceId,
    action: "updated",
    metadata: {
      invoice_number: invoiceRow.invoice_number,
      status_before: invoiceRow.status,
      status_after: parsed.status,
      total: money.total,
    },
  });

  revalidatePath(`/${workspaceId}/invoices`);
  return { success: true };
}

export async function deleteInvoice(workspaceId: string, invoiceId: string) {
  // Get user for audit logging
  const { user } = await requireUser();

  const supabase = await supabaseServer();

  // Load invoice details before deletion for audit log
  const { data: invoice } = await supabase
    .from("invoices")
    .select("invoice_number")
    .eq("id", invoiceId)
    .single();

  // Delete invoice items first
  const { error: itemsError } = await supabase
    .from("invoice_items")
    .delete()
    .eq("invoice_id", invoiceId);

  if (itemsError) {
    throw new Error(`Failed to delete invoice items: ${itemsError.message}`);
  }

  // Delete invoice
  const { error: invoiceError } = await supabase
    .from("invoices")
    .delete()
    .eq("id", invoiceId);

  if (invoiceError) {
    throw new Error(`Failed to delete invoice: ${invoiceError.message}`);
  }

  // Log audit event
  await logAuditEvent({
    workspaceId,
    userId: user.id,
    entityType: "invoice",
    entityId: invoiceId,
    action: "deleted",
    metadata: {
      invoice_number: invoice?.invoice_number,
    },
  });

  revalidatePath(`/${workspaceId}/invoices`);
}
