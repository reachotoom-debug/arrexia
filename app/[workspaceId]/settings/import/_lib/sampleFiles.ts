/**
 * Shared utilities for generating sample CSV/TSV files for import
 */

/**
 * Generate sample file content (TSV or CSV)
 */
export function generateSampleFile(
  headers: string[],
  sampleRows: Record<string, string>[],
  format: "tsv" | "csv"
): string {
  const delimiter = format === "tsv" ? "\t" : ",";
  const headerRow = headers.join(delimiter);
  const rows = sampleRows.map((row) =>
    headers.map((header) => row[header] || "").join(delimiter)
  );
  return [headerRow, ...rows].join("\n");
}

/**
 * Download sample file as blob
 */
export function downloadSampleFile(
  content: string,
  filename: string,
  mimeType: string
): void {
  const blob = new Blob([content], { type: mimeType });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Re-export sample data from spec modules (for backward compatibility)
 */
export { CLIENTS_SAMPLE_ROWS } from "../_spec/clients";
export { PAYMENTS_SAMPLE_ROWS } from "../_spec/payments";

/**
 * Re-export headers for convenience (used in components)
 * Note: Sample file builders are in _spec files (buildPaymentsSampleCsv, etc.)
 */
export { CLIENTS_EXPORT_HEADERS as CLIENTS_SAMPLE_HEADERS } from "../_spec/clients";
export { PAYMENTS_EXPORT_HEADERS as PAYMENTS_SAMPLE_HEADERS } from "../_spec/payments";

