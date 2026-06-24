"use server";

/**
 * Server actions for invoices CSV/TSV import (preview and execute).
 * Supports grouped CSV format: invoice header rows + item rows.
 * 
 * Grouped format:
 * - Row Type = "invoice" or "item"
 * - Invoice Number required for both row types
 * - Invoice row: Client Name, Client Email, Issue Date, Due Date, Currency, Status, PO Number, Notes
 * - Item row: Item Description, Quantity, Unit Price, Amount (computed if blank)
 * 
 * Idempotency key: invoice_number + workspace_id
 */

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";
import { requireWorkspace } from "@/lib/auth/server";
import { 
  INVOICE_GROUPED_HEADERS, 
  INVOICE_HEADER_COUNT,
  HEADER_DISPLAY_NAMES,
  type InvoiceGroupPayload, 
  type PreviewRow, 
  type PreviewResult 
} from "../_lib/invoicesGroupedFormat";
import { parseDelimited } from "@/lib/import/parseDelimited";

/**
 * Dev-only logging helper
 */
function devLog(label: string, data: Record<string, unknown>): void {
  if (process.env.NODE_ENV === "development") {
    console.log(`[invoices-import] ${label}:`, JSON.stringify(data, null, 2));
  }
}

/**
 * Clients CSV headers (for wrong-file detection)
 */
const CLIENTS_HEADERS = ["name", "email", "company", "whatsapp", "status"];

/**
 * Payments CSV headers (for wrong-file detection)
 */
const PAYMENTS_HEADERS = ["payment date", "amount", "currency", "method", "invoice number"];


/**
 * Canonical header names (required)
 */
const REQUIRED_CANONICAL_HEADERS = [
  "row_type",
  "invoice_number",
  "client_name",
  "issue_date",
  "item_description",
  "quantity",
  "unit_price",
] as const;

/**
 * Optional canonical headers
 */
const OPTIONAL_CANONICAL_HEADERS = [
  "client_email",
  "due_date",
  "currency",
  "status",
  "po_number",
  "notes",
  "amount",
] as const;

/**
 * Header alias mapping (normalized -> canonical)
 * Supports common aliases and exact header names like "Row Type", "Invoice Number", etc.
 * Normalized headers (after trim, lower, collapse spaces, remove underscores) map to canonical keys.
 */
const HEADER_ALIASES: Record<string, string> = {
  // Row Type - normalized "rowtype" maps to "row_type"
  "rowtype": "row_type",
  "type": "row_type",
  // Invoice Number - normalized "invoicenumber" maps to "invoice_number"
  "invoiceno": "invoice_number",
  "invoicenumber": "invoice_number",
  "invoice#": "invoice_number",
  // Client Name - normalized "clientname" maps to "client_name"
  "clientname": "client_name",
  "customer": "client_name",
  "customername": "client_name",
  "client": "client_name",
  // Client Email - normalized "clientemail" maps to "client_email"
  "clientemail": "client_email",
  "email": "client_email",
  "customeremail": "client_email",
  // Issue Date - normalized "issuedate" maps to "issue_date"
  "issuedate": "issue_date",
  "date": "issue_date",
  "invoicedate": "issue_date",
  // Due Date - normalized "duedate" maps to "due_date"
  "duedate": "due_date",
  "due": "due_date",
  // Currency - normalized "currency" maps to "currency"
  "currency": "currency",
  // Status - normalized "status" maps to "status"
  "status": "status",
  // PO Number - normalized "ponumber" maps to "po_number"
  "ponumber": "po_number",
  "po": "po_number",
  // Notes - normalized "notes" maps to "notes"
  "notes": "notes",
  // Item Description - normalized "itemdescription" maps to "item_description"
  "itemdescription": "item_description",
  "description": "item_description",
  "item": "item_description",
  // Quantity - normalized "quantity" maps to "quantity"
  "quantity": "quantity",
  "qty": "quantity",
  // Unit Price - normalized "unitprice" maps to "unit_price"
  "unitprice": "unit_price",
  "price": "unit_price",
  // Amount - normalized "amount" maps to "amount"
  "amount": "amount",
  "total": "amount",
};


/**
 * Normalize header name (trim, lowercase, collapse spaces, remove underscores)
 * Handles headers like "Row Type", "Invoice Number", etc.
 */
function normalizeHeader(header: string): string {
  return header
    .replace(/^\uFEFF/, "") // Remove BOM
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "") // Collapse multiple spaces into nothing
    .replace(/_/g, ""); // Remove underscores
}

/**
 * Map normalized header to canonical name
 */
function mapHeaderToCanonical(normalized: string): string {
  // Check aliases first
  if (HEADER_ALIASES[normalized]) {
    return HEADER_ALIASES[normalized];
  }
  // Return as-is if already canonical
  return normalized;
}

/**
 * Parse date: M/D/YYYY, MM/DD/YYYY, or YYYY-MM-DD -> YYYY-MM-DD
 * Returns null if unparseable (does not throw)
 */
function parseDate(dateStr: string): string | null {
  const trimmed = dateStr.trim();
  if (!trimmed) return null;

  // Try M/D/YYYY or MM/DD/YYYY format
  const mmddyyyy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
  const match = trimmed.match(mmddyyyy);
  if (match) {
    const [, month, day, year] = match;
    const m = parseInt(month, 10);
    const d = parseInt(day, 10);
    const y = parseInt(year, 10);
    // Validate month and day ranges
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      // Additional validation: check if day is valid for the month
      const dateObj = new Date(y, m - 1, d);
      if (dateObj.getFullYear() === y && dateObj.getMonth() === m - 1 && dateObj.getDate() === d) {
        return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      }
    }
  }

  // Try YYYY-MM-DD format (already correct)
  const yyyymmdd = /^(\d{4})-(\d{2})-(\d{2})$/;
  const yyyymmddMatch = trimmed.match(yyyymmdd);
  if (yyyymmddMatch) {
    const [, year, month, day] = yyyymmddMatch;
    const y = parseInt(year, 10);
    const m = parseInt(month, 10);
    const d = parseInt(day, 10);
    // Validate month and day ranges
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      // Additional validation: check if day is valid for the month
      const dateObj = new Date(y, m - 1, d);
      if (dateObj.getFullYear() === y && dateObj.getMonth() === m - 1 && dateObj.getDate() === d) {
        return trimmed;
      }
    }
  }

  return null;
}

/**
 * Parse number (handles commas, negative check, zero check)
 * For quantity and unit_price: must be > 0 (not zero, not negative)
 */
