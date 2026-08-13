/**
 * Utilities for downloading cleaned files and error reports
 */

export type CleanedFilePreviewRow = {
  rowIndex: number;
  action: string;
};

/** Rows eligible for execute / cleaned-file export (Client Import V1). */
export function isExecutableImportPreviewRow(action: string): boolean {
  return action === "insert" || action === "update";
}

/**
 * Generate a re-importable cleaned file containing ONLY executable preview rows.
 * Excludes FAIL and SKIP rows so the download can be uploaded and executed.
 */
export function generateExecutableCleanedFile(
  headers: readonly string[],
  normalizedRows: Array<Record<string, string>>,
  previewRows: CleanedFilePreviewRow[],
  format: "csv" | "tsv"
): string {
  const executableNormalizedRows = previewRows
    .filter((row) => isExecutableImportPreviewRow(row.action))
    .map((row) => normalizedRows[row.rowIndex - 1])
    .filter((row): row is Record<string, string> => row != null);

  return generateCleanedFile(headers, executableNormalizedRows, format);
}

/**
 * Generate cleaned file content for the given rows (caller filters when needed).
 */
export function generateCleanedFile(
  headers: readonly string[],
  normalizedRows: Array<Record<string, string>>,
  format: "csv" | "tsv"
): string {
  const delimiter = format === "tsv" ? "\t" : ",";
  const headerRow = headers.join(delimiter);
  const rows = normalizedRows.map((row) =>
    headers.map((header) => {
      const value = row[header] || "";
      // Escape CSV values if needed (for CSV format)
      if (format === "csv" && (value.includes(",") || value.includes('"') || value.includes("\n"))) {
        return `"${value.replace(/"/g, '""')}"`;
      }
      return value;
    }).join(delimiter)
  );
  return [headerRow, ...rows].join("\n");
}

/**
 * Generate error report (only failed rows with reason column)
 */
export function generateErrorReport(
  headers: readonly string[],
  normalizedRows: Array<Record<string, string>>,
  previewRows: Array<{ rowIndex: number; action: string; reason?: string; warnings?: string[] }>,
  format: "csv" | "tsv"
): string {
  const delimiter = format === "tsv" ? "\t" : ",";
  const errorHeaders = [...headers, "Error Reason", "Warnings"];
  const headerRow = errorHeaders.join(delimiter);
  
  const failedRows = previewRows
    .filter((row) => row.action === "fail")
    .map((row) => {
      const normalizedRow = normalizedRows[row.rowIndex - 1] || {};
      const errorReason = row.reason || "Unknown error";
      const warnings = (row.warnings || []).join("; ");
      
      const rowData = [
        ...headers.map((header) => {
          const value = normalizedRow[header] || "";
          if (format === "csv" && (value.includes(",") || value.includes('"') || value.includes("\n"))) {
            return `"${value.replace(/"/g, '""')}"`;
          }
          return value;
        }),
        errorReason,
        warnings,
      ];
      
      return rowData.join(delimiter);
    });
  
  return [headerRow, ...failedRows].join("\n");
}

/**
 * Download file as blob
 */
export function downloadFile(content: string, filename: string, mimeType: string): void {
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

