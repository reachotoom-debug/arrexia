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
import { assertWorkspaceMutationAllowed } from "@/lib/billing/entitlementGuard";
import { EntitlementError } from "@/lib/billing/entitlementErrors";
import { redirect } from "next/navigation";
import { logPostgresUniqueViolation } from "@/lib/db/postgres-errors";
import { normalizeDateOnlyString } from "@/lib/datetime/formatDateTime";
import { isInvoiceFullyPaid } from "@/lib/invoices/invoiceFinancialState";
import {
  createCreateInvoiceInstrumentation,
  isNextRedirectError,
} from "@/lib/invoices/createInvoiceInstrumentation";

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
  rawValues: InvoiceFormValues,
  options?: { requestId?: string }
) {
  const timer = createCreateInvoiceInstrumentation(workspaceId, options?.requestId);
  timer.mark("START");

  let user: Awaited<ReturnType<typeof requireUser>>["user"];
  let workspace: Awaited<ReturnType<typeof requireWorkspace>>["workspace"];
  timer.mark("AUTH_START");
  try {
    ({ user } = await requireUser());
    ({ workspace } = await requireWorkspace(workspaceId));
    timer.mark("AUTH_END");
  } catch (error: unknown) {
    timer.markError("AUTH_END", error);
    throw error;
  }

  const validatedWorkspaceId = workspace.id;
  const organizationId = workspace.organization_id;

  timer.mark("ENTITLEMENT_START");
  try {
    await assertInvoiceCreateAllowed(workspaceId);
    timer.mark("ENTITLEMENT_END");
  } catch (error: unknown) {
    timer.markError("ENTITLEMENT_END", error);
    const err = error as { digest?: string; code?: string } | null;
    if (isNextRedirectError(error)) throw error;
    if (error instanceof EntitlementError) {
      if (error.code === "TRIAL_INVOICE_LIMIT_REACHED" || error.code === "PLAN_LIMIT_INVOICES") {
        redirect(`/${workspaceId}/invoices?limit=${error.code}`);
      }
      timer.mark("END");
      return { ok: false, error: error.message, code: error.code };
    }
    if (err?.code === "PLAN_LIMIT_INVOICES") {
      redirect(`/${workspaceId}/invoices?limit=PLAN_LIMIT_INVOICES`);
    }
    throw error;
  }

  const parsed = InvoiceFormSchema.parse(rawValues);
  const supabase = await supabaseServer();
  timer.mark("VALIDATION_END");

  // Enforce invoice number uniqueness per workspace at application layer as well.
  // This keeps behavior deterministic even if DB/index drift happens.
  const normalizedInvoiceNumber = parsed.invoiceNumber.trim();
  if (!normalizedInvoiceNumber) {
    timer.mark("END");
    return {
      ok: false,
      fieldErrors: { invoice_number: "Invoice number is required." },
    };
  }

  timer.mark("NUMBER_CHECK_START");
  let existingInvoiceWithNumber: { id: string } | null = null;
  let existingInvoiceError: { message: string } | null = null;
  try {
    const result = await supabase
      .from("invoices")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("invoice_number", normalizedInvoiceNumber)
      .limit(1)
      .maybeSingle();
    existingInvoiceWithNumber = result.data;
    existingInvoiceError = result.error;
    timer.mark("NUMBER_CHECK_END");
  } catch (error: unknown) {
    timer.markError("NUMBER_CHECK_END", error);
    throw error;
  }

  if (existingInvoiceError) {
    throw new Error(
      `Failed to validate invoice number uniqueness: ${existingInvoiceError.message}`
    );
  }

  if (existingInvoiceWithNumber) {
    timer.mark("END");
    return {
      ok: false,
      fieldErrors: { invoice_number: "Invoice number already exists in this workspace." },
    };
  }

  // Step 1: Fetch client & workspace defaults for payment terms
  let clientDefaultDays: number | null = null;
  let workspaceDefaultDays: number | null = null;
  let defaultCurrency = "USD";
  let effectiveDays = 0;
  let dueDate: string | null = null;

  timer.mark("CLIENT_CHECK_START");
  try {
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
    defaultCurrency =
      (settingsRow as { default_currency?: string } | null)?.default_currency || "USD";

    // Step 2: Resolve effective payment terms days
    effectiveDays = resolvePaymentTermsDays(
      parsed.paymentTerms as PaymentTermsCode,
      parsed.paymentTermsDays ?? null,
      clientDefaultDays,
      workspaceDefaultDays
    );

    // Step 3: Compute due date from issueDate + effectiveDays (server-side authoritative)
    dueDate = computeDueDate(parsed.issueDate, effectiveDays);
    if (!dueDate) {
      throw new Error(`Invalid issue date: ${parsed.issueDate}`);
    }

    timer.mark("CLIENT_CHECK_END");
  } catch (error: unknown) {
    timer.markError("CLIENT_CHECK_END", error);
    throw error;
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
  timer.mark("MONEY_CALC_END");

  // Step 5: Atomically create invoice header and line items (single DB transaction)
  if (!validatedWorkspaceId) {
    throw new Error("workspace_id is required");
  }

  const normalizedStatus = parsed.status.toLowerCase() as "draft" | "sent" | "void";

  const itemsJson = parsed.items.map((item, index) => ({
    name: item.name,
    description: item.description ?? null,
    quantity: item.quantity,
    unit_price: roundCurrency2(Number(item.unit_price)),
    position: index + 1,
  }));

  timer.mark("RPC_START");
  let rpcData: unknown;
  let rpcError: { message?: string; code?: string } | null = null;
  try {
    const rpcResult = await supabase.rpc("rpc_create_invoice_with_items", {
      p_workspace_id: validatedWorkspaceId,
      p_client_id: parsed.clientId,
      p_invoice_number: normalizedInvoiceNumber,
      p_issue_date: parsed.issueDate,
      p_due_date: dueDate,
      p_po_number: parsed.poNumber ?? null,
      p_notes: parsed.notes ?? null,
      p_status: normalizedStatus,
      p_payment_terms: parsed.paymentTerms,
      p_payment_terms_days: effectiveDays,
      p_currency: defaultCurrency,
      p_subtotal: money.subtotal,
      p_discount_percent: money.discountPercent,
      p_discount_amount: money.discountAmount,
      p_tax_percent: money.taxPercent,
      p_tax_amount: money.taxAmount,
      p_amount: money.total,
      p_items: itemsJson,
    });
    rpcData = rpcResult.data;
    rpcError = rpcResult.error;
    timer.mark("RPC_END");
  } catch (error: unknown) {
    timer.markError("RPC_END", error);
    throw error;
  }

  if (rpcError) {
    console.error("[createInvoice] rpc_create_invoice_with_items failed:", rpcError);
    const code = rpcError.code;
    if (
      code === "23505" ||
      (rpcError.message ?? "").includes("invoices_workspace_invoice_number_unique")
    ) {
      logPostgresUniqueViolation("createInvoice", rpcError, {
        workspaceId: validatedWorkspaceId,
        organizationId,
        invoiceNumber: normalizedInvoiceNumber,
      });
      timer.mark("END");
      return {
        ok: false,
        fieldErrors: {
          invoice_number: "Invoice number already exists. Choose another.",
        },
      };
    }
    if (rpcError.message === "Cannot create invoice for archived client") {
      throw new Error("Cannot create invoice for archived client");
    }
    if (rpcError.message === "Cannot create invoice for inactive client") {
      throw new Error("Cannot create invoice for inactive client");
    }
    if (
      rpcError.message?.includes("line item") ||
      rpcError.message?.includes("Item name") ||
      rpcError.message?.includes("Quantity") ||
      rpcError.message?.includes("Unit price")
    ) {
      throw new Error(`Failed to create invoice items: ${rpcError.message}`);
    }
    throw new Error(`Failed to create invoice: ${rpcError.message}`);
  }

  const invoiceId = (rpcData as { invoice_id?: string } | null)?.invoice_id;
  if (!invoiceId) {
    throw new Error("Failed to create invoice: missing invoice_id from RPC");
  }

  // REMOVED: total_paid, outstanding_amount, payment_state updates
  // These are computed automatically by invoices_view

  // 3) Log audit event with user.id and workspace_id
  timer.mark("AUDIT_START");
  try {
    await logAuditEvent({
      workspaceId: validatedWorkspaceId,
      userId: user.id,
      entityType: "invoice",
      entityId: invoiceId,
      action: "created",
      metadata: {
        invoice_number: parsed.invoiceNumber,
        total: money.total,
        client_id: parsed.clientId,
        status: parsed.status,
      },
    });
    timer.mark("AUDIT_END");
  } catch (error: unknown) {
    timer.markError("AUDIT_END", error);
    throw error;
  }

  timer.mark("REVALIDATE_START");
  try {
    revalidatePath(`/${workspaceId}/invoices`);
    timer.mark("REVALIDATE_END");
  } catch (error: unknown) {
    timer.markError("REVALIDATE_END", error);
    throw error;
  }

  timer.mark("END");
  return invoiceId;
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

  try {
    await assertWorkspaceMutationAllowed(workspaceId, "invoice_update");
  } catch (error) {
    if (error instanceof EntitlementError) {
      return { error: error.message, code: error.code };
    }
    throw error;
  }

  const parsed = InvoiceFormSchema.parse(rawValues);
  const supabase = await supabaseServer();

  // Guard: workspace_id must be present
  if (!validatedWorkspaceId) {
    return { error: "workspace_id is required" };
  }

  // Step 1: Fetch existing invoice to get current values
  const { data: invoiceRow, error: invoiceError } = await supabase
    .from("invoices")
    .select("id, invoice_number, status, issue_date, due_date, client_id, payment_terms, archived_at")
    .eq("id", invoiceId)
    .eq("workspace_id", validatedWorkspaceId)
    .single();

  if (invoiceError || !invoiceRow) {
    return { error: `Failed to load invoice: ${invoiceError?.message}` };
  }

  if (invoiceRow.archived_at) {
    return { error: "Cannot edit an archived invoice. Unarchive it first." };
  }

  const { data: invoiceFinancial, error: invoiceFinancialError } = await supabase
    .from("invoices_view")
    .select("outstanding")
    .eq("id", invoiceId)
    .eq("workspace_id", validatedWorkspaceId)
    .maybeSingle();

  if (invoiceFinancialError) {
    return { error: `Failed to load invoice financial state: ${invoiceFinancialError.message}` };
  }

  if (isInvoiceFullyPaid(invoiceFinancial?.outstanding)) {
    return { error: "Cannot edit a fully paid invoice." };
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
  const issueDate = parsed.issueDate || invoiceRow.issue_date;
  const paymentTermsCode = (parsed.paymentTerms as PaymentTermsCode) || (invoiceRow.payment_terms as PaymentTermsCode);
  // Presets derive days from the code; only custom may supply explicit days.
  const explicitDaysForTerms =
    paymentTermsCode === "custom" ? (parsed.paymentTermsDays ?? null) : null;

  const effectiveDays = resolvePaymentTermsDays(
    paymentTermsCode,
    explicitDaysForTerms,
    clientDefaultDays,
    null // workspace default not available in schema
  );

  // Step 4: Persist submitted due date (authoritative on edit)
  const dueDate = normalizeDateOnlyString(parsed.dueDate);
  if (!dueDate) {
    return { error: "Due date is required" };
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

  // Step 6: Atomically update invoice header and replace line items (single DB transaction)
  const itemsJson = parsed.items.map((item, index) => ({
    name: item.name,
    description: item.description ?? null,
    quantity: item.quantity,
    unit_price: roundCurrency2(Number(item.unit_price)),
    position: index + 1,
  }));

  const { error: rpcError } = await supabase.rpc("rpc_update_invoice_with_items", {
    p_workspace_id: validatedWorkspaceId,
    p_invoice_id: invoiceId,
    p_issue_date: issueDate,
    p_due_date: dueDate,
    p_po_number: parsed.poNumber ?? null,
    p_notes: parsed.notes ?? null,
    p_status: normalizedStatus,
    p_payment_terms: paymentTermsCode,
    p_payment_terms_days: effectiveDays,
    p_subtotal: money.subtotal,
    p_discount_percent: money.discountPercent,
    p_discount_amount: money.discountAmount,
    p_tax_percent: money.taxPercent,
    p_tax_amount: money.taxAmount,
    p_amount: money.total,
    p_items: itemsJson,
  });

  if (rpcError) {
    const message = rpcError.message ?? "Unknown error";
    if (message === "Invoice not found") {
      return { error: `Failed to load invoice: ${message}` };
    }
    if (
      message === "Cannot edit an archived invoice. Unarchive it first." ||
      message === "Cannot edit a fully paid invoice."
    ) {
      return { error: message };
    }
    if (
      message.includes("line item") ||
      message.includes("Item name") ||
      message.includes("Quantity") ||
      message.includes("Unit price") ||
      rpcError.code === "23502" ||
      rpcError.code === "23503"
    ) {
      return { error: `Failed to update invoice items: ${message}` };
    }
    return { error: `Failed to update invoice: ${message}` };
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
  const { user } = await requireUser();
  await requireWorkspace(workspaceId);

  try {
    await assertWorkspaceMutationAllowed(workspaceId, "invoice_delete");
  } catch (error) {
    if (error instanceof EntitlementError) {
      throw new Error(error.message);
    }
    throw error;
  }

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

  try {
    await assertWorkspaceMutationAllowed(workspaceId, "invoice_delete");
  } catch (error) {
    if (error instanceof EntitlementError) {
      return { ok: false, error: error.message };
    }
    throw error;
  }

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

  try {
    await assertWorkspaceMutationAllowed(workspaceId, "invoice_update");
  } catch (error) {
    if (error instanceof EntitlementError) {
      return { ok: false, error: error.message };
    }
    throw error;
  }

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
