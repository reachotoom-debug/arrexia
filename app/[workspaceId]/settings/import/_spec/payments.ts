/**
 * Payments import format specification (non-server constants).
 * This file does NOT have "use server" directive.
 */

export const PAYMENTS_EXPORT_HEADERS = [
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

export const PAYMENTS_REQUIRED_HEADERS = [
  "Payment Date",
  "Amount",
  "Invoice Number",
] as const;

/**
 * Sample rows that match export format (11 columns, no net_amount)
 * Invoice Number = "INV-001" (ONLY invoice number, no client name)
 * Client Name = "Acme Corp" (separate column)
 * Dates = "2026-01-01" (ISO format)
 * Created At / Archived At = blank
 */
export const PAYMENTS_SAMPLE_ROWS: Array<Record<string, string>> = [
  {
    "Payment Date": "2026-01-01",
    "Amount": "150.00",
    "Currency": "USD",
    "Method": "bank_transfer",
    "Provider": "PayPal",
    "Status": "completed",
    "Invoice Number": "INV-001",
    "Client Name": "Acme Corp",
    "Transaction ID": "TXN-123",
    "Created At": "",
    "Archived At": "",
  },
  {
    "Payment Date": "2026-01-02",
    "Amount": "100.00",
    "Currency": "USD",
    "Method": "cash",
    "Provider": "",
    "Status": "completed",
    "Invoice Number": "INV-002",
    "Client Name": "Widget Inc",
    "Transaction ID": "",
    "Created At": "",
    "Archived At": "",
  },
];

/**
 * Build sample CSV file with proper quoting and escaping
 */
export function buildPaymentsSampleCsv(): string {
  const headers = Array.from(PAYMENTS_EXPORT_HEADERS);
  const headerRow = headers.map(h => escapeCsvField(h)).join(",");
  
  const rows = PAYMENTS_SAMPLE_ROWS.map((row) =>
    headers.map((header) => escapeCsvField(row[header] || "")).join(",")
  );
  
  return [headerRow, ...rows].join("\n");
}

/**
 * Build sample TSV file with tabs
 */
export function buildPaymentsSampleTsv(): string {
  const headers = Array.from(PAYMENTS_EXPORT_HEADERS);
  const headerRow = headers.join("\t");
  
  const rows = PAYMENTS_SAMPLE_ROWS.map((row) =>
    headers.map((header) => row[header] || "").join("\t")
  );
  
  return [headerRow, ...rows].join("\n");
}

/**
 * Escape CSV field (quote if contains comma, quote, or newline)
 */
function escapeCsvField(field: string): string {
  if (field.includes(",") || field.includes('"') || field.includes("\n") || field.includes("\r")) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}