function parseNumber(value: string, allowNegative: boolean = false, allowZero: boolean = true): number | null {
  const trimmed = value.trim().replace(/,/g, "");
  if (!trimmed) return null;
  
  const num = parseFloat(trimmed);
  if (isNaN(num)) return null;
  
  if (!allowNegative && num < 0) return null;
  if (!allowZero && num <= 0) return null;
  
  return num;
}

/**
 * Detect wrong file type
 */
function detectWrongFileType(normalizedHeaders: string[]): "clients" | "payments" | null {
  const headerSet = new Set(normalizedHeaders);
  
  const clientsMatch = CLIENTS_HEADERS.filter((h) => headerSet.has(h)).length;
  if (clientsMatch >= 3) {
    return "clients";
  }
  
  const paymentsMatch = PAYMENTS_HEADERS.filter((h) => headerSet.has(h)).length;
  if (paymentsMatch >= 3) {
    return "payments";
  }
  
  return null;
}

/**
 * Transform a parsed row (keyed by display header names) into a canonical row (keyed by canonical names)
 * 
 * @param parsedRow - Row object keyed by display names (e.g., "Row Type", "Invoice Number")
 * @param headerMap - Map from display name to canonical name (e.g., "Row Type" -> "row_type")
 */
function canonicalizeRow(parsedRow: Record<string, string>, headerMap: Map<string, string>): Record<string, string> {
  const canonicalRow: Record<string, string> = {};
  
  // Initialize all canonical fields to empty string
  for (const canonical of [...REQUIRED_CANONICAL_HEADERS, ...OPTIONAL_CANONICAL_HEADERS]) {
    canonicalRow[canonical] = "";
  }
  
  // Map display header values to canonical keys
  for (const [displayHeader, canonical] of headerMap.entries()) {
    if (parsedRow[displayHeader] !== undefined) {
      canonicalRow[canonical] = (parsedRow[displayHeader] || "").trim();
    }
  }
  
  return canonicalRow;
}

/**
 * Get field value from canonical row (direct property access)
 */
function getField(canonicalRow: Record<string, string>, canonicalName: string): string {
  return canonicalRow[canonicalName] || "";
}

/**
 * Detect if row is a header row (invoice row)
 * Returns: true if invoice row, false if item row, null if ambiguous
 * 
 * Rules:
 * - row_type must be "invoice" or "item" (case-insensitive)
 * - For invoice rows: require invoice_number and (client_name OR client_email) and issue_date
 * - For item rows: require invoice_number, item_description, quantity, unit_price
 */
function isHeaderRow(canonicalRow: Record<string, string>): boolean | null {
  const rowType = getField(canonicalRow, "row_type").toLowerCase().trim();
  const invoiceNumber = getField(canonicalRow, "invoice_number");
  const clientName = getField(canonicalRow, "client_name");
  const clientEmail = getField(canonicalRow, "client_email");
  const issueDate = getField(canonicalRow, "issue_date");
  const itemDescription = getField(canonicalRow, "item_description");
  const quantity = getField(canonicalRow, "quantity");
  const unitPrice = getField(canonicalRow, "unit_price");

  // Explicit row type (case-insensitive)
  if (rowType === "invoice" || rowType === "header") {
    return true;
  }
  if (rowType === "item") {
    return false;
  }

  // Implicit detection: invoice row has invoice_number + (client_name OR client_email) + issue_date
  // and typically no item_description, quantity, or unit_price
  const hasClientInfo = (clientName || clientEmail).trim() !== "";
  const hasItemInfo = (itemDescription || quantity || unitPrice).trim() !== "";
  
  if (invoiceNumber && hasClientInfo && issueDate && !hasItemInfo) {
    return true; // Likely invoice row
  }

  // Implicit: item row has invoice_number + item_description + quantity + unit_price
  if (invoiceNumber && itemDescription && quantity && unitPrice) {
    return false; // Likely item row
  }

  // Ambiguous - return null to let caller decide
  return null;
}

/**
 * Preview invoice import from grouped CSV/TSV file
 */
