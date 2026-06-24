"use server";

/**
 * Server actions for payments CSV/TSV import (preview and execute).
 */

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";
import { requireWorkspace } from "@/lib/auth/server";
import { parseMMDDYYYY, generateTransactionId } from "@/lib/payments/import-utils";
import { parseDelimited } from "@/lib/import/parseDelimited";
import { PAYMENTS_EXPORT_HEADERS } from "../_constants";

/**
 * Expected headers in exact order (must match export format)
 * This is the source of truth - must match app/api/export/payments/route.ts
 */
const EXPORT_HEADERS = PAYMENTS_EXPORT_HEADERS;

/**
 * Preview row result type
 */
export type PreviewRow = {
  rowId: string;
  rowIndex: number;
  action: "insert" | "update" | "skip" | "fail";
  reason?: string;
  warnings?: string[];
  data: {
    invoice_number: string;
    amount: number;
    currency: string;
    payment_date: string; // YYYY-MM-DD
    method: string | null;
    status: string;
    transaction_id: string;
    payment_provider: string | null;
    invoice_id: string | null;
    client_id: string | null;
  };
};

/**
 * Preview result type
 */
export type PreviewResult = {
  header_ok: boolean;
  ok: boolean;
  errors: string[];
  rows: PreviewRow[];
  normalizedRows?: Array<Record<string, string>>; // Store normalized rows for cleaned file download
  autofixes?: Array<{ rowIndex: number; field: string; original: string; fixed: string; reason: string }>;
  delimiter?: string; // Detected delimiter (for download format)
};

/**
 * Preview payment import from CSV/TSV file
 * 
 * Rules:
 * - Parse using Papa.parse with header:true and skipEmptyLines:true
 * - Auto-detect delimiter (CSV comma or TSV tab)
 * - Remove BOM from first header field if present
 * - Strict header validation (exact order + names)
 * - Parse Payment Date (MM/DD/YYYY → YYYY-MM-DD)
 * - Amount must be numeric > 0
 * - Invoice Number required
 * - Resolve invoice by invoice_number (workspace scoped); if not found → fail row
 * - Ignore Client Name / Created At / Archived At
 * - Status default: "completed"
 * - transaction_id handling:
 *   - If Transaction ID exists → trim and use
 *   - If empty → generate deterministic id: csv:<invoice_number>:<payment_date>:<amount>:<method>:<short_hash>
 * - Detect duplicates by (workspace_id, transaction_id) where archived_at is null
 * - For each row return: { rowId, rowIndex, action: insert|update|skip|fail, reason?, data }
 */
