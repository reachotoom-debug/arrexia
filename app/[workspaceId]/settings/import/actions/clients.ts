"use server";

/**
 * Server actions for clients CSV/TSV import (preview and execute).
 * 
 * Parser rules:
 * - Only "Name" is required
 * - Accepts header aliases (case-insensitive, trimmed)
 * - Missing columns treated as null
 * - Unknown columns are ignored
 * - Column count validation per row
 * - TSV delimiter detection with warnings
 * 
 * Canonical headers (8 columns):
 * Name, Email, Company, Country, Phone, WhatsApp, Payment Terms Days, Status
 */

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireWorkspace } from "@/lib/auth/server";
import { assertImportEntitlement } from "@/lib/billing/entitlementGuard";
import { EntitlementError } from "@/lib/billing/entitlementErrors";
import {
  MAX_CLIENT_IMPORT_ROWS,
  CLIENT_IMPORT_ROW_LIMIT_MESSAGE,
  normalizeClientImportEmail,
  normalizeClientImportPhone,
  parseClientImportPaymentTermsDays,
  parseClientImportStatus,
  type ClientImportRowData,
} from "@/lib/import/clientImportContract";
import Papa from "papaparse";

/**
 * Header alias mapping: normalized header -> canonical field name
 * Normalized means: trimmed, lowercased, spaces/underscores/dashes/slashes removed
 * 
 * Supported aliases per field:
 * - Name: ["Name", "Client Name", "client_name", "Customer Name", "Customer"]
 * - Email: ["Email", "Client Email", "email", "Email Address"]
 * - Company: ["Company", "Company Name", "company", "Organization"]
 * - Country: ["Country", "country", "Country Name"]
 * - Phone: ["Phone", "Business phone", "phone", "Phone Number", "Telephone"]
 * - WhatsApp: ["WhatsApp", "Whatsapp", "whatsapp", "WhatsApp Phone"]
 * - Payment Terms Days: ["Payment Terms Days", "Payment Terms", "payment_terms_days", "Net Days"]
 * - Status: ["Status", "status", "Is Active", "is_active"]
 */
const HEADER_ALIASES: Record<string, string> = {
  // Name field (required)
  "name": "name",
  "clientname": "name",
  "customername": "name",
  "customer": "name",
  
  // Email field
  "email": "email",
  "emailaddress": "email",
  "clientemail": "email",
  
  // Company field
  "company": "company",
  "companyname": "company",
  "organization": "company",
  
  // Country field
  "country": "country",
  "countryname": "country",
  
  // Phone field
  "phone": "phone",
  "phonenumber": "phone",
  "businessphone": "phone",
  "telephone": "phone",
  "tel": "phone",
  "mobile": "phone",
  
  // WhatsApp field
  "whatsapp": "whatsapp",
  "whatsappphone": "whatsapp",
  
  // Payment Terms field
  "paymentterms": "payment_terms",
  "paymenttermsdays": "payment_terms_days",
  "netdays": "payment_terms_days",
  
  // Status field
  "status": "status",
  "isactive": "is_active",
  
  // Archived At field (for export/re-import, ignored)
  "archivedat": "archived_at",
  
  // ID field (ignored but recognized)
  "id": "id",
  
  // Created At field (ignored but recognized)
  "createdat": "created_at",
  
  // Currency field (recognized for backward compatibility, ignored)
  "currency": "currency",
};

/**
 * Preview row result type
 */
export type PreviewRow = {
  rowId: string;
  rowIndex: number;
  action: "insert" | "update" | "skip" | "fail";
  reason?: string;
  warnings?: string[];
  data: ClientImportRowData;
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
  delimiter?: string; // Detected delimiter (for download format)
};

/**
 * Normalize header name (trim, lowercase, remove spaces/underscores/slashes)
 */
function normalizeHeader(header: string): string {
  return header
    .replace(/^\uFEFF/, "") // Remove BOM
    .trim()
    .toLowerCase()
    .replace(/[\s_\-\/]/g, ""); // Remove spaces, underscores, dashes, slashes
}

/**
 * Map a normalized header to its canonical field name using aliases
 */
function mapHeaderToCanonical(normalized: string): string | null {
  return HEADER_ALIASES[normalized] || null;
}