export async function previewInvoicesImport(
  workspaceId: string,
  fileText: string
): Promise<PreviewResult> {
  await requireWorkspace(workspaceId);
  const supabase = await supabaseServer();

  const globalErrors: string[] = [];
  let header_ok = false;

  // Parse delimited file using shared parser (for delimiter detection and basic parsing)
  // IMPORTANT: Pass actual header display names so parseDelimited keys rows correctly
  const expectedDisplayHeaders = INVOICE_GROUPED_HEADERS.map(h => HEADER_DISPLAY_NAMES[h] || h);
  const parseResult = parseDelimited(fileText, {
    expectedHeaders: expectedDisplayHeaders,
    autoFix: false, // No autofixes for invoices (different format)
  });
  
  // Collect parse errors (but filter out column count errors since we handle that)
  const columnCountErrors = parseResult.errors.filter(e => e.includes("Too many columns"));
  if (columnCountErrors.length > 0) {
    globalErrors.push(...columnCountErrors);
  }

  // Check if parsing failed
  if (parseResult.headers.length === 0 || parseResult.rows.length === 0) {
    if (globalErrors.length === 0) {
      globalErrors.push("Failed to parse file headers or no data rows found");
    }
    return {
      header_ok: false,
      ok: false,
      errors: globalErrors,
      invoiceGroups: [],
      rows: [],
    };
  }

  // Normalize headers (invoices use canonical headers with aliases)
  const rawHeaders = parseResult.headers;
  const normalizedHeaders = rawHeaders.map(normalizeHeader);
  const canonicalHeaders = normalizedHeaders.map(mapHeaderToCanonical);
  const expectedColumnCount = INVOICE_HEADER_COUNT; // Always 14 columns
  const delimiter = parseResult.delimiter;
  
  // DEV logging: show header normalization
  devLog("Header normalization", {
    rawHeaders,
    normalizedHeaders,
    canonicalHeaders,
    delimiter: delimiter === "\t" ? "TAB" : "COMMA",
    expectedColumnCount,
    actualColumnCount: rawHeaders.length,
  });

  // Validate exact column count: must match INVOICE_GROUPED_HEADERS length (14)
  if (rawHeaders.length !== expectedColumnCount) {
    const expectedHeaderNames = INVOICE_GROUPED_HEADERS.map(h => HEADER_DISPLAY_NAMES[h] || h);
    globalErrors.push(
      `Expected exactly ${expectedColumnCount} columns, but found ${rawHeaders.length}. ` +
      `Required columns (in order): ${expectedHeaderNames.join(", ")}`
    );
    return {
      header_ok: false,
      ok: false,
      errors: globalErrors,
      invoiceGroups: [],
      rows: [],
    };
  }

  // Note: Excel-broken CSV detection is now handled by parseDelimited
  // Additional validation can be done here if needed
  const dataRows = parseResult.rows;

  // Detect wrong file type
  const wrongFileType = detectWrongFileType(normalizedHeaders);
  if (wrongFileType) {
    return {
      header_ok: false,
      ok: false,
      errors: [
        wrongFileType === "clients"
          ? "This looks like a Clients CSV. Switch to Clients tab or upload invoices.csv template."
          : "This looks like a Payments CSV. Switch to Payments tab or upload invoices.csv template.",
      ],
      invoiceGroups: [],
      rows: [],
      wrong_file_type: wrongFileType,
    };
  }

  // Build header map: display header name -> canonical name
  // Since parseDelimited keys rows by expectedHeaders (display names), we map display -> canonical
  const headerMap = new Map<string, string>();
  for (let i = 0; i < INVOICE_GROUPED_HEADERS.length; i++) {
    const displayName = HEADER_DISPLAY_NAMES[INVOICE_GROUPED_HEADERS[i]] || INVOICE_GROUPED_HEADERS[i];
    const canonical = INVOICE_GROUPED_HEADERS[i];
    headerMap.set(displayName, canonical);
  }
  
  devLog("Header map (display -> canonical)", {
    entries: Array.from(headerMap.entries()).slice(0, 5).map(([display, canonical]) => `"${display}" -> "${canonical}"`)
  });

  // Validate required headers (show display names in error message)
  const headerSet = new Set(canonicalHeaders);
  const missingHeaders: string[] = [];

  for (const required of REQUIRED_CANONICAL_HEADERS) {
    if (!headerSet.has(required)) {
      // Use display name for user-friendly error message
      const displayName = HEADER_DISPLAY_NAMES[required] || required;
      missingHeaders.push(displayName);
    }
  }

  if (missingHeaders.length > 0) {
    // Single, clear error message (no duplicates)
    globalErrors.push(`Missing required headers: ${missingHeaders.join(", ")}`);
    header_ok = false;
    
    devLog("Header validation failed", { missingHeaders, canonicalHeaders });
  } else {
    header_ok = true;
  }

  if (!header_ok) {
    return {
      header_ok: false,
      ok: false,
      errors: globalErrors,
      invoiceGroups: [],
      rows: [],
    };
  }

  // Get workspace organization_id (required for multi-tenant)
  const { data: workspace, error: workspaceError } = await supabase
    .from("workspaces")
    .select("id, organization_id")
    .eq("id", workspaceId)
    .maybeSingle();
  
  if (workspaceError || !workspace) {
    return {
      header_ok: false,
      ok: false,
      errors: [`Failed to load workspace: ${workspaceError?.message || "Workspace not found"}`],
      invoiceGroups: [],
      rows: [],
    };
  }
  
  // Guard: workspace must have organization_id
  if (!workspace.organization_id) {
    return {
      header_ok: false,
      ok: false,
      errors: ["Workspace is missing organization_id. Please contact support to configure your workspace."],
      invoiceGroups: [],
      rows: [],
    };
  }

  // Transform all rows to canonical format (for UI display and grouping)
  const canonicalRows = dataRows.map(parsedRow => canonicalizeRow(parsedRow, headerMap));

  // DEV logging: show first parsed row to verify mapping
  if (dataRows.length > 0) {
    devLog("First parsed row (keyed by display names)", { parsedRow: dataRows[0] });
    if (canonicalRows.length > 0) {
      const firstCanonical = canonicalRows[0];
      devLog("First canonical row (key fields)", {
        row_type: firstCanonical.row_type,
        invoice_number: firstCanonical.invoice_number,
        client_name: firstCanonical.client_name,
        client_email: firstCanonical.client_email,
        issue_date: firstCanonical.issue_date,
      });
    }
  }

  // Convert canonical rows to RPC format (row_type invoice|item) for validation
  const rpcRows: any[] = [];
  for (let i = 0; i < canonicalRows.length; i++) {
    const row = canonicalRows[i];
    const rowTypeRaw = getField(row, "row_type").toLowerCase().trim();
    const invoiceNumber = getField(row, "invoice_number");
    
    // Determine row type
    let rowType: "invoice" | "item";
    if (rowTypeRaw === "invoice" || rowTypeRaw === "header") {
      rowType = "invoice";
    } else if (rowTypeRaw === "item") {
      rowType = "item";
    } else {
      // Infer from content
      const hasClientInfo = getField(row, "client_name") || getField(row, "client_email");
      const hasItemInfo = getField(row, "item_description") && getField(row, "quantity") && getField(row, "unit_price");
      rowType = hasItemInfo ? "item" : "invoice";
    }

    if (rowType === "invoice") {
      // Read currency ONLY from file, default to "USD" if blank, normalize to uppercase
      const currencyRaw = getField(row, "currency").trim().toUpperCase();
      let currency = currencyRaw || "USD"; // Default to USD if blank
      
      // Validate currency as 3-letter ISO code (A-Z only)
      if (currency.length === 3 && /^[A-Z]{3}$/.test(currency)) {
        // Valid currency code
      } else if (currencyRaw && currencyRaw.length > 0) {
        // Invalid currency - will be caught by RPC validation
        currency = currencyRaw.toUpperCase(); // Still normalize but RPC will reject
      }
      
      // Normalize status to lowercase: draft|sent|void
      const statusRaw = getField(row, "status");
      const statusNormalized = statusRaw ? statusRaw.toLowerCase().trim() as "draft" | "sent" | "void" : "sent";
      
      rpcRows.push({
        row_type: "invoice",
        invoice_number: invoiceNumber,
        client_email: getField(row, "client_email") || null,
        client_name: getField(row, "client_name"),
        issue_date: getField(row, "issue_date"),
        due_date: getField(row, "due_date") || null,
        currency: currency, // Always include (defaults to USD if blank)
        status: statusNormalized, // Lowercase: draft|sent|void
        po_number: getField(row, "po_number") || null,
        notes: getField(row, "notes") || null,
      });
    } else {
      rpcRows.push({
        row_type: "item",
        invoice_number: invoiceNumber,
        item_description: getField(row, "item_description"),
        quantity: getField(row, "quantity"),
        unit_price: getField(row, "unit_price"),
        amount: getField(row, "amount") || null, // Ignored by RPC, but include for completeness
      });
    }
  }

  // Call RPC with dry_run=true for validation (ensures preview and execute use same validation)
  const rpcName = "import_invoices_grouped";
  const dryRun = true;
  const rowsCount = rpcRows.length;
  
  // DEV logging: show payload shape (first 2 rows only to avoid huge logs)
  devLog("RPC call (preview)", {
    rpcName,
    workspaceId,
    dryRun,
    rowsCount,
    samplePayload: rpcRows.slice(0, 2),
  });
  
  const { data: rpcPreviewResult, error: rpcPreviewError } = await supabase.rpc(rpcName, {
    p_workspace_id: workspaceId,
    p_rows: rpcRows,
    p_dry_run: dryRun,
  });

  // Log RPC result (dev only for errors, always log success in dev)
  if (rpcPreviewError) {
    console.error(`[invoices-import] RPC error:`, {
      rpcName,
      workspaceId,
      error: {
        message: rpcPreviewError.message,
        details: (rpcPreviewError as unknown as { details?: string }).details,
        hint: (rpcPreviewError as unknown as { hint?: string }).hint,
        code: (rpcPreviewError as unknown as { code?: string }).code,
      },
    });
  } else {
    devLog("RPC result (preview)", {
      ok: rpcPreviewResult?.ok,
      errorsCount: rpcPreviewResult?.errors ? (Array.isArray(rpcPreviewResult.errors) ? rpcPreviewResult.errors.length : 0) : 0,
    });
  }

  // Collect RPC validation errors
  const rpcErrors: string[] = [];
  if (rpcPreviewError) {
    rpcErrors.push(`RPC validation error: ${rpcPreviewError.message}`);
  } else if (rpcPreviewResult && !rpcPreviewResult.ok) {
    if (rpcPreviewResult.errors && Array.isArray(rpcPreviewResult.errors)) {
      for (const err of rpcPreviewResult.errors) {
        if (typeof err === 'string') {
          rpcErrors.push(err);
        } else if (typeof err === 'object' && err.error) {
          rpcErrors.push(`${err.invoice_number || 'Unknown'}: ${err.error}`);
        }
      }
    }
  }

  // Group rows: detect header rows and associate item rows (for UI display)
  const invoiceGroups = new Map<string, {
    headerRow: Record<string, string>;
    headerLineNumber: number;
    itemRows: Array<{ row: Record<string, string>; lineNumber: number }>;
  }>();
  
  // Track invoice numbers to detect duplicates
  const invoiceNumberLines = new Map<string, number[]>(); // invoice_number -> array of line numbers

  let currentInvoiceNumber: string | null = null;
  let currentHeaderRow: Record<string, string> | null = null;
  let currentHeaderLineNumber: number = 0;

  // Process rows and group them (for UI display)
  for (let i = 0; i < canonicalRows.length; i++) {
    const row = canonicalRows[i];
    const lineNumber = i + 2; // CSV line number (1-based, +1 for header row)

    const rowTypeRaw = getField(row, "row_type").toLowerCase().trim();
    const isExplicitInvoice = rowTypeRaw === "invoice" || rowTypeRaw === "header";
    const isExplicitItem = rowTypeRaw === "item";
    const rowTypeDetected = isHeaderRow(row);

    if (rowTypeDetected === true || isExplicitInvoice) {
      // This is a header row (invoice row)
      const invoiceNumber = getField(row, "invoice_number");
      const clientName = getField(row, "client_name");
      const clientEmail = getField(row, "client_email");
      const issueDateRaw = getField(row, "issue_date");
      const dueDateRaw = getField(row, "due_date");
      const currencyRaw = getField(row, "currency").trim().toUpperCase();
      const status = getField(row, "status");
      
      // Read currency ONLY from file, default to "USD" if blank, normalize to uppercase
      let currency = currencyRaw || "USD";
      
      // Validate currency as 3-letter ISO code (A-Z only)
      if (currency.length === 3 && /^[A-Z]{3}$/.test(currency)) {
        // Valid currency code
      } else if (currencyRaw && currencyRaw.length > 0) {
        // Invalid currency - will be caught by validation
        currency = currencyRaw; // Keep as-is for validation error
      }

      // Validate invoice row requirements: invoice_number, client_name or client_email, issue_date, due_date, currency, status
      const invoiceErrors: string[] = [];
      
      if (!invoiceNumber) {
        invoiceErrors.push("Invoice Number is required");
      }
      if (!clientName && !clientEmail) {
        invoiceErrors.push("Client Name or Client Email is required");
      }
      
      // Validate and parse dates (must be valid ISO YYYY-MM-DD or convert from M/D/YYYY)
      if (!issueDateRaw) {
        invoiceErrors.push("Issue Date is required");
      } else {
        const parsedIssueDate = parseDate(issueDateRaw);
        if (!parsedIssueDate) {
          invoiceErrors.push(`Invalid Issue Date: ${issueDateRaw} (must be YYYY-MM-DD or M/D/YYYY)`);
        }
      }
      
      if (!dueDateRaw) {
        invoiceErrors.push("Due Date is required");
      } else {
        const parsedDueDate = parseDate(dueDateRaw);
        if (!parsedDueDate) {
          invoiceErrors.push(`Invalid Due Date: ${dueDateRaw} (must be YYYY-MM-DD or M/D/YYYY)`);
        }
      }
      
      // Currency validation: must be 3-letter ISO code (A-Z only) if provided
      if (currencyRaw && currencyRaw.length > 0) {
        const normalizedCurrency = currencyRaw.trim().toUpperCase();
        if (normalizedCurrency.length !== 3 || !/^[A-Z]{3}$/.test(normalizedCurrency)) {
          invoiceErrors.push(`Invalid Currency: ${currencyRaw} (must be a 3-letter ISO code like USD, EUR, etc.)`);
        }
      }
      if (!status) {
        invoiceErrors.push("Status is required");
      }

      if (invoiceErrors.length > 0) {
        globalErrors.push(
          `Line ${lineNumber} (Invoice ${invoiceNumber || "unknown"}): ${invoiceErrors.join("; ")}`
        );
        continue;
      }

      // Check for duplicate invoice numbers in the file
      if (invoiceNumber) {
        if (!invoiceNumberLines.has(invoiceNumber)) {
          invoiceNumberLines.set(invoiceNumber, [lineNumber]);
        } else {
          const existingLines = invoiceNumberLines.get(invoiceNumber)!;
          existingLines.push(lineNumber);
          // Don't add error here - we'll check after processing all rows
        }
      }

      currentInvoiceNumber = invoiceNumber;
      currentHeaderRow = row;
      currentHeaderLineNumber = lineNumber;

      if (!invoiceGroups.has(invoiceNumber)) {
        invoiceGroups.set(invoiceNumber, {
          headerRow: row,
          headerLineNumber: lineNumber,
          itemRows: [],
        });
      } else {
        // Duplicate invoice number detected - this will be caught by duplicate check below
        // Don't overwrite the existing header - keep the first one
        // The duplicate check will add an error
      }
    } else if (rowTypeDetected === false || isExplicitItem) {
      // This is an item row
      const invoiceNumber = getField(row, "invoice_number") || currentInvoiceNumber;
      const itemDescription = getField(row, "item_description");
      const quantity = getField(row, "quantity");
      const unitPrice = getField(row, "unit_price");

      // Validate item row requirements: invoice_number, item_description, quantity, unit_price
      const itemErrors: string[] = [];
      
      if (!invoiceNumber) {
        itemErrors.push("Invoice Number is required");
      } else {
        // Validate item references an existing invoice header in the same file
        if (!invoiceGroups.has(invoiceNumber)) {
          itemErrors.push(`Item references Invoice Number "${invoiceNumber}" which does not exist in this file (invoice header row must appear before item rows)`);
        }
      }
      if (!itemDescription) {
        itemErrors.push("Item Description is required");
      }
      if (!quantity) {
        itemErrors.push("Quantity is required");
      }
      if (!unitPrice) {
        itemErrors.push("Unit Price is required");
      }

      if (itemErrors.length > 0) {
        globalErrors.push(
          `Line ${lineNumber} (Invoice ${invoiceNumber || "unknown"}): Item row ${itemErrors.join("; ")}`
        );
        continue;
      }

      // Validate quantity and unit_price are numeric > 0
      const quantityNum = parseNumber(quantity, false, false); // Must be > 0
      if (quantityNum === null) {
        globalErrors.push(
          `Line ${lineNumber} (Invoice ${invoiceNumber}): Item row has invalid Quantity (must be > 0): ${quantity}`
        );
        continue;
      }

      const unitPriceNum = parseNumber(unitPrice, false, false); // Must be > 0
      if (unitPriceNum === null) {
        globalErrors.push(
          `Line ${lineNumber} (Invoice ${invoiceNumber}): Item row has invalid Unit Price (must be > 0): ${unitPrice}`
        );
        continue;
      }

      // Items must reference an existing invoice row in the same file
      if (!invoiceNumber || !invoiceGroups.has(invoiceNumber)) {
        globalErrors.push(
          `Line ${lineNumber} (Invoice ${invoiceNumber || "unknown"}): Item row references invoice that does not exist in this file. Invoice header row must appear before item rows.`
        );
        continue;
      }

      const group = invoiceGroups.get(invoiceNumber);
      if (group) {
        group.itemRows.push({ row, lineNumber });
      }
    } else {
      // Ambiguous row - try to infer
      const invoiceNumber = getField(row, "invoice_number");
      if (!invoiceNumber) {
        globalErrors.push(`Line ${lineNumber} (Invoice unknown): Row is ambiguous and missing Invoice Number`);
        continue;
      }
      // Default to item row if ambiguous
      const itemDescription = getField(row, "item_description");
      if (itemDescription) {
        // Treat as item row - but must reference existing invoice
        if (!invoiceGroups.has(invoiceNumber)) {
          globalErrors.push(
            `Line ${lineNumber} (Invoice ${invoiceNumber}): Item row references invoice that does not exist in this file. Invoice header row must appear before item rows.`
          );
          continue;
        }
        const group = invoiceGroups.get(invoiceNumber);
        if (group) {
          group.itemRows.push({ row, lineNumber });
        }
      } else {
        globalErrors.push(`Line ${lineNumber} (Invoice ${invoiceNumber}): Row is ambiguous - cannot determine if invoice or item row`);
      }
    }
  }

  // Check for duplicate invoice numbers in the file (must be unique)
  for (const [invoiceNumber, lines] of invoiceNumberLines.entries()) {
    if (lines.length > 1) {
      globalErrors.push(
        `Duplicate invoice_number "${invoiceNumber}" found on lines ${lines.join(", ")}. Each invoice must have a unique invoice_number.`
      );
    }
  }

  // Process each invoice group and build preview
  const invoiceGroupsArray: InvoiceGroupPayload[] = [];
  const previewRows: PreviewRow[] = [];

  for (const [invoiceNumber, group] of invoiceGroups.entries()) {
    const headerRow = group.headerRow;
    const rowId = `line:${group.headerLineNumber}`;
    const validationErrors: string[] = [];


    // Extract invoice-level fields from header row (canonical format)
    const issueDateRaw = getField(headerRow, "issue_date");
    const dueDateRaw = getField(headerRow, "due_date");
    const clientEmail = getField(headerRow, "client_email") || undefined;
    const clientName = getField(headerRow, "client_name");
    // Read currency ONLY from file, default to "USD" if blank, normalize to uppercase
    const currencyRaw = getField(headerRow, "currency").trim().toUpperCase();
    let currency = currencyRaw || "USD";
    
    // Validate currency as 3-letter ISO code (A-Z only) if provided
    if (currencyRaw && currencyRaw.length > 0) {
      if (currency.length !== 3 || !/^[A-Z]{3}$/.test(currency)) {
        // Invalid currency - will be caught by validation
        currency = currencyRaw; // Keep as-is for validation error
      }
    }
    
    const statusRaw = getField(headerRow, "status");
    const notes = getField(headerRow, "notes") || undefined;
    const poNumber = getField(headerRow, "po_number") || undefined;

    // Validate required invoice fields (already checked during row processing, but validate again here)
    if (!issueDateRaw) {
      validationErrors.push("Issue Date is required");
    }
    if (!dueDateRaw) {
      validationErrors.push("Due Date is required");
    }
    // Currency validation: only error if present but invalid (not 3-letter code)
    if (currencyRaw && currencyRaw.trim() !== "" && currencyRaw.length !== 3) {
      validationErrors.push(`Invalid Currency: ${currencyRaw} (must be a 3-letter code like USD, EUR, etc.)`);
    }
    if (!statusRaw) {
      validationErrors.push("Status is required");
    }
    if (!clientName && !clientEmail) {
      validationErrors.push("Client Name or Client Email is required");
    }

    // Parse dates (must be valid ISO YYYY-MM-DD or convert from M/D/YYYY)
    let issueDate: string | null = null;
    if (issueDateRaw) {
      issueDate = parseDate(issueDateRaw);
      if (!issueDate) {
        validationErrors.push(`Invalid Issue Date: ${issueDateRaw} (must be YYYY-MM-DD or M/D/YYYY)`);
      }
    }

    let dueDate: string | undefined = undefined;
    if (dueDateRaw) {
      const parsed = parseDate(dueDateRaw);
      if (parsed) {
        dueDate = parsed;
      } else {
        validationErrors.push(`Invalid Due Date: ${dueDateRaw} (must be YYYY-MM-DD or M/D/YYYY)`);
      }
    }

    // Validate status: Accept Draft/Sent/Void (case-insensitive) -> map to draft/sent/void
    // Ignore Paid/Partially Paid/Overdue (system-derived)
    const statusLower = statusRaw ? statusRaw.toLowerCase().trim() : "";
    const validStatuses = ["draft", "sent", "void"];
    const systemStatuses = ["paid", "partially paid", "overdue"];
    
    let baseStatus: "draft" | "sent" | "void" = "sent"; // Default
    
    if (statusRaw) {
      if (validStatuses.includes(statusLower)) {
        baseStatus = statusLower as "draft" | "sent" | "void";
      } else if (systemStatuses.includes(statusLower)) {
        // Ignore system-derived statuses, use default
        baseStatus = "sent";
      } else {
        validationErrors.push(`Invalid Status: ${statusRaw} (must be Draft, Sent, or Void)`);
      }
    }

    // Currency is already set above (defaults to USD if blank, normalized to uppercase)

    // Extract items from item rows
    const items: Array<{
      description: string;
      quantity: number;
      unit_price: number;
      amount: number;
    }> = [];

    let computedTotal = 0;

    for (const { row: itemRow, lineNumber } of group.itemRows) {
      // itemRow is already in canonical format
      const itemDescription = getField(itemRow, "item_description");
      const quantityRaw = getField(itemRow, "quantity");
      const unitPriceRaw = getField(itemRow, "unit_price");
      const amountRaw = getField(itemRow, "amount");

      if (!itemDescription) {
        validationErrors.push(`Line ${lineNumber} (Invoice ${invoiceNumber}): Item missing description`);
        continue;
      }

      // Validate quantity: must be numeric > 0
      const quantity = parseNumber(quantityRaw, false, false); // Must be > 0
      if (quantity === null || quantity <= 0) {
        validationErrors.push(`Line ${lineNumber} (Invoice ${invoiceNumber}): Invalid quantity (must be > 0): ${quantityRaw || "missing"}`);
        continue;
      }

      // Validate unit_price: must be numeric > 0
      const unitPrice = parseNumber(unitPriceRaw, false, false); // Must be > 0
      if (unitPrice === null || unitPrice <= 0) {
        validationErrors.push(`Line ${lineNumber} (Invoice ${invoiceNumber}): Invalid unit price (must be > 0): ${unitPriceRaw || "missing"}`);
        continue;
      }

      // Compute amount from quantity * unit_price (ignore provided amount column)
      const computedAmount = quantity * unitPrice;

      // If Amount column is present, validate it matches computed amount within 0.01 tolerance (warning only)
      if (amountRaw) {
        const providedAmount = parseNumber(amountRaw, false, true); // Allow zero for validation
        if (providedAmount !== null) {
          const difference = Math.abs(providedAmount - computedAmount);
          if (difference > 0.01) {
            // Warning only - don't block execution
            validationErrors.push(
              `Line ${lineNumber} (Invoice ${invoiceNumber}): Amount (${providedAmount}) does not match quantity × unit_price (${computedAmount.toFixed(2)}). ` +
              `System will use computed value: ${computedAmount.toFixed(2)}`
            );
          }
        }
      }

      // Always use computed amount, not the provided Amount column
      items.push({
        description: itemDescription,
        quantity,
        unit_price: unitPrice,
        amount: computedAmount,
      });

      computedTotal += computedAmount;
    }

    if (items.length === 0) {
      validationErrors.push("At least one item is required");
    }

    // Check for existing invoice (for action determination)
    let action: "insert" | "update" | undefined = undefined;
    if (validationErrors.length === 0 && invoiceNumber) {
      const { data: existingInvoice } = await supabase
        .from("invoices")
        .select("id, archived_at")
        .eq("workspace_id", workspaceId)
        .eq("invoice_number", invoiceNumber)
        .maybeSingle();

      if (existingInvoice) {
        if (existingInvoice.archived_at) {
          validationErrors.push("Invoice is archived");
        } else {
          action = "update";
        }
      } else {
        action = "insert";
      }
    }

    // Check client existence (only if no other errors)
    if (validationErrors.length === 0 && (clientEmail || clientName)) {
      let clientExists = false;

      // 1) If client_email provided: try lookup by workspace_id + lower(email)
      if (clientEmail) {
        const { data: clientByEmail } = await supabase
          .from("clients")
          .select("id")
          .eq("workspace_id", workspaceId)
          .is("archived_at", null)
          .ilike("email", clientEmail)
          .maybeSingle();
        clientExists = !!clientByEmail;
      }

      // 2) If not found AND client_name provided: try lookup by workspace_id + lower(name)
      if (!clientExists && clientName) {
        const { data: clientsByName } = await supabase
          .from("clients")
          .select("id")
          .eq("workspace_id", workspaceId)
          .is("archived_at", null)
          .ilike("name", clientName);

        if (clientsByName && clientsByName.length > 0) {
          if (clientsByName.length > 1) {
            validationErrors.push("Multiple clients match name. Use client_email or unique identifier.");
          } else {
            clientExists = true;
          }
        }
      }

      // 3) If still not found: fail with message including both email + name
      if (!clientExists) {
        const emailPart = clientEmail ? `email: ${clientEmail}` : "email: (not provided)";
        const namePart = clientName ? `name: ${clientName}` : "name: (not provided)";
        validationErrors.push(`Client not found in this workspace (${emailPart}, ${namePart}). Import client first (Clients tab) or fix client_email/client_name.`);
      }
    }

    // Build normalized payload (only if no validation errors and required fields present)
    // Block execution if any validation errors exist
    if (validationErrors.length === 0 && issueDate && dueDate && (clientName || clientEmail) && items.length > 0) {
      const payload: InvoiceGroupPayload = {
        rowId,
        invoice_number: invoiceNumber,
        client_name: clientName || clientEmail || "", // Use email as fallback if name missing
        issue_date: issueDate,
        base_status: baseStatus,
        items: items.map((item) => ({
          description: item.description,
          quantity: item.quantity,
          unit_price: item.unit_price,
          amount: item.amount,
        })),
      };

      if (clientEmail) payload.client_email = clientEmail;
      if (dueDate) payload.due_date = dueDate;
      // Always include currency in payload (canonical value, defaults to USD if blank, normalized to uppercase)
      payload.currency = currency.toUpperCase();
      if (poNumber) payload.po_number = poNumber;
      if (notes) payload.notes = notes;

      invoiceGroupsArray.push(payload);
    }

    // Build preview row
    previewRows.push({
      rowId,
      invoice_number: invoiceNumber,
      client_name: clientName,
      issue_date: issueDate || issueDateRaw,
      due_date: dueDate || undefined,
      status: baseStatus,
      currency,
      items_count: items.length,
      computed_total: computedTotal,
      validation_errors: validationErrors,
      action,
    });
  }

  // Merge RPC validation errors into preview rows
  // Map RPC errors to invoice groups by invoice_number
  const rpcErrorsByInvoice = new Map<string, string[]>();
  for (const rpcErr of rpcErrors) {
    // Extract invoice_number from error message if present
    const invoiceMatch = rpcErr.match(/invoice[_\s]*number[:\s]*([A-Z0-9-]+)/i) || rpcErr.match(/\(Invoice\s+([A-Z0-9-]+)\)/i);
    if (invoiceMatch && invoiceMatch[1]) {
      const invNum = invoiceMatch[1];
      if (!rpcErrorsByInvoice.has(invNum)) {
        rpcErrorsByInvoice.set(invNum, []);
      }
      rpcErrorsByInvoice.get(invNum)!.push(rpcErr);
    } else {
      // Global error - add to all rows or as global error
      globalErrors.push(rpcErr);
    }
  }

  // Add RPC errors to preview rows
  for (const previewRow of previewRows) {
    const rpcErrs = rpcErrorsByInvoice.get(previewRow.invoice_number);
    if (rpcErrs) {
      previewRow.validation_errors.push(...rpcErrs);
    }
  }

  const ok = globalErrors.length === 0 && previewRows.every((r) => r.validation_errors.length === 0);

  return {
    header_ok,
    ok,
    errors: globalErrors,
    invoiceGroups: invoiceGroupsArray,
    rows: previewRows,
  };
}

