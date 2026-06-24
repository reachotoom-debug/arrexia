"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";
import { requireUser, requireWorkspace } from "@/lib/auth/server";
import {
  InvoiceFormSchema,
  type InvoiceFormValues,
} from "@/lib/invoices/schema";
import { calculateInvoiceMoney } from "@/lib/invoices/calc";
import { 
  resolvePaymentTermsDays, 
  computeDueDate, 
  type PaymentTermsCode 
} from "@/lib/invoices/paymentTerms";
import { logAuditEvent } from "@/lib/audit/log";
import { assertInvoiceCreateAllowed } from "@/lib/billing/assertWithinPlanLimits";
import { redirect } from "next/navigation";
import { logPostgresUniqueViolation } from "@/lib/db/postgres-errors";

const INV_PREFIX = "INV-";
const DEFAULT_PAD_WIDTH = 4;

function roundCurrency2(value: number): number {
  return Math.round(Number(value || 0) * 100) / 100;
}

/**
 * Returns the next available invoice number for the workspace.
 * Workspace-scoped: queries all invoice_number for workspace_id, parses INV-(digits), computes max+1.
 * Includes created + imported invoices. If none exist or no match, returns INV-0001.
 */
export async function getNextInvoiceNumber(workspaceId: string): Promise<string> {
  await requireWorkspace(workspaceId);
  const supabase = await supabaseServer();

  const { data, error } = await supabase
    .from("invoices")
    .select("invoice_number")
    .eq("workspace_id", workspaceId)
    .limit(10000);

  if (error) {
    console.error("[getNextInvoiceNumber] query error", error);
    return "INV-0001";
  }

  const rows = data ?? [];
  let maxNum = 0;
  for (const row of rows) {
    const s = row?.invoice_number;
    if (typeof s !== "string" || !s.startsWith(INV_PREFIX)) continue;
    const digits = s.slice(INV_PREFIX.length);
    if (!/^\d+$/.test(digits)) continue;
    const n = parseInt(digits, 10);
    if (Number.isFinite(n)) maxNum = Math.max(maxNum, n);
  }

  const nextNum = maxNum + 1;
  return `${INV_PREFIX}${nextNum.toString().padStart(DEFAULT_PAD_WIDTH, "0")}`;
}

