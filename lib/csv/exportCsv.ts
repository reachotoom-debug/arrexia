/**
 * CSV Export Utilities
 * Handles CSV generation with UTF-8 BOM for Excel compatibility
 */

/**
 * Escape a CSV cell value according to RFC 4180
 * - Wrap in double quotes if contains comma, newline, or double quote
 * - Double any double quotes inside
 */
export function escapeCsvCell(value: any): string {
  if (value === null || value === undefined) {
    return "";
  }

  const str = String(value);

  // If contains comma, newline, or double quote, wrap in quotes and escape quotes
  if (str.includes(",") || str.includes("\n") || str.includes('"') || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }

  return str;
}

/**
 * Format a date value for CSV export
 */
export function formatDate(value: string | null | undefined): string {
  if (!value) return "";

  try {
    const date = new Date(value);
    if (isNaN(date.getTime())) return "";

    // Format as YYYY-MM-DD
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  } catch {
    return "";
  }
}

/**
 * Format a money value for CSV export
 */
export function formatMoney(value: number | null | undefined, currency: string = "USD"): string {
  if (value === null || value === undefined || isNaN(value)) {
    return "";
  }

  // Format with 2 decimal places
  return Number(value).toFixed(2);
}

/**
 * Format a phone/WhatsApp/numeric string for CSV export to prevent Excel scientific notation
 * Wraps value in Excel's text-preserving format: ="+962787123456"
 * Preserves leading +, leading zeros, and prevents scientific notation
 */
export function csvTextPreserve(value: string | null | undefined): string {
  const v = (value ?? "").toString().trim();
  if (!v) return "";
  
  // Force Excel to treat as text without showing apostrophe: ="+9627...."
  // Escape any double quotes in the value
  const escaped = v.replace(/"/g, '""');
  return `="${escaped}"`;
}

/**
 * Convert array of objects to CSV string
 * @param headers - Column headers (human-friendly names)
 * @param rows - Array of row objects with keys matching header names exactly
 * @param options - Optional configuration
 */
export function toCsv(
  headers: string[],
  rows: Record<string, any>[],
  options?: {
    dateFields?: string[];
    moneyFields?: string[];
    textFields?: string[]; // Fields that should use csvTextPreserve (phone/WhatsApp)
  }
): string {
  // UTF-8 BOM for Excel compatibility
  let csv = "\uFEFF";

  // Write headers
  csv += headers.map(escapeCsvCell).join(",") + "\n";

  // Write rows
  for (const row of rows) {
    const values = headers.map((header) => {
      // Use header as key directly (row keys must match headers exactly)
      let value = row[header];

      // Apply formatting if needed
      if (options?.dateFields?.includes(header) && value) {
        value = formatDate(value);
      } else if (options?.moneyFields?.includes(header) && value !== null && value !== undefined) {
        value = formatMoney(value);
      } else if (options?.textFields?.includes(header)) {
        // For text-preserved fields (phone/WhatsApp), use csvTextPreserve
        // This returns the formatted string directly (already includes quotes)
        return csvTextPreserve(value);
      }

      return escapeCsvCell(value);
    });

    csv += values.join(",") + "\n";
  }

  return csv;
}

/**
 * Trigger CSV download in browser
 */
export function downloadCsv(csvString: string, filename: string): void {
  const blob = new Blob([csvString], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

