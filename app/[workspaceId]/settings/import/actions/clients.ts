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
import { supabaseServer } from "@/lib/supabase/server";
import { requireWorkspace } from "@/lib/auth/server";
import Papa from "papaparse";
// CLIENTS_HEADER_COUNT available if needed for strict validation
// import { CLIENTS_HEADER_COUNT } from "../_spec/clients";

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
  data: {
    name: string;
    email: string | null;
    phone: string | null;
    whatsapp_phone: string | null;
    company_name: string | null;
    country: string | null;
    payment_terms_days: number | null;
    status: string | null;
    archived_at: string | null;
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
  delimiter?: string; // Detected delimiter (for download format)
};

/**
 * Check if email is valid
 */
function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email.trim());
}

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

/**
 * Parse payment terms string to extract days (e.g., "30 days" -> 30, "Net 15" -> 15)
 */
function parsePaymentTermsDays(value: string): number | null {
  if (!value) return null;
  const trimmed = value.trim();
  
  // Try direct numeric
  const numericOnly = parseInt(trimmed, 10);
  if (!isNaN(numericOnly) && numericOnly > 0) {
    return numericOnly;
  }
  
  // Try "30 days", "Net 30", "30 Days", etc.
  const match = trimmed.match(/(\d+)\s*(?:days?|net)?/i) || 
                trimmed.match(/net\s*(\d+)/i);
  if (match && match[1]) {
    const days = parseInt(match[1], 10);
    if (!isNaN(days) && days > 0) {
      return days;
    }
  }
  
  return null;
}

/**
 * Parse status value to normalize (Active/Inactive, true/false, yes/no)
 */
