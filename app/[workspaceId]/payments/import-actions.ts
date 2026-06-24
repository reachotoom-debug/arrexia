"use server";

/**
 * Server actions for payments CSV import (preview and execute).
 */

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";
import { requireWorkspace } from "@/lib/auth/server";
import { parsePaymentsTSV } from "@/lib/payments/import-utils";
import { validatePaymentImportRow, type PaymentImportRow, type RawPaymentImportRow } from "@/lib/payments/import-schema";

/**
 * Result type for payment import preview
 */
export type PaymentImportPreviewResult = {
  rows: PaymentImportRow[];
  totalRows: number;
  validRows: number;
  invalidRows: number;
  duplicateRows: number;
};

/**
 * Result type for payment import execute
 */
export type PaymentImportExecuteResult = {
  rows: Array<{
    row_id: number;
    payment_id: string | null;
    status: "ok" | "failed";
    error_message: string | null;
  }>;
  totalRows: number;
  successRows: number;
  failedRows: number;
};

/**
 * Preview payment import from TSV file
 * 
 * Validates rows and detects duplicates by (workspace_id, transaction_id) ignoring archived.
 * Resolves invoice_id by invoice_number (workspace scoped).
 * Resolves client_id from invoice.client_id.
 */
export async function import_preview_payments(
  workspaceId: string,
  fileText: string
): Promise<PaymentImportPreviewResult> {
  await requireWorkspace(workspaceId);
  const supabase = await supabaseServer();

  // Parse TSV with strict header validation
  const { rows: rawRows } = parsePaymentsTSV(fileText);

  // Validate and convert rows
  const validatedRows: PaymentImportRow[] = [];
  
  for (let i = 0; i < rawRows.length; i++) {
    const rawRow = rawRows[i];
    const rowOriginal = rawRows[i].join("\t"); // Original row for hash generation
    
    // Convert raw row array to object
    const raw: RawPaymentImportRow = {
      row_id: i + 1,
      "Payment Date": rawRow[0] || "",
      Amount: rawRow[1] || "",
      Currency: rawRow[2] || "",
      Method: rawRow[3] || "",
      Provider: rawRow[4] || "",
      Status: rawRow[5] || "",
      "Invoice Number": rawRow[6] || "",
      "Client Name": rawRow[7] || "", // Ignored for persistence
      "Transaction ID": rawRow[8] || "",
      "Created At": rawRow[9] || "", // Ignored for persistence
      "Archived At": rawRow[10] || "", // Ignored for persistence
      rowOriginal,
    };

    // Validate row structure
    const { row, errors } = validatePaymentImportRow(raw, rowOriginal);
    
    // If basic validation passed, resolve invoice and check duplicates
    if (row.is_valid && !errors.length) {
      try {
        // Resolve invoice_id by invoice_number (workspace scoped)
        const { data: invoice, error: invoiceError } = await supabase
          .from("invoices")
          .select("id, client_id")
          .eq("workspace_id", workspaceId)
          .eq("invoice_number", row.invoice_number.trim())
          .is("archived_at", null)
          .maybeSingle();

        if (invoiceError || !invoice) {
          row.is_valid = false;
          row.error_message = `Invoice not found: ${row.invoice_number}`;
          row.invoice_id = null;
          row.client_id = null;
        } else {
          row.invoice_id = invoice.id;
          row.client_id = invoice.client_id;
        }

        // Check for duplicate transaction_id (ignoring archived)
        if (row.invoice_id && row.transaction_id) {
          const { data: existing, error: duplicateError } = await supabase
            .from("payments")
            .select("id")
            .eq("workspace_id", workspaceId)
            .eq("transaction_id", row.transaction_id)
            .is("archived_at", null)
            .maybeSingle();

          if (!duplicateError && existing) {
            row.is_duplicate = true;
          }
        }
      } catch (error) {
        row.is_valid = false;
        row.error_message = error instanceof Error ? error.message : "Unknown error during validation";
      }
    }

    validatedRows.push(row);
  }

  // Calculate statistics
  const totalRows = validatedRows.length;
  const validRows = validatedRows.filter((r) => r.is_valid && !r.is_duplicate).length;
  const invalidRows = validatedRows.filter((r) => !r.is_valid).length;
  const duplicateRows = validatedRows.filter((r) => r.is_duplicate).length;

  return {
    rows: validatedRows,
    totalRows,
    validRows,
    invalidRows,
    duplicateRows,
  };
}

/**
 * Execute payment import
 * 
 * Rejects any rows with action=fail.
 * Calls Postgres RPC rpc_import_payments(workspace_id, rows_jsonb).
 * Transaction-safe all-or-nothing.
 */
export async function import_execute_payments(
  workspaceId: string,
  rows: PaymentImportRow[]
): Promise<PaymentImportExecuteResult> {
  await requireWorkspace(workspaceId);
  const supabase = await supabaseServer();

  // Filter out invalid rows (reject rows with is_valid=false)
  const validRows = rows.filter((row) => row.is_valid);
  
  if (validRows.length === 0) {
    return {
      rows: [],
      totalRows: 0,
      successRows: 0,
      failedRows: 0,
    };
  }

  // Prepare JSONB rows for RPC call
  const rowsJsonb = validRows.map((row) => ({
    row_id: row.row_id,
    invoice_number: row.invoice_number,
    amount: row.amount,
    currency: row.currency,
    payment_date: row.payment_date,
    method: row.method,
    status: row.status,
    transaction_id: row.transaction_id,
    notes: row.notes,
    payment_provider: row.payment_provider,
  }));

  // Call RPC function
  const { data, error } = await supabase.rpc("rpc_import_payments", {
    p_workspace_id: workspaceId,
    p_rows: rowsJsonb,
  });

  if (error) {
    console.error("[import_execute_payments] RPC error:", error);
    // Return all rows as failed
    return {
      rows: validRows.map((row) => ({
        row_id: row.row_id,
        payment_id: null,
        status: "failed" as const,
        error_message: error.message || "Import failed",
      })),
      totalRows: validRows.length,
      successRows: 0,
      failedRows: validRows.length,
    };
  }

  // Process results
  const resultRows = (data || []).map((result: any) => ({
    row_id: result.row_id as number,
    payment_id: result.payment_id as string | null,
    status: (result.status as "ok" | "failed") || "failed",
    error_message: result.error_message as string | null,
  }));

  const successRows = resultRows.filter((r: { status: string }) => r.status === "ok").length;
  const failedRows = resultRows.filter((r: { status: string }) => r.status === "failed").length;

  // Revalidate paths after successful import to update UI immediately
  if (successRows > 0) {
    revalidatePath(`/${workspaceId}/invoices`);
    revalidatePath(`/${workspaceId}/payments`);
    revalidatePath(`/${workspaceId}/dashboard`);
    // Revalidate invoice detail pages (pattern covers all invoice IDs)
    revalidatePath(`/${workspaceId}/invoices`, "layout");
  }

  return {
    rows: resultRows,
    totalRows: resultRows.length,
    successRows,
    failedRows,
  };
}