/**
 * Execute invoice import
 * Converts grouped invoice payload to raw rows format and calls import_invoices_grouped RPC
 */
export async function executeInvoicesImport(
  workspaceId: string,
  invoiceGroups: InvoiceGroupPayload[]
): Promise<{ ok: boolean; results: Array<{ rowId: string; invoice_number: string; status: "ok" | "failed"; invoice_id: string | null; error: string | null }>; errors: string[] }> {
  // Guard: reject execution if no invoice groups provided
  if (!invoiceGroups || invoiceGroups.length === 0) {
    return {
      ok: false,
      results: [],
      errors: ["No invoice groups to import"],
    };
  }

  await requireWorkspace(workspaceId);
  const supabase = await supabaseServer();

  // Fetch workspace organization_id (required for multi-tenant)
  const { data: workspace, error: workspaceError } = await supabase
    .from("workspaces")
    .select("id, organization_id")
    .eq("id", workspaceId)
    .maybeSingle();
  
  if (workspaceError || !workspace) {
    return {
      ok: false,
      results: [],
      errors: [`Failed to load workspace: ${workspaceError?.message || "Workspace not found"}`],
    };
  }
  
  // Guard: workspace must have organization_id
  if (!workspace.organization_id) {
    return {
      ok: false,
      results: [],
      errors: ["Workspace is missing organization_id. Please contact support to configure your workspace."],
    };
  }

  // Convert invoice groups to raw rows format (row_type invoice|item)
  const rawRows: any[] = [];
  
  for (const group of invoiceGroups) {
    // Add invoice header row
    // Currency defaults to workspace currency if missing (RPC will also default, but be explicit)
    // Status is already normalized to lowercase in base_status
    rawRows.push({
      row_type: "invoice",
      invoice_number: group.invoice_number,
      client_email: group.client_email || null,
      client_name: group.client_name,
      issue_date: group.issue_date,
      due_date: group.due_date || null,
      currency: (group.currency || "USD").toUpperCase(), // Read from file, default to USD, normalize to uppercase
      status: group.base_status.toLowerCase() as "draft" | "sent" | "void", // Ensure lowercase: draft|sent|void
      po_number: group.po_number || null,
      notes: group.notes || null,
    });
    
    // Add item rows
    for (const item of group.items) {
      rawRows.push({
        row_type: "item",
        invoice_number: group.invoice_number,
        item_description: item.description,
        quantity: item.quantity,
        unit_price: item.unit_price,
        amount: item.amount,
      });
    }
  }

  // Call new grouped import RPC (dry_run=false)
  const rpcName = "import_invoices_grouped";
  const dryRun = false;
  const rowsCount = rawRows.length;
  
  // DEV logging: show payload shape (first 2 rows only)
  devLog("RPC call (execute)", {
    rpcName,
    workspaceId,
    dryRun,
    rowsCount,
    invoiceCount: invoiceGroups.length,
    samplePayload: rawRows.slice(0, 2),
  });
  
  const { data: rpcResult, error: rpcError } = await supabase.rpc(rpcName, {
    p_workspace_id: workspaceId,
    p_rows: rawRows,
    p_dry_run: dryRun,
  });

  // Log RPC result
  if (rpcError) {
    console.error(`[invoices-import] RPC execute error:`, {
      rpcName,
      workspaceId,
      error: {
        message: rpcError.message,
        details: (rpcError as unknown as { details?: string }).details,
        hint: (rpcError as unknown as { hint?: string }).hint,
        code: (rpcError as unknown as { code?: string }).code,
      },
    });
    
    return {
      ok: false,
      results: [],
      errors: [rpcError.message || "RPC call failed"],
    };
  } else {
    devLog("RPC result (execute)", {
      ok: rpcResult?.ok,
      errorsCount: rpcResult?.errors ? (Array.isArray(rpcResult.errors) ? rpcResult.errors.length : 0) : 0,
      created: rpcResult?.created,
    });
  }

  // Map RPC result to expected format
  const rpcData = rpcResult as any;
  const errors: string[] = [];
  
  if (rpcData.errors && Array.isArray(rpcData.errors)) {
    for (const err of rpcData.errors) {
      if (typeof err === 'object' && err.error) {
        errors.push(`${err.invoice_number || 'Unknown'}: ${err.error}`);
      } else if (typeof err === 'string') {
        errors.push(err);
      }
    }
  }

  // Build results array from invoice groups
  const results = invoiceGroups.map((group) => {
    // Check if this invoice has an error
    const hasError = errors.some(e => e.includes(group.invoice_number));
    
    return {
      rowId: group.rowId,
      invoice_number: group.invoice_number,
      status: hasError ? ("failed" as const) : ("ok" as const),
      invoice_id: null, // RPC doesn't return individual invoice_ids in new format
      error: hasError ? errors.find(e => e.includes(group.invoice_number)) || null : null,
    };
  });

  const ok = rpcData.ok === true && errors.length === 0;

  // Verification queries (dev logs only)
  if (ok && rpcData.created) {
    const created = rpcData.created as { clients?: number; invoices?: number; items?: number };
    const invoiceNumbers = invoiceGroups.map(g => g.invoice_number);
    
    console.log(`[executeInvoicesImport] Import completed`, {
      workspaceId,
      created: {
        clients: created.clients || 0,
        invoices: created.invoices || 0,
        items: created.items || 0,
      },
    });

    // Verify imported invoices appear in invoices_view
    if (invoiceNumbers.length > 0) {
      const { data: importedInvoices, error: verifyError } = await supabase
        .from("invoices_view")
        .select("id, invoice_number, total, paid, outstanding, display_status")
        .eq("workspace_id", workspaceId)
        .in("invoice_number", invoiceNumbers);

      if (verifyError) {
        console.error(`[executeInvoicesImport] Verification query failed`, {
          workspaceId,
          invoiceNumbers,
          error: verifyError.message,
        });
      } else {
        console.log(`[executeInvoicesImport] Verification: ${importedInvoices?.length || 0} invoices found in invoices_view`, {
          workspaceId,
          invoiceNumbers,
          found: importedInvoices?.map(iv => ({
            invoice_number: iv.invoice_number,
            total: iv.total,
            paid: iv.paid,
            outstanding: iv.outstanding,
            display_status: iv.display_status,
          })),
        });
      }
    }

    // Runtime assert: Check for invoices with NULL workspace_id in this workspace
    // Query invoices that should have this workspace_id but have NULL instead
    const { count: nullWorkspaceIdCount, error: nullCheckError } = await supabase
      .from("invoices")
      .select("*", { count: "exact", head: true })
      .in("invoice_number", invoiceNumbers)
      .is("workspace_id", null);

    if (nullCheckError) {
      console.error(`[executeInvoicesImport] Failed to check for NULL workspace_id`, {
        workspaceId,
        error: nullCheckError.message,
      });
    } else if (nullWorkspaceIdCount && nullWorkspaceIdCount > 0) {
      const errorMsg = `CRITICAL: Found ${nullWorkspaceIdCount} invoice(s) with NULL workspace_id in workspace ${workspaceId}. This indicates a data integrity issue.`;
      console.error(`[executeInvoicesImport] ${errorMsg}`);
      return {
        ok: false,
        results: [],
        errors: [errorMsg],
      };
    }
  }

  // Revalidate paths
  if (ok) {
    revalidatePath(`/${workspaceId}/invoices`);
    revalidatePath(`/${workspaceId}/payments`);
    revalidatePath(`/${workspaceId}/dashboard`);
    revalidatePath(`/${workspaceId}/clients`);
  }

  return {
    ok,
    results,
    errors,
  };
}

