/**
 * Shared utilities for generating sample CSV/TSV files for import
 */

/** Defer revoke so the browser can start the download before the blob URL is invalidated. */
export const BROWSER_DOWNLOAD_REVOKE_DELAY_MS = 1000;

/**
 * Trigger a client-side file download without navigation.
 * Revokes the object URL asynchronously — browsers do not expose download-complete events.
 */
export function triggerBrowserFileDownload(
  content: string,
  filename: string,
  mimeType: string
): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, BROWSER_DOWNLOAD_REVOKE_DELAY_MS);
}

/**
 * Run a sample-download task with explicit start/end hooks (clears UI loading in finally).
 */
export async function runSampleDownloadTask(
  task: () => void | Promise<void>,
  hooks?: {
    onStart?: () => void;
    onEnd?: () => void;
    onError?: (error: unknown) => void;
  }
): Promise<void> {
  hooks?.onStart?.();
  try {
    await task();
  } catch (error) {
    hooks?.onError?.(error);
    throw error;
  } finally {
    hooks?.onEnd?.();
  }
}

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
 * Download sample file as blob (synchronous initiation; no navigation).
 */
export function downloadSampleFile(
  content: string,
  filename: string,
  mimeType: string
): void {
  triggerBrowserFileDownload(content, filename, mimeType);
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