export async function createInvoice(
  workspaceId: string,
  rawValues: InvoiceFormValues
) {
  // Validate user and workspace access at the start
  const { user } = await requireUser();
  const { workspace } = await requireWorkspace(workspaceId);
  const validatedWorkspaceId = workspace.id;
  const organizationId = workspace.organization_id;

  try {
    await assertInvoiceCreateAllowed(workspaceId);
  } catch (error: unknown) {
    const err = error as { digest?: string; code?: string } | null;
    const digest = String(err?.digest || "");
    if (digest.includes("NEXT_REDIRECT")) throw error;
    if (err?.code === "PLAN_LIMIT_INVOICES") {
      redirect(`/${workspaceId}/invoices?limit=PLAN_LIMIT_INVOICES`);
    }
    throw error;
  }

  const parsed = InvoiceFormSchema.parse(rawValues);
  const supabase = await supabaseServer();

  // Enforce invoice number uniqueness per workspace at application layer as well.
  // This keeps behavior deterministic even if DB/index drift happens.
  const normalizedInvoiceNumber = parsed.invoiceNumber.trim();
  if (!normalizedInvoiceNumber) {
    return {
      ok: false,
      fieldErrors: { invoice_number: "Invoice number is required." },
    };
  }

  const { data: existingInvoiceWithNumber, error: existingInvoiceError } = await supabase
    .from("invoices")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("invoice_number", normalizedInvoiceNumber)
    .limit(1)
    .maybeSingle();

  if (existingInvoiceError) {
    throw new Error(`Failed to validate invoice number uniqueness: ${existingInvoiceError.message}`);
  }

  if (existingInvoiceWithNumber) {
    return {
      ok: false,
      fieldErrors: { invoice_number: "Invoice number already exists in this workspace." },
    };
  }

  // Step 1: Fetch client & workspace defaults for payment terms
  let clientDefaultDays: number | null = null;
  let workspaceDefaultDays: number | null = null;

  if (parsed.clientId) {
    const { data: clientRow } = await supabase
      .from("clients")
      .select("payment_terms_days, archived_at, is_active")
      .eq("id", parsed.clientId)
      .eq("workspace_id", workspaceId)
      .single();
    
    // Client State Model: Prevent creating invoices for archived or inactive clients
    // Archived: archived_at IS NOT NULL
    // Inactive: is_active = false AND archived_at IS NULL
    if (clientRow?.archived_at) {
      throw new Error("Cannot create invoice for archived client");
    }
    
    if (clientRow?.is_active === false) {
      throw new Error("Cannot create invoice for inactive client");
    }
    
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
  const workspaceRowRecord = workspaceRow as Record<string, unknown> | null;
  workspaceDefaultDays =
    (workspaceRowRecord?.default_payment_terms_days as number | null | undefined) ??
    null;

  // Fetch workspace settings for default currency
  // IMPORTANT: Only affects new invoices. Existing invoices keep their original currency.
  const { data: settingsRow } = await supabase
    .from("settings")
    .select("default_currency")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  const defaultCurrency = (settingsRow as { default_currency?: string } | null)?.default_currency || "USD";

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
      unit_price: roundCurrency2(Number(item.unit_price)),
    })),
    discountPercent: Number(parsed.discountPercent ?? 0),
    taxPercent: Number(parsed.taxPercent ?? 0),
  });

  // Step 5: Insert invoice with computed due_date and payment_terms_days
  // IMPORTANT: Store all money calculation fields in the database for consistency
  // CRITICAL: MUST set workspace_id so invoices appear in the list page
  // Guard: workspace_id must be present
  if (!validatedWorkspaceId) {
    throw new Error("workspace_id is required");
  }

  // Ensure status is lowercase
  const normalizedStatus = parsed.status.toLowerCase() as "draft" | "sent" | "void";

  const { data: invoice, error: invoiceError } = await supabase
    .from("invoices")
    .insert({
      workspace_id: validatedWorkspaceId, // Use validated workspace_id
      organization_id: organizationId,
      client_id: parsed.clientId,
      invoice_number: normalizedInvoiceNumber,
      issue_date: parsed.issueDate,
      due_date: dueDate, // Computed server-side, not from form
      po_number: parsed.poNumber ?? null,
      notes: parsed.notes ?? null,
      status: normalizedStatus, // Lowercase: draft | sent | void
      payment_terms: parsed.paymentTerms,
      payment_terms_days: effectiveDays, // Computed server-side
      currency: defaultCurrency, // From workspace settings; existing invoices keep their original currency
      // Money fields - ALL computed server-side, stored in database as authoritative values
      subtotal: money.subtotal,
      discount_percent: money.discountPercent,
      discount_amount: money.discountAmount,
      tax_percent: money.taxPercent,
      tax_amount: money.taxAmount,
      amount: money.total,
      // REMOVED: total_paid, outstanding_amount, payment_state (computed by invoices_view)
    })
    .select("id, workspace_id, organization_id, status, amount, issue_date, due_date")
    .single();

  if (invoiceError || !invoice) {
    console.error("[createInvoice] invoice insert failed:", invoiceError);
    const code = (invoiceError as { code?: string } | null)?.code;
    if (code === "23505") {
      logPostgresUniqueViolation("createInvoice", invoiceError, {
        workspaceId: validatedWorkspaceId,
        organizationId,
        invoiceNumber: normalizedInvoiceNumber,
      });
      return {
        ok: false,
        fieldErrors: { invoice_number: "Invoice number already exists. Choose another." },
      };
    }
    throw new Error(`Failed to create invoice: ${invoiceError?.message}`);
  }

  // 2) Insert items
  // IMPORTANT: invoice_items table only contains: name, description, quantity, unit_price, invoice_id, organization_id, position
  // We do NOT write: subtotal, line_total (these columns don't exist)
  // NOTE: invoice_items has no workspace_id; scope via invoices join (invoice belongs to workspace)
  const itemsPayload = parsed.items.map((item, index) => ({
    organization_id: organizationId,
    invoice_id: invoice.id,
    name: item.name,
    description: item.description ?? null,
    quantity: item.quantity,
    // Persist user-entered unit_price directly (rounded to 2 decimals only).
    unit_price: roundCurrency2(Number(item.unit_price)),
    position: index + 1,
  }));

  const { error: itemsError } = await supabase
    .from("invoice_items")
    .insert(itemsPayload);

  if (itemsError) {
    console.error("[createInvoice] items insert failed:", itemsError);
    throw new Error(`Failed to create invoice items: ${itemsError.message}`);
  }

  // REMOVED: total_paid, outstanding_amount, payment_state updates
  // These are computed automatically by invoices_view

  // 3) Log audit event with user.id and workspace_id
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
  const { workspace } = await requireWorkspace(workspaceId);
  const validatedWorkspaceId = workspace.id;
  const organizationId = workspace.organization_id;

  const parsed = InvoiceFormSchema.parse(rawValues);
  const supabase = await supabaseServer();

  // Guard: workspace_id must be present
  if (!validatedWorkspaceId) {
    return { error: "workspace_id is required" };
  }

  // Step 1: Fetch existing invoice to get current values
  const { data: invoiceRow, error: invoiceError } = await supabase
    .from("invoices")
    .select("id, invoice_number, status, issue_date, due_date, client_id, organization_id, payment_terms, archived_at")
    .eq("id", invoiceId)
    .eq("workspace_id", validatedWorkspaceId)
    .single();

  if (invoiceError || !invoiceRow) {
    return { error: `Failed to load invoice: ${invoiceError?.message}` };
  }

  if (invoiceRow.archived_at) {
    return { error: "Cannot edit an archived invoice. Unarchive it first." };
  }

  // Step 2: Fetch client defaults for payment terms
  // NOTE: client_id is fixed in edit mode, so use invoiceRow.client_id
  let clientDefaultDays: number | null = null;
  
  if (invoiceRow.client_id) {
    const { data: clientRow } = await supabase
      .from("clients")
      .select("payment_terms_days")
      .eq("id", invoiceRow.client_id)
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
      unit_price: roundCurrency2(Number(item.unit_price)),
    })),
    discountPercent: Number(parsed.discountPercent ?? 0),
    taxPercent: Number(parsed.taxPercent ?? 0),
  });

  // Ensure status is lowercase
  const normalizedStatus = parsed.status.toLowerCase() as "draft" | "sent" | "void";

  // Step 6: Update invoice with computed due_date and payment_terms_days
  // IMPORTANT: Store all money calculation fields in the database for consistency
  // NOTE: client_id is NOT updated in edit mode - it remains fixed
  const { error: updateError } = await supabase
    .from("invoices")
    .update({
      issue_date: issueDate,
      due_date: dueDate, // Computed server-side, not from form
      po_number: parsed.poNumber ?? null,
      notes: parsed.notes ?? null,
      status: normalizedStatus, // Lowercase: draft | sent | void
      payment_terms: paymentTermsCode,
      payment_terms_days: effectiveDays, // Computed server-side
      // Money fields - ALL computed server-side, stored in database as authoritative values
      subtotal: money.subtotal,
      discount_percent: money.discountPercent,
      discount_amount: money.discountAmount,
      tax_percent: money.taxPercent,
      tax_amount: money.taxAmount,
      amount: money.total,
      // REMOVED: outstanding_amount, total_paid, payment_state (computed by invoices_view)
      // REMOVED: client_id (fixed in edit mode, not updatable)
    })
    .eq("id", invoiceId)
    .eq("workspace_id", validatedWorkspaceId);

  if (updateError) {
    return { error: `Failed to update invoice: ${updateError.message}` };
  }

  // Simple approach: delete all items and reinsert
  // NOTE: invoice_items has no workspace_id; scope via invoices join (invoice already verified belongs to workspace)
  await supabase.from("invoice_items").delete().eq("invoice_id", invoiceId);

  // IMPORTANT: invoice_items table only contains: name, description, quantity, unit_price, invoice_id, organization_id, position
  // We do NOT write: subtotal, line_total (these columns don't exist)
  const itemsPayload = parsed.items.map((item, index) => ({
    organization_id: invoiceRow.organization_id ?? organizationId,
    invoice_id: invoiceRow.id,
    name: item.name,
    description: item.description ?? null,
    quantity: item.quantity,
    // Persist user-entered unit_price directly (rounded to 2 decimals only).
    unit_price: roundCurrency2(Number(item.unit_price)),
    position: index + 1,
  }));

  const { error: itemsError } = await supabase
    .from("invoice_items")
    .insert(itemsPayload);

  if (itemsError) {
    return { error: `Failed to update invoice items: ${itemsError.message}` };
  }

  // REMOVED: total_paid, outstanding_amount, payment_state recalculation
  // These are computed automatically by invoices_view

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
  revalidatePath(`/${workspaceId}/invoices/${invoiceId}`);
  
  // Redirect to invoices list after successful save
  redirect(`/${workspaceId}/invoices`);
}