function emptyClientRowData(): ClientImportRowData {
  return {
    name: "",
    email: null,
    phone: null,
    whatsapp: null,
    company: null,
    country: null,
    payment_terms_days: null,
    status: null,
    archived_at: null,
  };
}

/**
 * Check if row is empty (name field is empty)
 */
function isEmptyRow(row: Record<string, string>, headerMap: Map<string, string>): boolean {
  // Find the header that maps to "name"
  for (const [rawHeader, canonical] of headerMap.entries()) {
    if (canonical === "name") {
      const value = (row[rawHeader] || "").trim();
      return value === "";
    }
  }
  // No name header found, treat as empty
  return true;
}

/**
 * Preview client import from CSV/TSV file
 * 
 * Parser rules:
 * - Parse using Papa.parse with header:true and skipEmptyLines:true
 * - Auto-detect delimiter (CSV comma or TSV tab)
 * - Remove BOM from first header field if present
 * - Validate column count per row (must match header count)
 * - name: required
 * - email: optional but if present must be valid email
 * - whatsapp_phone: optional (from "WhatsApp" header)
 * - is_active: derived from Status (Active => true, Inactive => false, default true)
 * - Ignore archived_at and Created At inputs
 * - Duplicate detection by email or whatsapp_phone (workspace-scoped)
 * - For each row return: { rowId, rowIndex, action: insert|update|skip|fail, reason?, warnings?, data }
 */
type ClientImportRpcClassifyRow = {
  rowId: string;
  status: "ok" | "failed";
  action: "insert" | "update" | "fail";
  client_id?: string | null;
  error?: string | null;
};

function buildClientImportRpcPayload(row: {
  rowId: string;
  data: ClientImportRowData;
}): Record<string, unknown> {
  return {
    rowId: row.rowId,
    name: row.data.name,
    email: row.data.email,
    phone: row.data.phone,
    whatsapp_phone: row.data.whatsapp,
    company_name: row.data.company,
    country: row.data.country,
    payment_terms: row.data.payment_terms_days,
    status: row.data.status,
    archived_at: row.data.archived_at,
  };
}

async function classifyClientImportRowsViaRpc(
  workspaceId: string,
  rows: Array<{ rowId: string; data: ClientImportRowData }>
): Promise<{ ok: true; rows: ClientImportRpcClassifyRow[] } | { ok: false; error: string }> {
  if (rows.length === 0) {
    return { ok: true, rows: [] };
  }

  const { data, error } = await supabaseAdmin().rpc("internal_rpc_import_clients", {
    p_workspace_id: workspaceId,
    p_rows: rows.map(buildClientImportRpcPayload),
    p_dry_run: true,
  });

  if (error) {
    return { ok: false, error: error.message || "Client import classification failed" };
  }

  if (!Array.isArray(data)) {
    return { ok: false, error: "Client import classification returned invalid data" };
  }

  return { ok: true, rows: data as ClientImportRpcClassifyRow[] };
}