function parseStatus(value: string): string | null {
  if (!value) return null;
  const lower = value.trim().toLowerCase();
  
  // Active values
  if (["active", "true", "yes", "1", "enabled"].includes(lower)) {
    return "active";
  }
  
  // Inactive values
  if (["inactive", "false", "no", "0", "disabled"].includes(lower)) {
    return "inactive";
  }
  
  // Archived values
  if (["archived"].includes(lower)) {
    return "archived";
  }
  
  return null;
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
export async function previewClientsImport(
  workspaceId: string,
  fileText: string,
  fileName?: string
): Promise<PreviewResult> {
  await requireWorkspace(workspaceId);
  const supabase = await supabaseServer();

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
  
  // Track column count errors (for TSV validation)
  const columnCountErrors: string[] = [];

  // Helper to get field value by normalized name
  const getField = (row: Record<string, string>, normalizedName: string): string => {
    for (const [rawHeader, mapped] of headerMap.entries()) {
      if (mapped === normalizedName) {
        return (row[rawHeader] || "").trim();
      }
    }
    return "";
  };
  

  // Get raw lines for column count validation (skip header)
  const rawLines = fileText.split(/\r?\n/).slice(1).filter(line => line.trim() !== "");

  // Process each row
  for (let originalRowIndex = 0; originalRowIndex < dataRows.length; originalRowIndex++) {
    const row = dataRows[originalRowIndex];
    const csvRowNumber = originalRowIndex + 2; // +2 for 1-based index + header row
    
    // Column count validation: check if row has correct number of columns
    // Use the raw line to count actual columns (before Papa.parse normalizes)
    if (rawLines[originalRowIndex]) {
      const rawLine = rawLines[originalRowIndex];
      const rawColumnCount = rawLine.split(detectedDelimiter).length;
      
      if (rawColumnCount !== headerCount) {
        const hint = detectedDelimiter === "\t" 
          ? "TSV requires TAB-separated values; check for spaces or missing tabs."
          : "CSV requires comma-separated values; check for extra or missing commas.";
        
        columnCountErrors.push(
          `Row ${csvRowNumber} has ${rawColumnCount} columns, expected ${headerCount}. ${hint}`
        );
      }
    }
    const rowId = `row-${originalRowIndex + 1}`;

    // Check if row is empty - mark as skip, not fail
    if (isEmptyRow(row, headerMap)) {
      results.push({
        rowId,
        rowIndex: originalRowIndex + 1,
        action: "skip",
        reason: "Empty row",
        data: {
          name: "",
          email: null,
          phone: null,
          whatsapp_phone: null,
          company_name: null,
          country: null,
          payment_terms_days: null,
          status: null,
          archived_at: null,
        },
      });
      continue;
    }

    // Extract fields using canonical field names from header map
    const name = getField(row, "name");
    const companyRaw = getField(row, "company");
    const emailRaw = getField(row, "email");
    const phoneRaw = getField(row, "phone");
    const whatsappRaw = getField(row, "whatsapp");
    const countryRaw = getField(row, "country");
    const paymentTermsDaysRaw = getField(row, "payment_terms_days") || getField(row, "payment_terms");
    const statusRaw = getField(row, "status") || getField(row, "is_active");
    const archivedAtRaw = getField(row, "archived_at");

    // Validate name (required)
    if (!name) {
      results.push({
        rowId,
        rowIndex: originalRowIndex + 1,
        action: "fail",
        reason: "Name is required",
        data: {
          name: "",
          email: emailRaw || null,
          phone: phoneRaw || null,
          whatsapp_phone: null,
          company_name: companyRaw || null,
          country: countryRaw || null,
          payment_terms_days: null,
          status: statusRaw || null,
          archived_at: null,
        },
      });
      continue;
    }

    // Validate email if present
    let email: string | null = null;
    if (emailRaw) {
      if (!isValidEmail(emailRaw)) {
        results.push({
          rowId,
          rowIndex: originalRowIndex + 1,
          action: "fail",
          reason: `Invalid email: ${emailRaw}`,
          data: {
            name,
            email: emailRaw,
            phone: phoneRaw || null,
            whatsapp_phone: null,
            company_name: companyRaw || null,
            country: countryRaw || null,
            payment_terms_days: null,
            status: statusRaw || null,
            archived_at: null,
          },
        });
        continue;
      }
      email = emailRaw.toLowerCase().trim();
    }

    // Parse phone (normalize scientific notation like WhatsApp)
    let phone: string | null = null;
    if (phoneRaw) {
      let normalized = phoneRaw.trim();
      // Handle scientific notation (e.g., 1.234E+10 -> 12340000000)
      if (/^[\d.]+[eE][+-]?\d+$/.test(normalized)) {
        const num = parseFloat(normalized);
        if (!isNaN(num)) {
          normalized = num.toFixed(0);
        }
      }
      phone = normalized || null;
    }

    // Parse and normalize whatsapp_phone
    let whatsapp_phone: string | null = null;
    if (whatsappRaw) {
      let normalized = whatsappRaw.trim();
      // Handle scientific notation (e.g., 9.6278E+11 -> 962780000000)
      if (/^[\d.]+[eE][+-]?\d+$/.test(normalized)) {
        const num = parseFloat(normalized);
        if (!isNaN(num)) {
          normalized = num.toFixed(0);
        }
      }
      // Keep leading + if present
      whatsapp_phone = normalized || null;
    }

    // Parse country
    const country: string | null = countryRaw?.trim() || null;
    
    // Parse payment terms days
    const payment_terms_days = parsePaymentTermsDays(paymentTermsDaysRaw);

    // Parse status (using the helper function for Active/Inactive, true/false, etc.)
    const status: string | null = parseStatus(statusRaw);
    
    // Parse archived_at
    let archived_at: string | null = null;
    if (archivedAtRaw) {
      archived_at = archivedAtRaw.trim(); // Keep as string, RPC will parse
    }

    const company_name = companyRaw?.trim() || null;

    // Determine action based on duplicate detection (email OR whatsapp_phone)
    let action: "insert" | "update" | "fail" = "insert";
    let reason: string | undefined;
    const warnings: string[] = [];

    // Check for existing clients by email (workspace-scoped, case-insensitive, non-archived)
    if (email) {
      const { data: allClientsWithEmail, error: queryError } = await supabase
        .from("clients")
        .select("id, email")
        .eq("workspace_id", workspaceId)
        .is("archived_at", null)
        .not("email", "is", null);
      
      if (queryError) {
        results.push({
          rowId,
          rowIndex: originalRowIndex + 1,
          action: "fail",
          reason: `Database error checking duplicates: ${queryError.message}`,
          data: {
            name,
            email,
            phone,
            whatsapp_phone,
            company_name,
            country,
            payment_terms_days,
            status,
            archived_at,
          },
        });
        continue;
      }

      const existingByEmail = allClientsWithEmail?.filter((c: any) => 
        c.email?.toLowerCase() === email
      ) || [];

      if (existingByEmail.length > 1) {
        // Multiple matches - fail (data quality issue)
        results.push({
          rowId,
          rowIndex: originalRowIndex + 1,
          action: "fail",
          reason: "Multiple existing clients found with this email; clean up first",
          data: {
            name,
            email,
            phone,
            whatsapp_phone,
            company_name,
            country,
            payment_terms_days,
            status,
            archived_at,
          },
        });
        continue;
      } else if (existingByEmail.length === 1) {
        action = "update";
      }
    }

    // If no match by email, check by whatsapp_phone
    if (action === "insert" && whatsapp_phone) {
      const { data: clientsByWhatsApp, error: queryError } = await supabase
        .from("clients")
        .select("id, whatsapp_phone")
        .eq("workspace_id", workspaceId)
        .is("archived_at", null)
        .eq("whatsapp_phone", whatsapp_phone);

      if (queryError) {
        results.push({
          rowId,
          rowIndex: originalRowIndex + 1,
          action: "fail",
          reason: `Database error checking duplicates: ${queryError.message}`,
          data: {
            name,
            email,
            phone,
            whatsapp_phone,
            company_name,
            country,
            payment_terms_days,
            status,
            archived_at,
          },
        });
        continue;
      }

      if (clientsByWhatsApp && clientsByWhatsApp.length > 0) {
        action = "update";
      }
    }

    // If no email and no whatsapp_phone, warn but allow insert
    if (!email && !whatsapp_phone) {
      warnings.push("No email or WhatsApp; cannot dedupe");
    }

    results.push({
      rowId,
      rowIndex: originalRowIndex + 1,
      action,
      reason,
      warnings: warnings.length > 0 ? warnings : undefined,
      data: {
        name,
        email,
        phone,
        whatsapp_phone,
        company_name,
        country,
        payment_terms_days,
        status,
        archived_at,
      },
    });
  }

  // Add column count errors to the errors array
  if (columnCountErrors.length > 0) {
    // Limit to first 10 errors to avoid overwhelming the UI
    const limitedErrors = columnCountErrors.slice(0, 10);
    errors.push(...limitedErrors);
    if (columnCountErrors.length > 10) {
      errors.push(`... and ${columnCountErrors.length - 10} more column count errors`);
    }
  }
  
  // Add warnings to errors (prefixed for display)
  if (warnings.length > 0) {
    errors.push(...warnings.map(w => `Warning: ${w}`));
  }
  
  const ok = errors.length === 0 && 
             columnCountErrors.length === 0 && 
             results.every((r) => r.action !== "fail");

  // Store normalized rows (using original headers as keys)
  const normalizedRows: Array<Record<string, string>> = [];
  if (parsedData && parsedData.data) {
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
  const supabase = await supabaseServer();

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

  // Prepare JSONB rows for RPC call
  // Include rowId (string) for stable matching with preview results
  const rowsJsonb = rowsToProcess.map((row) => ({
    rowId: row.rowId,
    action: row.action,
    name: row.data.name,
    email: row.data.email,
    phone: row.data.phone,
    whatsapp_phone: row.data.whatsapp_phone,
    company_name: row.data.company_name,
    country: row.data.country,
    payment_terms: row.data.payment_terms_days, // RPC expects payment_terms (numeric days)
    status: row.data.status,
    archived_at: row.data.archived_at,
  }));

  // Call Postgres RPC rpc_import_clients
  const { data, error } = await supabase.rpc("rpc_import_clients", {
    p_workspace_id: workspaceId,
    p_rows: rowsJsonb,
  });

  // Only treat RPC call failure as error (not per-row failures)
  if (error) {
    console.error("[executeClientsImport] RPC call error:", error);
    // This is a real RPC failure (workspace not found, etc.)
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

  // RPC succeeded - data contains results for all rows (some may have status='failed')
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

  // RPC succeeded - revalidate paths to update UI immediately
  revalidatePath(`/${workspaceId}/clients`);
  revalidatePath(`/${workspaceId}/invoices`);
  revalidatePath(`/${workspaceId}/dashboard`);

  // Map RPC results back to row IDs
  // RPC returns JSONB array: [{ rowId, status: 'ok'|'failed', action, client_id, error }]
  // RPC returns a result for EVERY input row (even failed ones)
  const resultMap = new Map<string, { client_id: string | null; status: "ok" | "failed"; error_message: string | null }>();
  
  data.forEach((result: any) => {
    const rowId = result.rowId as string;
    if (rowId) {
      // Map RPC status ('ok'|'failed') to our status type
      const rpcStatus = result.status as string;
      const mappedStatus = (rpcStatus === "ok" ? "ok" : "failed") as "ok" | "failed";
      
      resultMap.set(rowId, {
        client_id: result.client_id as string | null,
        status: mappedStatus,
        error_message: result.error as string | null,
      });
    }
  });

  // Return row-level results for all rows
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

    // No RPC result for this rowId - explicit error
    return {
      rowId: row.rowId,
      rowIndex: row.rowIndex,
      client_id: null,
      status: "failed" as const,
      error_message: `No RPC result for rowId=${row.rowId}`,
    };
  });

  const ok = results.every((r) => r.status === "ok");

  return {
    ok,
    results,
    errors: [],
  };
}