/**
 * ============================================================================
 * TEST SNIPPET: How to call preview + execute with sample TSV
 * ============================================================================
 * 
 * // Sample TSV content (14 columns, grouped format)
 * const sampleTSV = `Row Type	Invoice Number	Client Name	Client Email	Issue Date	Due Date	Currency	Status	PO Number	Notes	Item Description	Quantity	Unit Price	Amount
 * invoice	INV-001	Acme Corp	acme@example.com	2025-01-15	2025-02-15	USD	Sent	PO-123	Monthly services	Service A	10	150.00	1500.00
 * item	INV-001													Service B	5	200.00	1000.00
 * invoice	INV-002	Tech Inc	tech@example.com	2025-01-20	2025-02-20	USD	Draft		Consulting	Consulting Hours	20	100.00	2000.00`;
 * 
 * // Preview (validates without writing)
 * const previewResult = await previewInvoicesImport(workspaceId, sampleTSV);
 * console.log("Preview OK:", previewResult.ok);
 * console.log("Errors:", previewResult.errors);
 * console.log("Preview Rows:", previewResult.rows);
 * 
 * // Execute (only if preview.ok === true and no validation errors)
 * if (previewResult.ok && previewResult.invoiceGroups.length > 0) {
 *   const executeResult = await executeInvoicesImport(workspaceId, previewResult.invoiceGroups);
 *   console.log("Execute OK:", executeResult.ok);
 *   console.log("Created/Updated:", executeResult.results);
 *   console.log("Errors:", executeResult.errors);
 * }
 * 
 * ============================================================================
 */