export async function deleteInvoice(workspaceId: string, invoiceId: string) {
  // Get user for audit logging
  const { user } = await requireUser();

  const supabase = await supabaseServer();

  // Load invoice details before archiving for audit log
  const { data: invoice } = await supabase
    .from("invoices")
    .select("invoice_number")
    .eq("id", invoiceId)
    .eq("workspace_id", workspaceId)
    .is("archived_at", null)
    .single();

  if (!invoice) {
    throw new Error("Invoice not found or already archived");
  }

  // Archive invoice (invoice_items remain linked but invoice is archived)
  const { error: invoiceError } = await supabase
    .from("invoices")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", invoiceId)
    .eq("workspace_id", workspaceId);

  if (invoiceError) {
    throw new Error(`Failed to archive invoice: ${invoiceError.message}`);
  }

  // Log audit event
  await logAuditEvent({
    workspaceId,
    userId: user.id,
    entityType: "invoice",
    entityId: invoiceId,
    action: "archived",
    metadata: {
      invoice_number: invoice?.invoice_number,
    },
  });

  revalidatePath(`/${workspaceId}/invoices`);
}

/**
 * Archive invoice: sets archived_at = now()
 */
export async function archiveInvoice(
  workspaceId: string,
  invoiceId: string
): Promise<{ ok: boolean; invoice?: unknown; error?: string }> {
  const { user } = await requireUser();
  const { workspace } = await requireWorkspace(workspaceId);
  const validatedWorkspaceId = workspace.id;
  const supabase = await supabaseServer();

  const { error, data } = await supabase
    .from("invoices")
    .update({ archived_at: new Date().toISOString() })
    .eq("workspace_id", validatedWorkspaceId)
    .eq("id", invoiceId)
    .is("archived_at", null)
    .select()
    .single();

  if (error) {
    console.error("[archiveInvoice] update failed", {
      code: error.code,
      message: error.message,
      workspaceId: validatedWorkspaceId,
      invoiceId,
    });
    return { ok: false, error: `Failed to archive invoice: ${error.message}` };
  }

  if (!data) {
    console.error("[archiveInvoice] no rows updated", {
      workspaceId: validatedWorkspaceId,
      invoiceId,
    });
    return { ok: false, error: "Invoice not found or already archived" };
  }

  // Log audit event
  try {
    await logAuditEvent({
      workspaceId: validatedWorkspaceId,
      userId: user.id,
      entityType: "invoice",
      entityId: invoiceId,
      action: "archived",
    });
  } catch (auditError) {
    console.error("[archiveInvoice] audit log failed (non-blocking):", auditError);
  }

  // Revalidate all affected paths
  revalidatePath(`/${workspaceId}/invoices`);
  revalidatePath(`/${workspaceId}/dashboard`);
  revalidatePath(`/${workspaceId}/collections`);
  revalidatePath(`/${workspaceId}/clients`);
  // Revalidate client detail page if invoice has a client_id
  if (data?.client_id) {
    revalidatePath(`/${workspaceId}/clients/${data.client_id}`);
  }

  return { ok: true, invoice: data };
}

