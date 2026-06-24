/**
 * Shared delimited file parser with auto-detection, normalization, and autofixes
 */

import Papa from "papaparse";

export interface ParseDelimitedOptions {
  expectedHeaders: readonly string[];
  autoFix?: boolean; // Enable autofixes (e.g., split invoice_number)
  strictColumnCount?: boolean; // If true, fail immediately if column count doesn't match exactly
}

export interface ParseDelimitedResult {
  headers: string[];
  rows: Array<Record<string, string>>;
  delimiter: string;
  errors: string[];
  warnings: Array<{ rowIndex: number; message: string }>;
  autofixes: Array<{ rowIndex: number; field: string; original: string; fixed: string; reason: string }>;
}

/**
 * Auto-detect delimiter: tabs = TSV, else CSV
 */
function detectDelimiter(firstLine: string): string {
  if (firstLine.includes("\t")) {
    return "\t";
  }
  return ",";
}

/**
 * Normalize column count:
 * - If < expected: pad with ""
 * - If > expected: trim trailing empty fields
 * - If still > expected: error
 */
function normalizeColumnCount(
  fields: string[],
  expectedCount: number,
  strict: boolean = false
): { fields: string[]; error?: string } {
  // Pad if < expected
  while (fields.length < expectedCount) {
    fields.push("");
  }

  // In strict mode, fail immediately if > expected
  if (strict && fields.length > expectedCount) {
    return {
      fields: fields.slice(0, expectedCount), // Keep only expected columns for error display
      error: `Too many columns (${fields.length} detected, expected ${expectedCount}). Extra data detected.`,
    };
  }

  // Trim trailing empty fields if > expected (non-strict mode)
  while (fields.length > expectedCount && !fields[fields.length - 1]) {
    fields.pop();
  }

  // If still > expected, error
  if (fields.length > expectedCount) {
    return {
      fields: fields.slice(0, expectedCount), // Keep only expected columns for error display
      error: `Too many columns (${fields.length} detected, expected ${expectedCount}). Extra data detected.`,
    };
  }

  return { fields };
}

/**
 * Parse delimited file with auto-detection and normalization
 */
export function parseDelimited(
  fileText: string,
  options: ParseDelimitedOptions
): ParseDelimitedResult {
  const { expectedHeaders, autoFix = false, strictColumnCount = false } = options;
  const errors: string[] = [];
  const warnings: Array<{ rowIndex: number; message: string }> = [];
  const autofixes: Array<{ rowIndex: number; field: string; original: string; fixed: string; reason: string }> = [];

  // Detect delimiter from first line
  const firstLine = fileText.split(/\r?\n/)[0];
  const delimiter = detectDelimiter(firstLine);

  // Parse with Papa.parse
  let parsedData: Papa.ParseResult<any> | null = null;
  try {
    parsedData = Papa.parse(fileText, {
      header: true,
      skipEmptyLines: true,
      delimiter,
      transformHeader: (header: string) => {
        return header.replace(/^\uFEFF/, "").trim();
      },
      transform: (value: string) => {
        return value.trim();
      },
    });
  } catch (parseError) {
    return {
      headers: [],
      rows: [],
      delimiter,
      errors: [parseError instanceof Error ? parseError.message : "Failed to parse file"],
      warnings: [],
      autofixes: [],
    };
  }

  if (!parsedData || !parsedData.meta.fields) {
    return {
      headers: [],
      rows: [],
      delimiter,
      errors: ["Failed to parse file headers"],
      warnings: [],
      autofixes: [],
    };
  }

  // Normalize headers
  const fields = parsedData.meta.fields.map((h) => h.replace(/^\uFEFF/, "").trim());
  const normalizeResult = normalizeColumnCount(fields, expectedHeaders.length, strictColumnCount);
  
  if (normalizeResult.error) {
    errors.push(normalizeResult.error);
  }

  const normalizedHeaders = normalizeResult.fields;

  // Normalize data rows
  const normalizedRows: Array<Record<string, string>> = [];
  if (parsedData.data) {
    parsedData.data.forEach((row: any, rowIndex: number) => {
      // Get raw row values as array (in order of headers)
      const rawValues: string[] = [];
      for (let i = 0; i < normalizedHeaders.length; i++) {
        const header = normalizedHeaders[i];
        rawValues.push((row[header] || "").trim());
      }
      
      // Normalize column count for this row (pad or warn if extra)
      const rowNormalizeResult = normalizeColumnCount([...rawValues], expectedHeaders.length, strictColumnCount);
      
      if (rowNormalizeResult.error) {
        if (strictColumnCount) {
          errors.push(`Row ${rowIndex + 2}: ${rowNormalizeResult.error}`); // +2 because rowIndex is 0-based and we skip header
        } else {
          // Non-strict: warn about extra columns but continue
          warnings.push({
            rowIndex: rowIndex + 1,
            message: `Row ${rowIndex + 2}: ${rowNormalizeResult.error}. Extra columns detected; please re-export using FlowCollect format.`,
          });
        }
      }
      
      const normalizedRow: Record<string, string> = {};
      
      // Map all expected columns
      for (let i = 0; i < expectedHeaders.length; i++) {
        const expectedHeader = expectedHeaders[i];
        normalizedRow[expectedHeader] = (rowNormalizeResult.fields[i] || "").trim();
      }

      // Apply autofixes if enabled
      if (autoFix) {
        // Autofix: split invoice_number if it contains spaces and client_name is empty
        // This is for payments import
        if (normalizedRow["Invoice Number"] !== undefined && normalizedRow["Client Name"] === "") {
          const invoiceNumber = normalizedRow["Invoice Number"];
          if (invoiceNumber && invoiceNumber.includes(" ")) {
            const parts = invoiceNumber.split(/\s+/);
            const fixedInvoiceNumber = parts[0];
            const fixedClientName = parts.slice(1).join(" ");
            
            autofixes.push({
              rowIndex: rowIndex + 1, // 1-based for user display
              field: "Invoice Number / Client Name",
              original: `${invoiceNumber} / (empty)`,
              fixed: `${fixedInvoiceNumber} / ${fixedClientName}`,
              reason: "Auto-fixed: Split invoice number containing spaces into invoice number and client name",
            });

            normalizedRow["Invoice Number"] = fixedInvoiceNumber;
            normalizedRow["Client Name"] = fixedClientName;
            
            warnings.push({
              rowIndex: rowIndex + 1,
              message: `Auto-fixed: Split invoice number "${invoiceNumber}" into invoice number "${fixedInvoiceNumber}" and client name "${fixedClientName}"`,
            });
          }
        }
      }

      normalizedRows.push(normalizedRow);
    });
  }

  // Filter parse errors: only show non-field-count errors
  if (parsedData.errors.length > 0) {
    const relevantErrors = parsedData.errors.filter((e) => {
      // Ignore "Expected X fields, parsed Y" errors - we handle column count manually
      return !e.message.toLowerCase().includes("expected") || !e.message.toLowerCase().includes("parsed");
    });
    if (relevantErrors.length > 0) {
      errors.push(...relevantErrors.map((e) => `Parse error: ${e.message}`));
    }
  }

  return {
    headers: normalizedHeaders,
    rows: normalizedRows,
    delimiter,
    errors,
    warnings,
    autofixes,
  };
}
