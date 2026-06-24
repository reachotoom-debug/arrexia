/**
 * TSV Parsing Utilities for Payments Import
 */

const PAYMENT_IMPORT_HEADERS = [
  "Payment Date",
  "Amount",
  "Currency",
  "Method",
  "Provider",
  "Status",
  "Invoice Number",
  "Client Name",
  "Transaction ID",
  "Created At",
  "Archived At",
] as const;

export type PaymentImportHeader = typeof PAYMENT_IMPORT_HEADERS[number];

/**
 * Parse date string to ISO date string (YYYY-MM-DD)
 * Accepts: YYYY-MM-DD, MM/DD/YYYY, M/D/YYYY, DD-MM-YYYY
 */
export function parseMMDDYYYY(dateStr: string): string {
  const trimmed = dateStr.trim();
  if (!trimmed) {
    throw new Error("Date is required");
  }

  // Try YYYY-MM-DD format first (already ISO)
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
        return trimmed; // Already in ISO format
      }
    }
    throw new Error(`Invalid date: ${trimmed}`);
  }

  // Try MM/DD/YYYY or M/D/YYYY pattern
  const mmddyyyy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
  const match = trimmed.match(mmddyyyy);
  if (match) {
    const [, month, day, year] = match;
    const monthNum = parseInt(month, 10);
    const dayNum = parseInt(day, 10);
    const yearNum = parseInt(year, 10);

    // Basic validation
    if (monthNum < 1 || monthNum > 12) {
      throw new Error(`Invalid month: ${monthNum}`);
    }
    if (dayNum < 1 || dayNum > 31) {
      throw new Error(`Invalid day: ${dayNum}`);
    }
    if (yearNum < 1900 || yearNum > 2100) {
      throw new Error(`Invalid year: ${yearNum}`);
    }

    // Format as ISO date (YYYY-MM-DD)
    const isoDate = `${yearNum}-${String(monthNum).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;

    // Validate the date is valid (catches invalid dates like 02/30/2024)
    const date = new Date(isoDate + "T00:00:00.000Z");
    if (isNaN(date.getTime())) {
      throw new Error(`Invalid date: ${trimmed}`);
    }

    // Verify the date components match the input
    const utcYear = date.getUTCFullYear();
    const utcMonth = date.getUTCMonth() + 1;
    const utcDay = date.getUTCDate();
    
    if (utcYear !== yearNum || utcMonth !== monthNum || utcDay !== dayNum) {
      throw new Error(`Invalid date: ${trimmed}`);
    }

    return isoDate;
  }

  // Try DD-MM-YYYY pattern (Excel/TSV commonly produces this)
  const ddmmyyyy = /^(\d{1,2})-(\d{1,2})-(\d{4})$/;
  const ddmmyyyyMatch = trimmed.match(ddmmyyyy);
  if (ddmmyyyyMatch) {
    const [, day, month, year] = ddmmyyyyMatch;
    const dayNum = parseInt(day, 10);
    const monthNum = parseInt(month, 10);
    const yearNum = parseInt(year, 10);

    // Basic validation
    if (monthNum < 1 || monthNum > 12) {
      throw new Error(`Invalid month: ${monthNum}`);
    }
    if (dayNum < 1 || dayNum > 31) {
      throw new Error(`Invalid day: ${dayNum}`);
    }
    if (yearNum < 1900 || yearNum > 2100) {
      throw new Error(`Invalid year: ${yearNum}`);
    }

    // Format as ISO date (YYYY-MM-DD)
    const isoDate = `${yearNum}-${String(monthNum).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;

    // Validate the date is valid
    const date = new Date(isoDate + "T00:00:00.000Z");
    if (isNaN(date.getTime())) {
      throw new Error(`Invalid date: ${trimmed}`);
    }

    // Verify the date components match the input
    const utcYear = date.getUTCFullYear();
    const utcMonth = date.getUTCMonth() + 1;
    const utcDay = date.getUTCDate();
    
    if (utcYear !== yearNum || utcMonth !== monthNum || utcDay !== dayNum) {
      throw new Error(`Invalid date: ${trimmed}`);
    }

    return isoDate;
  }

  throw new Error(`Invalid date format: ${trimmed}. Expected YYYY-MM-DD, MM/DD/YYYY, M/D/YYYY, or DD-MM-YYYY`);
}

/**
 * Generate a short hash from a string (for deterministic transaction_id)
 */
function shortHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  // Convert to positive hex string (8 chars)
  return Math.abs(hash).toString(16).padStart(8, "0");
}

/**
 * Generate deterministic transaction_id from row data
 */
export function generateTransactionId(row: {
  invoice_number: string;
  payment_date_iso: string;
  amount: number;
  method: string | null;
  rowOriginal: string;
}): string {
  const amountFixed = Number(row.amount).toFixed(2);
  const method = row.method || ""; // Use empty string if method is null/empty
  const hash = shortHash(row.rowOriginal);
  
  return `csv:${row.invoice_number}:${row.payment_date_iso}:${amountFixed}:${method}:${hash}`;
}

/**
 * Parse TSV file with strict header validation
 */
export function parseTSV(
  fileText: string,
  expectedHeaders: readonly string[]
): { headers: string[]; rows: string[][] } {
  const lines = fileText.split(/\r?\n/).filter((line) => line.trim() !== "");

  if (lines.length === 0) {
    throw new Error("File is empty");
  }

  // Parse header row (first line)
  const headerLine = lines[0];
  const headers = headerLine.split("\t").map((h) => h.trim());

  // Validate headers match exactly
  if (headers.length !== expectedHeaders.length) {
    throw new Error(
      `Header count mismatch. Expected ${expectedHeaders.length} columns, got ${headers.length}`
    );
  }

  for (let i = 0; i < expectedHeaders.length; i++) {
    if (headers[i] !== expectedHeaders[i]) {
      throw new Error(
        `Header mismatch at column ${i + 1}. Expected "${expectedHeaders[i]}", got "${headers[i]}"`
      );
    }
  }

  // Parse data rows
  const rows: string[][] = [];
  for (let i = 1; i < lines.length; i++) {
    const row = lines[i].split("\t").map((cell) => cell.trim());
    
    // Pad row to match header count (handle missing trailing tabs)
    while (row.length < headers.length) {
      row.push("");
    }
    
    // Truncate row if it has too many columns (shouldn't happen, but be safe)
    if (row.length > headers.length) {
      row.splice(headers.length);
    }
    
    rows.push(row);
  }

  return { headers, rows };
}

/**
 * Parse payments TSV with strict header validation
 */
export function parsePaymentsTSV(fileText: string): {
  headers: string[];
  rows: string[][];
} {
  return parseTSV(fileText, PAYMENT_IMPORT_HEADERS);
}