export async function previewClientsImport(
  workspaceId: string,
  fileText: string,
  fileName?: string
): Promise<PreviewResult> {
  await requireWorkspace(workspaceId);

  const errors: string[] = [];
  const warnings: string[] = [];
  let header_ok = false;
  let parsedData: Papa.ParseResult<any> | null = null;
  let detectedDelimiter: string = ",";

  // Detect if this looks like a TSV file (by extension or content)
  const isTsvFileName = fileName?.toLowerCase().endsWith(".tsv");
  const firstLine = fileText.split(/\r?\n/)[0] || "";
  const hasTabsInFirstLine = firstLine.includes("\t");
  const hasCommasInFirstLine = firstLine.includes(",");
  
  // TSV detection: if file is .tsv but has commas and no tabs, warn
  if (isTsvFileName && hasCommasInFirstLine && !hasTabsInFirstLine) {
    warnings.push("File has .tsv extension but uses comma delimiter. Treating as CSV.");
  }
  
  // Determine delimiter
  if (hasTabsInFirstLine) {
    detectedDelimiter = "\t";
  } else if (hasCommasInFirstLine) {
    detectedDelimiter = ",";
  }
  
  // DEV logging
  if (process.env.NODE_ENV === "development") {
    console.log("[previewClientsImport] Delimiter detection:", {
      fileName,
      isTsvFileName,
      hasTabsInFirstLine,
      hasCommasInFirstLine,
      detectedDelimiter: detectedDelimiter === "\t" ? "TAB" : "COMMA",
    });
  }

  // Parse CSV/TSV using Papa.parse with detected delimiter
  try {
    parsedData = Papa.parse(fileText, {
      header: true,
      skipEmptyLines: true,
      delimiter: detectedDelimiter,
      transformHeader: (header: string) => {
        // Remove BOM (Byte Order Mark) if present and trim
        return header.replace(/^\uFEFF/, "").trim();
      },
    });

    if (parsedData.errors.length > 0) {
      // Filter out "too few/many fields" errors - we handle these ourselves
      const otherErrors = parsedData.errors.filter(
        e => !e.message.includes("Too few fields") && !e.message.includes("Too many fields")
      );
      errors.push(...otherErrors.map((e) => `Parse error (row ${e.row ?? "?"}): ${e.message}`));
    }
  } catch (parseError) {
    errors.push(parseError instanceof Error ? parseError.message : "Failed to parse file");
    return {
      header_ok: false,
      ok: false,
      errors,
      rows: [],
    };
  }

  if (!parsedData || !parsedData.meta.fields) {
    errors.push("Failed to parse file headers");
    return {
      header_ok: false,
      ok: false,
      errors,
      rows: [],
    };
  }

  // Normalize headers (remove BOM and trim)
  const rawHeaders = parsedData.meta.fields.map((h) => h.replace(/^\uFEFF/, "").trim());
  const headerCount = rawHeaders.length;

  // Build header map: raw header -> canonical field name
  // Maps each detected header to its canonical field name using aliases
  const headerMap = new Map<string, string>();
  const canonicalFields = new Set<string>();
  const unmappedHeaders: string[] = [];
  
  // DEV logging: track detected and mapped headers
  const detectedHeaders: string[] = [];
  const mappedHeaders: Record<string, string> = {};
  
  for (const rawHeader of rawHeaders) {
    const normalized = normalizeHeader(rawHeader);
    const canonical = mapHeaderToCanonical(normalized);
    
    detectedHeaders.push(rawHeader);
    
    if (canonical) {
      headerMap.set(rawHeader, canonical);
      canonicalFields.add(canonical);
      mappedHeaders[rawHeader] = canonical;
    } else {
      // Unknown header - will be ignored
      unmappedHeaders.push(rawHeader);
    }
  }
  
  // DEV logging: log detected and mapped headers
  if (process.env.NODE_ENV === "development") {
    console.log("[previewClientsImport] Header mapping:", {
      detectedHeaders,
      mappedHeaders,
      unmappedHeaders: unmappedHeaders.length > 0 ? unmappedHeaders : "(none)",
      canonicalFields: Array.from(canonicalFields),
    });
  }

  // Validate required headers: only "name" is required
  if (!canonicalFields.has("name")) {
    errors.push("Required header 'Name' is missing. Accepted aliases: Name, Client Name, Customer Name, Customer");
    header_ok = false;
  } else {
    header_ok = true;
  }
  
  // Add info about unmapped headers (as warning, not error)
  if (unmappedHeaders.length > 0 && process.env.NODE_ENV === "development") {
    console.log(`[previewClientsImport] Ignoring ${unmappedHeaders.length} unknown column(s): ${unmappedHeaders.join(", ")}`);
  }

  if (!header_ok) {
    return {
      header_ok: false,
      ok: false,
      errors,
      rows: [],
    };
  }

  const results: PreviewRow[] = [];
  const dataRows = parsedData.data as Array<Record<string, string>>;

  const nonEmptyRowCount = dataRows.filter((row) => !isEmptyRow(row, headerMap)).length;
  if (nonEmptyRowCount > MAX_CLIENT_IMPORT_ROWS) {
    errors.push(CLIENT_IMPORT_ROW_LIMIT_MESSAGE);
    return {
      header_ok: true,
      ok: false,
      errors,
      rows: [],
    };
  }

  const columnCountErrors: string[] = [];

  const getField = (row: Record<string, string>, normalizedName: string): string => {
    for (const [rawHeader, mapped] of headerMap.entries()) {
      if (mapped === normalizedName) {
        return (row[rawHeader] || "").trim();
      }
    }
    return "";
  };

  const rawLines = fileText.split(/\r?\n/).slice(1).filter((line) => line.trim() !== "");

  type ParsedImportRow = {
    lineNumber: number;
    rowId: string;
    rowIndex: number;
    data: ClientImportRowData;
  };

  const parsedRows: ParsedImportRow[] = [];

  for (let originalRowIndex = 0; originalRowIndex < dataRows.length; originalRowIndex++) {
    const row = dataRows[originalRowIndex];
    const csvRowNumber = originalRowIndex + 2;
    const rowId = `row-${originalRowIndex + 1}`;

    if (rawLines[originalRowIndex]) {
      const rawLine = rawLines[originalRowIndex];
      const rawColumnCount = rawLine.split(detectedDelimiter).length;
      if (rawColumnCount !== headerCount) {
        const hint =
          detectedDelimiter === "\t"
            ? "TSV requires TAB-separated values; check for spaces or missing tabs."
            : "CSV requires comma-separated values; check for extra or missing commas.";
        columnCountErrors.push(
          `Row ${csvRowNumber} has ${rawColumnCount} columns, expected ${headerCount}. ${hint}`
        );
      }
    }

    if (isEmptyRow(row, headerMap)) {
      results.push({
        rowId,
        rowIndex: originalRowIndex + 1,
        action: "skip",
        reason: "Empty row",
        data: emptyClientRowData(),
      });
      continue;
    }

    const name = getField(row, "name");
    const companyRaw = getField(row, "company");
    const emailRaw = getField(row, "email");
    const phoneRaw = getField(row, "phone");
    const whatsappRaw = getField(row, "whatsapp");
    const countryRaw = getField(row, "country");
    const paymentTermsDaysRaw =
      getField(row, "payment_terms_days") || getField(row, "payment_terms");
    const statusRaw = getField(row, "status") || getField(row, "is_active");
    const archivedAtRaw = getField(row, "archived_at");

    const rowData: ClientImportRowData = {
      name,
      email: null,
      phone: null,
      whatsapp: null,
      company: companyRaw || null,
      country: countryRaw || null,
      payment_terms_days: null,
      status: null,
      archived_at: archivedAtRaw || null,
    };

    if (!name) {
      results.push({
        rowId,
        rowIndex: originalRowIndex + 1,
        action: "fail",
        reason: "Name is required",
        data: rowData,
      });
      continue;
    }

    if (emailRaw) {
      const normalizedEmail = normalizeClientImportEmail(emailRaw);
      if (!normalizedEmail) {
        results.push({
          rowId,
          rowIndex: originalRowIndex + 1,
          action: "fail",
          reason: `Invalid email: ${emailRaw}`,
          data: { ...rowData, email: emailRaw },
        });
        continue;
      }
      rowData.email = normalizedEmail;
    }

    if (phoneRaw) {
      rowData.phone = normalizeClientImportPhone(phoneRaw);
    }

    if (whatsappRaw) {
      rowData.whatsapp = normalizeClientImportPhone(whatsappRaw);
    }

    if (paymentTermsDaysRaw) {
      rowData.payment_terms_days = parseClientImportPaymentTermsDays(paymentTermsDaysRaw);
      if (rowData.payment_terms_days === null) {
        results.push({
          rowId,
          rowIndex: originalRowIndex + 1,
          action: "fail",
          reason: `Invalid payment terms: ${paymentTermsDaysRaw}`,
          data: rowData,
        });
        continue;
      }
    }

    if (statusRaw) {
      const parsedStatus = parseClientImportStatus(statusRaw);
      if (!parsedStatus) {
        results.push({
          rowId,
          rowIndex: originalRowIndex + 1,
          action: "fail",
          reason: `Invalid status: ${statusRaw} (use Active, Inactive, or Archived)`,
          data: rowData,
        });
        continue;
      }
      rowData.status = parsedStatus;
    }

    parsedRows.push({
      lineNumber: csvRowNumber,
      rowId,
      rowIndex: originalRowIndex + 1,
      data: rowData,
    });
  }

  const classification = await classifyClientImportRowsViaRpc(workspaceId, parsedRows);
  if (!classification.ok) {
    errors.push(classification.error);
    return {
      header_ok: true,
      ok: false,
      errors,
      rows: results,
    };
  }

  const classificationByRowId = new Map(
    classification.rows.map((row) => [row.rowId, row])
  );

  for (const parsed of parsedRows) {
    const classified = classificationByRowId.get(parsed.rowId);
    if (!classified) {
      results.push({
        rowId: parsed.rowId,
        rowIndex: parsed.rowIndex,
        action: "fail",
        reason: `No classification result for ${parsed.rowId}`,
        data: parsed.data,
      });
      continue;
    }

    const rowWarnings: string[] = [];
    const isFail =
      classified.action === "fail" || classified.status === "failed";
    const action: PreviewRow["action"] = isFail
      ? "fail"
      : classified.action === "update"
        ? "update"
        : "insert";

    if (
      action === "insert" &&
      !parsed.data.email &&
      !parsed.data.whatsapp &&
      !parsed.data.phone
    ) {
      rowWarnings.push("No email or WhatsApp; cannot dedupe on re-import");
    }

    results.push({
      rowId: parsed.rowId,
      rowIndex: parsed.rowIndex,
      action,
      reason: isFail ? classified.error ?? "Import row rejected" : undefined,
      warnings: rowWarnings.length > 0 ? rowWarnings : undefined,
      data: parsed.data,
    });
  }

  results.sort((a, b) => a.rowIndex - b.rowIndex);

  if (columnCountErrors.length > 0) {
    const limitedErrors = columnCountErrors.slice(0, 10);
    errors.push(...limitedErrors);
    if (columnCountErrors.length > 10) {
      errors.push(`... and ${columnCountErrors.length - 10} more column count errors`);
    }
  }

  const ok =
    errors.length === 0 &&
    columnCountErrors.length === 0 &&
    results.every((r) => r.action !== "fail");

  const normalizedRows: Array<Record<string, string>> = [];
  if (parsedData?.data) {
    parsedData.data.forEach((row: Record<string, string>) => {
      const normalizedRow: Record<string, string> = {};
      for (const rawHeader of rawHeaders) {
        normalizedRow[rawHeader] = (row[rawHeader] || "").trim();
      }
      normalizedRows.push(normalizedRow);
    });
  }

  return {
    header_ok,
    ok,
    errors,
    rows: results,
    normalizedRows,
    delimiter: detectedDelimiter,
  };
}