export async function previewPaymentsImport(
  workspaceId: string,
  fileText: string
): Promise<PreviewResult> {
  await requireWorkspace(workspaceId);
  const supabase = await supabaseServer();

  // Parse file using shared parser with autofixes
  // Tolerant parsing: pad missing fields, warn on extra fields
  const parseResult = parseDelimited(fileText, {
    expectedHeaders: EXPORT_HEADERS,
    autoFix: true, // Enable autofixes (e.g., split invoice_number)
    strictColumnCount: false, // Tolerant: pad missing, warn on extra
  });

  const errors: string[] = [...parseResult.errors];
  const autofixes = parseResult.autofixes || [];
  const parseWarnings = parseResult.warnings || [];
  
  // Map parse warnings to row warnings (will be added to individual rows)
  const warningsByRowIndex = new Map<number, string[]>();
  parseWarnings.forEach((w) => {
    if (!warningsByRowIndex.has(w.rowIndex)) {
      warningsByRowIndex.set(w.rowIndex, []);
    }
    warningsByRowIndex.get(w.rowIndex)!.push(w.message);
  });
  
  // Validate headers match export format exactly
  let header_ok = true;
  const mismatches: string[] = [];
  for (let i = 0; i < EXPORT_HEADERS.length; i++) {
    // Skip empty headers (padded columns)
    if (parseResult.headers[i] && parseResult.headers[i] !== EXPORT_HEADERS[i]) {
      mismatches.push(`Column ${i + 1}: Expected "${EXPORT_HEADERS[i]}", got "${parseResult.headers[i]}"`);
      header_ok = false;
    }
  }
  if (!header_ok) {
    errors.push(
      `File does not match exported payments format. Column mismatches: ${mismatches.join("; ")}. Expected columns: ${EXPORT_HEADERS.join(", ")}`
    );
  }

  // If headers don't match, return early
  if (!header_ok) {
    return {
      header_ok: false,
      ok: false,
      errors,
      rows: [],
      normalizedRows: parseResult.rows,
      autofixes,
    };
  }

  const results: PreviewRow[] = [];
  const dataRows = parseResult.rows;

  // Helper function to check if a row is empty (all expected fields are blank after trimming)
  const isEmptyRow = (row: Record<string, string>): boolean => {
    return EXPORT_HEADERS.every((header) => {
      const value = (row[header] || "").trim();
      return value === "";
    });
  };

  // Process each row
  // Note: rowIndex in results reflects the original row number in the file for error reporting
  for (let originalRowIndex = 0; originalRowIndex < dataRows.length; originalRowIndex++) {
    const row = dataRows[originalRowIndex];
    const rowId = `row-${originalRowIndex + 1}`;
    
    // Check if row is empty - mark as skip, not fail
    if (isEmptyRow(row)) {
      results.push({
        rowId,
        rowIndex: originalRowIndex + 1,
        action: "skip",
        reason: "Empty row",
        data: {
          invoice_number: "",
          amount: 0,
          currency: "USD",
          payment_date: "",
          method: null,
          status: "completed",
          transaction_id: "",
          payment_provider: null,
          invoice_id: null,
          client_id: null,
        },
      });
      continue;
    }
    
    // Build rowOriginal for hash generation (use detected delimiter)
    const delimiter = parseResult.delimiter;
    const rowOriginal = EXPORT_HEADERS.map((h) => row[h] || "").join(delimiter);
    
    // Collect warnings for this row (from autofixes and parse warnings)
    const rowWarnings: string[] = [];
    const rowAutofixes = autofixes.filter((af) => af.rowIndex === originalRowIndex + 1);
    if (rowAutofixes.length > 0) {
      rowWarnings.push(...rowAutofixes.map((af) => af.reason));
    }
    // Add parse warnings (e.g., extra columns)
    const parseRowWarnings = warningsByRowIndex.get(originalRowIndex + 1);
    if (parseRowWarnings) {
      rowWarnings.push(...parseRowWarnings);
    }

    // Extract values from parsed row object
    const paymentDateRaw = (row["Payment Date"] || "").trim();
    const amountRaw = (row["Amount"] || "").trim();
    const currencyRaw = (row["Currency"] || "").trim();
    const methodRaw = (row["Method"] || "").trim();
    const providerRaw = (row["Provider"] || "").trim();
    const statusRaw = (row["Status"] || "").trim();
    let invoiceNumberRaw = (row["Invoice Number"] || "").trim();
    const clientNameRaw = (row["Client Name"] || "").trim(); // Ignored
    const transactionIdRaw = (row["Transaction ID"] || "").trim();
    const createdAtRaw = (row["Created At"] || "").trim(); // Ignored
    const archivedAtRaw = (row["Archived At"] || "").trim(); // Ignored

    // Normalize invoice_number: if contains spaces, take first token before space
    // This handles cases like "INV-001 Acme Corp" -> "INV-001"
    const originalInvoiceNumber = row["Invoice Number"] || "";
    if (invoiceNumberRaw && invoiceNumberRaw.includes(" ")) {
      const trimmed = invoiceNumberRaw.split(/\s+/)[0];
      if (!rowWarnings.some(w => w.includes("Trimmed invoice number"))) {
        rowWarnings.push(`Trimmed invoice number from '${originalInvoiceNumber}' → '${trimmed}'`);
      }
      invoiceNumberRaw = trimmed;
    }

    let errorReason: string | undefined = undefined;

    // Validate invoice_number format: must match /^INV-\d+/
    if (!errorReason && invoiceNumberRaw) {
      const invoiceNumberPattern = /^INV-\d+/;
      if (!invoiceNumberPattern.test(invoiceNumberRaw)) {
        errorReason = `Invalid invoice number format: "${invoiceNumberRaw}". Expected format: INV-#### (e.g., INV-0001, INV-1234).`;
      }
    }

    // Detect shifted columns: if invoice_number equals 'completed' or status equals a method, columns are shifted
    if (!errorReason) {
      const commonMethods = ["cash", "bank_transfer", "card", "check", "other"];
      const commonStatuses = ["completed", "pending", "failed", "refunded"];
      
      if (invoiceNumberRaw && commonStatuses.includes(invoiceNumberRaw.toLowerCase())) {
        errorReason = "Row columns are shifted (extra delimiter). Ensure the file matches exported format.";
      } else if (statusRaw && commonMethods.includes(statusRaw.toLowerCase()) && !methodRaw) {
        errorReason = "Row columns are shifted (extra delimiter). Ensure the file matches exported format.";
      }
    }

    // Validate required fields
    let paymentDateISO: string | undefined;
    let amount: number | undefined;
    let invoiceNumber: string | undefined;
    let transactionId: string | undefined;

    if (!errorReason) {
      try {
        // Parse payment date (accepts YYYY-MM-DD, MM/DD/YYYY, M/D/YYYY, DD-MM-YYYY)
        if (!paymentDateRaw) {
          errorReason = "Payment Date is required";
        } else {
          paymentDateISO = parseMMDDYYYY(paymentDateRaw);
        }
      } catch (error) {
        errorReason = error instanceof Error ? error.message : "Invalid payment date format";
      }
    }

    // Parse amount (normalize commas first)
    if (!errorReason) {
      if (!amountRaw) {
        errorReason = "Amount is required";
      } else {
        // Normalize: remove commas, then parse
        const normalizedAmount = amountRaw.replace(/,/g, "");
        const parsedAmount = parseFloat(normalizedAmount);
        if (isNaN(parsedAmount) || parsedAmount <= 0) {
          errorReason = "Amount must be a positive number";
        } else {
          amount = parsedAmount;
        }
      }
    }

    // Validate invoice number (format already checked above)
    if (!errorReason) {
      if (!invoiceNumberRaw) {
        errorReason = "Invoice Number is required";
      } else {
        invoiceNumber = invoiceNumberRaw;
      }
    }

    // Normalize currency: uppercase 3-letter; if blank => workspace default or "USD"
    let currency: string = "USD"; // Default
    if (currencyRaw) {
      const normalizedCurrency = currencyRaw.trim().toUpperCase();
      if (normalizedCurrency.length === 3 && /^[A-Z]{3}$/.test(normalizedCurrency)) {
        currency = normalizedCurrency;
      } else if (normalizedCurrency.length > 0) {
        // Invalid currency format - fail
        errorReason = `Invalid currency: "${currencyRaw}". Must be a 3-letter ISO code (e.g., USD, EUR).`;
      }
    }
    
    // If currency was blank, default to USD
    if (!currencyRaw) {
      currency = "USD";
    }

    // Normalize status: only allow "completed", "pending", "failed" (case-insensitive)
    // Default to "completed" if blank
    let status: string = "completed";
    if (statusRaw) {
      const statusLower = statusRaw.trim().toLowerCase();
      const validStatuses = ["completed", "pending", "failed"];
      if (validStatuses.includes(statusLower)) {
        status = statusLower;
      } else {
        errorReason = `Invalid status: "${statusRaw}". Must be one of: completed, pending, failed.`;
      }
    }

    // If we have errors, mark as fail
    if (errorReason || !paymentDateISO || amount === undefined || !invoiceNumber) {
      results.push({
        rowId,
        rowIndex: originalRowIndex + 1,
        action: "fail",
        reason: errorReason || "Missing required fields",
        warnings: rowWarnings.length > 0 ? rowWarnings : undefined,
        data: {
          invoice_number: invoiceNumberRaw,
          amount: amount || 0,
          currency: currency,
          payment_date: paymentDateISO || "",
          method: methodRaw || null,
          status: status,
          transaction_id: transactionIdRaw || "",
          payment_provider: providerRaw || null,
          invoice_id: null,
          client_id: null,
        },
      });
      continue;
    }

    // At this point, paymentDateISO, amount, and invoiceNumber are guaranteed to be defined
    // Resolve invoice by invoice_number (workspace scoped)
    const { data: invoice, error: invoiceError } = await supabase
      .from("invoices")
      .select("id, client_id")
      .eq("workspace_id", workspaceId)
      .eq("invoice_number", invoiceNumber)
      .is("archived_at", null)
      .maybeSingle();

    if (invoiceError || !invoice) {
      results.push({
        rowId,
        rowIndex: originalRowIndex + 1,
        action: "fail",
        reason: `Invoice not found: ${invoiceNumber}`,
        data: {
          invoice_number: invoiceNumber,
          amount,
          currency: currency,
          payment_date: paymentDateISO,
          method: methodRaw || null,
          status: status,
          transaction_id: transactionIdRaw || "",
          payment_provider: providerRaw || null,
          invoice_id: null,
          client_id: null,
        },
      });
      continue;
    }

    // Handle transaction_id
    if (transactionIdRaw && transactionIdRaw.trim()) {
      transactionId = transactionIdRaw.trim();
    } else {
      // Generate deterministic transaction_id: csv:<invoice_number>:<payment_date>:<amount>:<method>:<short_hash>
      transactionId = generateTransactionId({
        invoice_number: invoiceNumber,
        payment_date_iso: paymentDateISO,
        amount,
        method: methodRaw || null,
        rowOriginal,
      });
    }

    // Detect duplicates by (workspace_id, transaction_id) where archived_at is null
    const { data: existingPayment, error: duplicateError } = await supabase
      .from("payments")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("transaction_id", transactionId)
      .is("archived_at", null)
      .maybeSingle();

    // Determine action
    let action: "insert" | "update" | "skip" | "fail" = "insert";
    let reason: string | undefined;

    if (duplicateError) {
      action = "fail";
      reason = `Error checking for duplicates: ${duplicateError.message}`;
    } else if (existingPayment) {
      action = "update";
    } else {
      action = "insert";
    }

    // Normalize method (optional)
    let method: string | null = null;
    if (methodRaw) {
      const methodLower = methodRaw.toLowerCase();
      if (["cash", "bank_transfer", "card", "check", "other"].includes(methodLower)) {
        method = methodLower;
      }
      // If not valid, leave as null
    }

    results.push({
      rowId,
      rowIndex: originalRowIndex + 1,
      action,
      reason,
        warnings: rowWarnings.length > 0 ? rowWarnings : undefined,
        data: {
          invoice_number: invoiceNumber,
          amount,
          currency: currency, // Use normalized currency
          payment_date: paymentDateISO,
          method,
          status, // Use normalized status
          transaction_id: transactionId,
          payment_provider: providerRaw || null,
          invoice_id: invoice.id,
          client_id: invoice.client_id,
        },
    });
  }

  // Determine overall ok status (no errors and no fail rows)
  const ok = errors.length === 0 && results.every((r) => r.action !== "fail");

  // Build fully normalized rows for cleaned file download (with all normalizations applied)
  // Map results by rowIndex to align with dataRows
  const resultsByRowIndex = new Map<number, PreviewRow>();
  results.forEach((r) => {
    resultsByRowIndex.set(r.rowIndex, r);
  });

  const fullyNormalizedRows: Array<Record<string, string>> = [];
  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    const rowIndex = i + 1; // 1-based row index
    const previewRow = resultsByRowIndex.get(rowIndex);
    
    // Start with the parsed row
    const normalizedRow: Record<string, string> = { ...row };
    
    // Apply all normalizations that were done in preview
    if (previewRow && previewRow.data) {
      // Normalize invoice number (take first token if contains spaces)
      if (normalizedRow["Invoice Number"] && normalizedRow["Invoice Number"].includes(" ")) {
        normalizedRow["Invoice Number"] = normalizedRow["Invoice Number"].split(/\s+/)[0];
      }
      
      // Normalize currency (uppercase)
      if (normalizedRow["Currency"]) {
        normalizedRow["Currency"] = normalizedRow["Currency"].trim().toUpperCase();
      } else {
        normalizedRow["Currency"] = "USD";
      }
      
      // Normalize status (lowercase, default to "completed")
      if (normalizedRow["Status"]) {
        const statusLower = normalizedRow["Status"].trim().toLowerCase();
        if (["completed", "pending", "failed"].includes(statusLower)) {
          normalizedRow["Status"] = statusLower;
        } else {
          normalizedRow["Status"] = "completed"; // Default if invalid
        }
      } else {
        normalizedRow["Status"] = "completed";
      }
      
      // Normalize payment date (convert to YYYY-MM-DD if needed)
      if (normalizedRow["Payment Date"] && previewRow.data.payment_date) {
        normalizedRow["Payment Date"] = previewRow.data.payment_date;
      }
      
      // Normalize method (lowercase)
      if (normalizedRow["Method"]) {
        const methodLower = normalizedRow["Method"].trim().toLowerCase();
        if (["cash", "bank_transfer", "card", "check", "other"].includes(methodLower)) {
          normalizedRow["Method"] = methodLower;
        }
      }
    }
    
    fullyNormalizedRows.push(normalizedRow);
  }

  return {
    header_ok,
    ok,
    errors,
    rows: results,
    normalizedRows: fullyNormalizedRows.length > 0 ? fullyNormalizedRows : parseResult.rows, // Store fully normalized rows for cleaned file download
    autofixes,
    delimiter: parseResult.delimiter, // Store delimiter for download format
  };
}