/**
 * Unarchive invoice: sets archived_at = null
 */
export async function unarchiveInvoice(
  workspaceId: string,
  invoiceId: string
): Promise<{ ok: boolean; invoice?: unknown; error?: string }> {
  const { user } = await requireUser();
  const { workspace } = await requireWorkspace(workspaceId);
  const validatedWorkspaceId = workspace.id;
  const supabase = await supabaseServer();

  const { error, data } = await supabase
    .from("invoices")
    .update({ archived_at: null })
    .eq("workspace_id", validatedWorkspaceId)
    .eq("id", invoiceId)
    .not("archived_at", "is", null)
    .select()
    .single();

  if (error) {
    console.error("[unarchiveInvoice] update failed", {
      code: error.code,
      message: error.message,
      workspaceId: validatedWorkspaceId,
      invoiceId,
    });
    return { ok: false, error: `Failed to unarchive invoice: ${error.message}` };
  }

  if (!data) {
    console.error("[unarchiveInvoice] no rows updated", {
      workspaceId: validatedWorkspaceId,
      invoiceId,
    });
    return { ok: false, error: "Invoice not found or not archived" };
  }

  // Log audit event
  try {
    await logAuditEvent({
      workspaceId: validatedWorkspaceId,
      userId: user.id,
      entityType: "invoice",
      entityId: invoiceId,
      action: "unarchived",
    });
  } catch (auditError) {
    console.error("[unarchiveInvoice] audit log failed (non-blocking):", auditError);
  }

  // Revalidate all affected paths
  revalidatePath(`/${workspaceId}/invoices`);
  revalidatePath(`/${workspaceId}/dashboard`);
  revalidatePath(`/${workspaceId}/collections`);
  revalidatePath(`/${workspaceId}/clients`);
  // Revalidate client detail page if invoice has a client_id
  if (data?.client_id) {
    revalidatePath(`/${workspaceId}/clients/${data.client_id}`);
  }

  return { ok: true, invoice: data };
}