/**
 * Execute client import
 * 
 * Rules:
 * - Reject if any row.action === "fail"
 * - Call Postgres RPC rpc_import_clients
 * - Transaction-safe (all-or-nothing)
 * - Return row-level results
 */
export async function executeClientsImport(
  workspaceId: string,
  rows: PreviewRow[]
): Promise<{
  ok: boolean;
  results: Array<{
    rowId: string;
    rowIndex: number;
    client_id: string | null;
    status: "ok" | "failed";
    error_message: string | null;
  }>;
  errors: string[];
}> {
  await requireWorkspace(workspaceId);

  // Reject if any row.action === "fail"
  const failedRows = rows.filter((r) => r.action === "fail");
  if (failedRows.length > 0) {
    return {
      ok: false,
      results: rows.map((row) => ({
        rowId: row.rowId,
        rowIndex: row.rowIndex,
        client_id: null,
        status: "failed" as const,
        error_message: row.action === "fail" 
          ? row.reason || "Row validation failed"
          : "Import rejected: one or more rows failed validation",
      })),
      errors: ["Import rejected: one or more rows failed validation"],
    };
  }

  // Filter to only rows that should be processed (insert or update)
  const rowsToProcess = rows.filter((r) => r.action === "insert" || r.action === "update");

  if (rowsToProcess.length === 0) {
    return {
      ok: true,
      results: rows.map((row) => ({
        rowId: row.rowId,
        rowIndex: row.rowIndex,
        client_id: null,
        status: "ok" as const,
        error_message: null,
      })),
      errors: [],
    };
  }

  const newClients = rowsToProcess.filter((row) => row.action === "insert").length;
  try {
    await assertImportEntitlement(workspaceId, { newClients, newInvoices: 0 });
  } catch (error) {
    if (error instanceof EntitlementError) {
      return {
        ok: false,
        results: rows.map((row) => ({
          rowId: row.rowId,
          rowIndex: row.rowIndex,
          client_id: null,
          status: "failed" as const,
          error_message: error.message,
        })),
        errors: [error.message],
      };
    }
    throw error;
  }

  // Prepare JSONB rows for RPC call (action from authoritative preview classification)
  const rowsJsonb = rowsToProcess.map((row) => ({
    rowId: row.rowId,
    action: row.action,
    name: row.data.name,
    email: row.data.email,
    phone: row.data.phone,
    whatsapp_phone: row.data.whatsapp,
    company_name: row.data.company,
    country: row.data.country,
    payment_terms: row.data.payment_terms_days,
    status: row.data.status,
    archived_at: row.data.archived_at,
  }));

  const { data, error } = await supabaseAdmin().rpc("rpc_import_clients", {
    p_workspace_id: workspaceId,
    p_rows: rowsJsonb,
  });

  if (error) {
    console.error("[executeClientsImport] RPC call error:", error);
    return {
      ok: false,
      results: rows.map((row) => ({
        rowId: row.rowId,
        rowIndex: row.rowIndex,
        client_id: null,
        status: "failed" as const,
        error_message: error.message || "RPC call failed",
      })),
      errors: [error.message || "RPC call failed"],
    };
  }

  if (!data || !Array.isArray(data)) {
    console.error("[executeClientsImport] RPC returned invalid data:", data);
    return {
      ok: false,
      results: rows.map((row) => ({
        rowId: row.rowId,
        rowIndex: row.rowIndex,
        client_id: null,
        status: "failed" as const,
        error_message: "RPC returned invalid data",
      })),
      errors: ["RPC returned invalid data"],
    };
  }

  if (
    data.length === 1 &&
    data[0]?.status === "failed" &&
    data[0]?.rowId === "0"
  ) {
    const batchError =
      (data[0]?.error as string | undefined) || "Client import validation failed";
    return {
      ok: false,
      results: rows.map((row) => ({
        rowId: row.rowId,
        rowIndex: row.rowIndex,
        client_id: null,
        status: "failed" as const,
        error_message: batchError,
      })),
      errors: [batchError],
    };
  }

  const resultMap = new Map<
    string,
    {
      client_id: string | null;
      status: "ok" | "failed";
      error_message: string | null;
    }
  >();

  data.forEach((result: Record<string, unknown>) => {
    const rowId = result.rowId as string;
    if (!rowId) return;

    const rpcStatus = result.status as string;
    const mappedStatus = (rpcStatus === "ok" ? "ok" : "failed") as "ok" | "failed";
    const clientId =
      (result.client_id as string | null | undefined) ??
      (result.entity_id as string | null | undefined) ??
      null;

    resultMap.set(rowId, {
      client_id: clientId,
      status: mappedStatus,
      error_message: (result.error as string | null | undefined) ?? null,
    });
  });

  const results = rows.map((row) => {
    if (row.action === "skip") {
      return {
        rowId: row.rowId,
        rowIndex: row.rowIndex,
        client_id: null,
        status: "ok" as const,
        error_message: null,
      };
    }

    const result = resultMap.get(row.rowId);
    if (result) {
      return {
        rowId: row.rowId,
        rowIndex: row.rowIndex,
        client_id: result.client_id,
        status: result.status,
        error_message: result.error_message,
      };
    }

    return {
      rowId: row.rowId,
      rowIndex: row.rowIndex,
      client_id: null,
      status: "failed" as const,
      error_message: `No RPC result for rowId=${row.rowId}`,
    };
  });

  const ok = results.every((r) => r.status === "ok");

  if (ok) {
    revalidatePath(`/${workspaceId}/clients`);
    revalidatePath(`/${workspaceId}/invoices`);
    revalidatePath(`/${workspaceId}/dashboard`);
  }

  return {
    ok,
    results,
    errors: ok ? [] : ["One or more rows failed to import"],
  };
}