/**
 * Execute payment import
 * 
 * Rules:
 * - Reject if any row.action === "fail"
 * - Call Postgres RPC rpc_import_payments
 * - Transaction-safe (all-or-nothing)
 * - Return row-level results
 */
export async function executePaymentsImport(
  workspaceId: string,
  rows: PreviewRow[]
): Promise<Array<{
  rowId: string;
  rowIndex: number;
  payment_id: string | null;
  status: "ok" | "failed";
  error_message: string | null;
}>> {
  await requireWorkspace(workspaceId);
  const supabase = await supabaseServer();

  // Reject if any row.action === "fail"
  const failedRows = rows.filter((r) => r.action === "fail");
  if (failedRows.length > 0) {
    return rows.map((row) => ({
      rowId: row.rowId,
      rowIndex: row.rowIndex,
      payment_id: null,
      status: "failed" as const,
      error_message: row.action === "fail" 
        ? row.reason || "Row validation failed"
        : "Import rejected: one or more rows failed validation",
    }));
  }

  // Filter to only rows that should be processed (insert or update)
  const rowsToProcess = rows.filter((r) => r.action === "insert" || r.action === "update");

  if (rowsToProcess.length === 0) {
    return rows.map((row) => ({
      rowId: row.rowId,
      rowIndex: row.rowIndex,
      payment_id: null,
      status: "ok" as const,
      error_message: null,
    }));
  }

  // Prepare JSONB rows for RPC call
  // Include rowId (string) for stable matching with preview results
  const rowsJsonb = rowsToProcess.map((row) => {
    return {
      rowId: row.rowId,  // String identifier for matching results
      row_id: row.rowIndex,  // Keep for backward compatibility
      invoice_number: row.data.invoice_number,
      amount: row.data.amount,
      currency: row.data.currency,
      payment_date: row.data.payment_date,
      method: row.data.method,
      status: row.data.status,
      transaction_id: row.data.transaction_id,
      notes: null, // Notes not in CSV format
      payment_provider: row.data.payment_provider,
    };
  });

  // Call Postgres RPC rpc_import_payments
  // RPC returns TABLE(row, status, payment_id, error) - always an array
  const { data, error } = await supabase.rpc("rpc_import_payments", {
    p_workspace_id: workspaceId,
    p_dry_run: false,
    p_rows: rowsJsonb,
  });

  if (error) {
    console.error("[executePaymentsImport] RPC error:", error);
    // Return all rows as failed
    return rows.map((row) => ({
      rowId: row.rowId,
      rowIndex: row.rowIndex,
      payment_id: null,
      status: "failed" as const,
      error_message: error.message || "Import failed",
    }));
  }

  // RPC succeeded - revalidate paths to update UI immediately
  revalidatePath(`/${workspaceId}/invoices`);
  revalidatePath(`/${workspaceId}/payments`);
  revalidatePath(`/${workspaceId}/dashboard`);
  revalidatePath(`/${workspaceId}/clients`);

  // RPC results shape can vary:
  // 1) Legacy: array
  // 2) New: object { ok: true, results: [...] } or { ok: true, preview: [...] }
  const normalizedResults: unknown[] = Array.isArray(data)
    ? data
    : data && typeof data === "object" && Array.isArray((data as { results?: unknown[] }).results)
      ? (data as { results: unknown[] }).results
      : data && typeof data === "object" && Array.isArray((data as { preview?: unknown[] }).preview)
        ? (data as { preview: unknown[] }).preview
        : [];

  if (process.env.NODE_ENV === "development") {
    console.log(
      "[payments-import] rpc shape",
      Array.isArray(data) ? "array" : typeof data,
      (data as { ok?: boolean } | null)?.ok,
      normalizedResults.length
    );
  }

  // Map RPC results back to preview rows using row_id, NOT array index.
  // Expected DB row shape: { row_id, payment_id, action, error_message }
  const resultMap = new Map<
    number,
    { payment_id: string | null; status: "ok" | "failed"; error_message: string | null }
  >();

  normalizedResults.forEach((result: unknown) => {
    if (!result || typeof result !== "object") return;
    const r = result as Record<string, unknown>;

    // Prefer explicit row_id coming back from DB
    let rowIdNum: number | null = null;
    if (r.row_id !== undefined && r.row_id !== null) {
      const parsed = Number.parseInt(String(r.row_id), 10);
      if (Number.isFinite(parsed)) rowIdNum = parsed;
    }

    // Back-compat: some legacy shapes may return rowId (string)
    if (rowIdNum === null && typeof r.rowId === "string" && r.rowId) {
      const matched = rows.find((row) => row.rowId === r.rowId);
      if (matched) rowIdNum = matched.rowIndex;
    }

    // Back-compat: some RPCs may return 1-based `row` index into p_rows.
    // Convert to the preview rowIndex using the rowsToProcess array.
    if (rowIdNum === null && typeof r.row === "number") {
      const idx = r.row - 1; // 1-based -> 0-based
      const matched = rowsToProcess[idx];
      if (matched) rowIdNum = matched.rowIndex;
    }

    if (rowIdNum === null) return;

    const action = String(r.action ?? "").toUpperCase();
    const status: "ok" | "failed" =
      action === "INSERT" || action === "UPDATE" || action === "SKIP" ? "ok" : "failed";

    resultMap.set(rowIdNum, {
      payment_id: (r.payment_id as string | null) ?? null,
      status,
      error_message: (r.error_message as string | null) ?? null,
    });
  });

  // Return row-level results for all rows
  return rows.map((row, index) => {
    if (row.action === "skip") {
      return {
        rowId: row.rowId,
        rowIndex: row.rowIndex,
        payment_id: null,
        status: "ok" as const,
        error_message: null,
      };
    }

    // Map by row_id (use the preview rowIndex as the join key)
    const result = resultMap.get(row.rowIndex);
    if (result) {
      return {
        rowId: row.rowId,
        rowIndex: row.rowIndex,
        payment_id: result.payment_id,
        status: result.status,
        error_message: result.error_message,
      };
    }

    // No RPC result for this row - explicit error
    return {
      rowId: row.rowId,
      rowIndex: row.rowIndex,
      payment_id: null,
      status: "failed" as const,
      error_message: `No RPC result for row ${index + 1}`,
    };
  });
}