// ============================================================================
// SAMPLE FILE HELPERS
// ============================================================================

/**
 * Client data for sample file generation
 */
export type SampleClient = {
  name: string;
  email: string | null;
};

/**
 * Fetch up to 3 clients from the workspace for use in sample files.
 * Returns fallback clients if none exist.
 */
export async function getWorkspaceClientsForSample(
  workspaceId: string
): Promise<SampleClient[]> {
  await requireWorkspace(workspaceId);
  const supabase = await supabaseServer();

  const { data: clients, error } = await supabase
    .from("clients")
    .select("name, email")
    .eq("workspace_id", workspaceId)
    .eq("is_active", true)
    .is("archived_at", null)
    .order("created_at", { ascending: false })
    .limit(3);

  if (error || !clients || clients.length === 0) {
    // Return fallback clients if no workspace clients exist
    return [
      { name: "Acme Corporation", email: "billing@acme.com" },
      { name: "Widget Industries", email: "accounts@widget.io" },
      { name: "Tech Solutions", email: "invoices@techsolutions.com" },
    ];
  }

  // Pad with fallback if less than 3 clients
  const result: SampleClient[] = clients.map(c => ({
    name: c.name,
    email: c.email,
  }));

  while (result.length < 2) {
    result.push({ name: "Sample Client", email: "sample@example.com" });
  }

  return result;
}