/**
 * Unarchive invoice: alias for unarchiveInvoice
 * Sets archived_at = null
 * @deprecated Use unarchiveInvoice directly
 */
export async function restoreInvoice(workspaceId: string, invoiceId: string) {
  return unarchiveInvoice(workspaceId, invoiceId);
}

/**
 * Bulk archive invoices: sets archived_at = now() for multiple invoices
 * Reuses single-invoice archive logic to keep behavior consistent
 */
export async function bulkArchiveInvoices(workspaceId: string, invoiceIds: string[]) {
  "use server";

  if (!invoiceIds || invoiceIds.length === 0) {
    return { ok: false, message: "No invoices selected" };
  }

  // Reuse single-invoice archive logic to keep behavior consistent
  const results = await Promise.all(
    invoiceIds.map((invoiceId) => archiveInvoice(workspaceId, invoiceId)),
  );

  // Count successful archives
  const successCount = results.filter((r) => r.ok).length;

  if (successCount === 0) {
    // All failed - return first error message
    const firstError = results.find((r) => !r.ok);
    return { ok: false, message: firstError?.error || "Failed to archive invoices" };
  }

  return { ok: true, count: successCount };
}

/**
 * Bulk unarchive invoices: sets archived_at = null for multiple invoices
 * Reuses single-invoice unarchive logic to keep behavior consistent
 */
export async function bulkUnarchiveInvoices(workspaceId: string, invoiceIds: string[]) {
  "use server";

  if (!invoiceIds || invoiceIds.length === 0) {
    return { ok: false, message: "No invoices selected" };
  }

  // Reuse single-invoice unarchive logic to keep behavior consistent
  const results = await Promise.all(
    invoiceIds.map((invoiceId) => unarchiveInvoice(workspaceId, invoiceId)),
  );

  // Count successful unarchives
  const successCount = results.filter((r) => r.ok).length;

  if (successCount === 0) {
    // All failed - return first error message
    const firstError = results.find((r) => !r.ok);
    return { ok: false, message: firstError?.error || "Failed to unarchive invoices" };
  }

  return { ok: true, count: successCount };
}
