/**
 * Invoice grouped import format definitions.
 * Shared constants and types for invoice CSV/TSV import.
 * 
 * Grouped format:
 * - Row Type = "invoice" or "item"
 * - Invoice Number required for both row types
 * - Invoice row: Client Name, Client Email, Issue Date, Due Date, Currency, Status, PO Number, Notes
 * - Item row: Item Description, Quantity, Unit Price, Amount (optional, computed if blank)
 * 
 * Dates accepted: YYYY-MM-DD or M/D/YYYY
 * Currency: defaults to workspace default if blank
 * Status: defaults to "sent" if blank
 */

/**
 * Complete canonical header list for grouped invoice import (14 columns, exact order)
 * This constant is used by both the validator and the sample generators to ensure consistency.
 */
export const INVOICE_GROUPED_HEADERS = [
  "row_type",
  "invoice_number",
  "client_name",
  "client_email",
  "issue_date",
  "due_date",
  "currency",
  "status",
  "po_number",
  "notes",
  "item_description",
  "quantity",
  "unit_price",
  "amount",
] as const;

/**
 * Display names for headers (user-friendly)
 */
export const HEADER_DISPLAY_NAMES: Record<string, string> = {
  row_type: "Row Type",
  invoice_number: "Invoice Number",
  client_name: "Client Name",
  client_email: "Client Email",
  issue_date: "Issue Date",
  due_date: "Due Date",
  currency: "Currency",
  status: "Status",
  po_number: "PO Number",
  notes: "Notes",
  item_description: "Item Description",
  quantity: "Quantity",
  unit_price: "Unit Price",
  amount: "Amount",
};

export const INVOICE_HEADER_COUNT = INVOICE_GROUPED_HEADERS.length; // 14

/**
 * Invoice group payload type (normalized for RPC)
 */
export type InvoiceGroupPayload = {
  rowId: string;
  invoice_number: string;
  client_name: string;
  client_email?: string;
  issue_date: string; // YYYY-MM-DD
  due_date?: string; // YYYY-MM-DD
  currency?: string;
  base_status: "draft" | "sent" | "void";
  po_number?: string;
  notes?: string;
  items: Array<{
    description: string;
    quantity: number;
    unit_price: number;
    amount: number;
  }>;
};

/**
 * Preview row result type (one row per invoice group)
 */
export type PreviewRow = {
  rowId: string;
  invoice_number: string;
  client_name: string;
  issue_date: string;
  due_date?: string;
  status: string;
  currency: string;
  items_count: number;
  computed_total: number;
  validation_errors: string[];
  action?: "insert" | "update"; // Determined after client resolution
};

/**
 * Preview result type
 */
export type PreviewResult = {
  header_ok: boolean;
  ok: boolean;
  errors: string[]; // Global errors
  invoiceGroups: InvoiceGroupPayload[]; // Normalized payload
  rows: PreviewRow[]; // Display rows for UI
  wrong_file_type?: "clients" | "payments";
};

// ============================================================================
// SAMPLE FILE GENERATORS
// ============================================================================

/**
 * Sample invoice data for generating sample files
 */
const SAMPLE_INVOICES = [
  {
    invoice_number: "INV-001",
    client_name: "Acme Corporation",
    client_email: "billing@acme.com",
    issue_date: "2024-01-15",
    due_date: "2024-02-15",
    currency: "USD",
    status: "Sent",
    po_number: "PO-2024-001",
    notes: "Thank you for your business",
    items: [
      { description: "Web Development Services", quantity: 10, unit_price: 150.00 },
      { description: "Consulting Hours", quantity: 5, unit_price: 200.00 },
    ],
  },
  {
    invoice_number: "INV-002",
    client_name: "Widget Industries",
    client_email: "accounts@widget.io",
    issue_date: "2024-01-20",
    due_date: "2024-02-20",
    currency: "USD",
    status: "Draft",
    po_number: "",
    notes: "",
    items: [
      { description: "Design Services", quantity: 8, unit_price: 125.00 },
    ],
  },
];

/**
 * Build sample TSV content (grouped format) - RECOMMENDED
 * TSV is more reliable than CSV because:
 * - Excel preserves tabs correctly
 * - No quoting issues with commas in data
 * - Phone numbers and amounts preserved as text
 */
export function buildInvoicesSampleTsv(): string {
  const headers = INVOICE_GROUPED_HEADERS.map(h => HEADER_DISPLAY_NAMES[h] || h);
  const headerRow = headers.join("\t");
  
  const rows: string[] = [];
  
  for (const invoice of SAMPLE_INVOICES) {
    // Invoice header row (row_type = "invoice")
    const invoiceRow = [
      "invoice",                    // row_type
      invoice.invoice_number,       // invoice_number
      invoice.client_name,          // client_name
      invoice.client_email,         // client_email
      invoice.issue_date,           // issue_date
      invoice.due_date,             // due_date
      invoice.currency,             // currency
      invoice.status,               // status
      invoice.po_number,            // po_number
      invoice.notes,                // notes
      "",                           // item_description (empty for invoice row)
      "",                           // quantity
      "",                           // unit_price
      "",                           // amount
    ];
    rows.push(invoiceRow.join("\t"));
    
    // Item rows (row_type = "item")
    for (const item of invoice.items) {
      const amount = item.quantity * item.unit_price;
      const itemRow = [
        "item",                     // row_type
        invoice.invoice_number,     // invoice_number
        "",                         // client_name (empty for item row)
        "",                         // client_email
        "",                         // issue_date
        "",                         // due_date
        "",                         // currency
        "",                         // status
        "",                         // po_number
        "",                         // notes
        item.description,           // item_description
        item.quantity.toString(),   // quantity
        item.unit_price.toFixed(2), // unit_price
        amount.toFixed(2),          // amount (optional, computed if blank)
      ];
      rows.push(itemRow.join("\t"));
    }
  }
  
  return [headerRow, ...rows].join("\n");
}

/**
 * Build sample CSV content (grouped format)
 * Note: CSV may have issues with Excel auto-formatting - TSV is recommended
 */
export function buildInvoicesSampleCsv(): string {
  const headers = INVOICE_GROUPED_HEADERS.map(h => HEADER_DISPLAY_NAMES[h] || h);
  const headerRow = headers.map(escapeCsvField).join(",");
  
  const rows: string[] = [];
  
  for (const invoice of SAMPLE_INVOICES) {
    // Invoice header row
    const invoiceRow = [
      "invoice",
      invoice.invoice_number,
      invoice.client_name,
      invoice.client_email,
      invoice.issue_date,
      invoice.due_date,
      invoice.currency,
      invoice.status,
      invoice.po_number,
      invoice.notes,
      "",
      "",
      "",
      "",
    ].map(escapeCsvField);
    rows.push(invoiceRow.join(","));
    
    // Item rows
    for (const item of invoice.items) {
      const amount = item.quantity * item.unit_price;
      const itemRow = [
        "item",
        invoice.invoice_number,
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        item.description,
        item.quantity.toString(),
        item.unit_price.toFixed(2),
        amount.toFixed(2),
      ].map(escapeCsvField);
      rows.push(itemRow.join(","));
    }
  }
  
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

// ============================================================================
// DYNAMIC SAMPLE FILE GENERATORS (with workspace clients)
// ============================================================================

/**
 * Client data for sample file generation
 */
export type SampleClientData = {
  name: string;
  email: string | null;
};

/**
 * Default fallback clients if none provided
 */
const FALLBACK_CLIENTS: SampleClientData[] = [
  { name: "Acme Corporation", email: "billing@acme.com" },
  { name: "Widget Industries", email: "accounts@widget.io" },
];

/**
 * Sample line items for invoices
 */
const SAMPLE_LINE_ITEMS = [
  [
    { description: "Web Development Services", quantity: 10, unit_price: 150.00 },
    { description: "Consulting Hours", quantity: 5, unit_price: 200.00 },
  ],
  [
    { description: "Design Services", quantity: 8, unit_price: 125.00 },
    { description: "Project Management", quantity: 4, unit_price: 175.00 },
  ],
];

/**
 * Build sample TSV content using workspace clients
 * Uses real clients so the sample works out of the box
 * Invoice numbers start at INV-0056
 */
export function buildInvoicesSampleTsvWithClients(clients: SampleClientData[]): string {
  const useClients = clients.length > 0 ? clients : FALLBACK_CLIENTS;
  const headers = INVOICE_GROUPED_HEADERS.map(h => HEADER_DISPLAY_NAMES[h] || h);
  const headerRow = headers.join("\t");
  
  const rows: string[] = [];
  const today = new Date();
  
  // Generate 2 invoices using the provided clients
  for (let i = 0; i < Math.min(2, useClients.length); i++) {
    const client = useClients[i];
    const invoiceNumber = `INV-${String(56 + i).padStart(4, "0")}`; // Start at INV-0056
    const issueDate = new Date(today.getTime() - (i * 5 * 24 * 60 * 60 * 1000)); // Stagger by 5 days
    const dueDate = new Date(issueDate.getTime() + (30 * 24 * 60 * 60 * 1000)); // Net 30
    const items = SAMPLE_LINE_ITEMS[i % SAMPLE_LINE_ITEMS.length];
    
    // Invoice header row
    const invoiceRow = [
      "invoice",
      invoiceNumber,
      client.name,
      client.email || "",
      issueDate.toISOString().split("T")[0],
      dueDate.toISOString().split("T")[0],
      "USD",
      "Sent",
      `PO-${String(1000 + i).padStart(4, "0")}`,
      "Thank you for your business",
      "", "", "", "",
    ];
    rows.push(invoiceRow.join("\t"));
    
    // Item rows
    for (const item of items) {
      const amount = item.quantity * item.unit_price;
      const itemRow = [
        "item",
        invoiceNumber,
        "", "", "", "", "", "", "", "",
        item.description,
        item.quantity.toString(),
        item.unit_price.toFixed(2),
        amount.toFixed(2),
      ];
      rows.push(itemRow.join("\t"));
    }
  }
  
  return [headerRow, ...rows].join("\n");
}

/**
 * Build sample CSV content using workspace clients
 */
export function buildInvoicesSampleCsvWithClients(clients: SampleClientData[]): string {
  const useClients = clients.length > 0 ? clients : FALLBACK_CLIENTS;
  const headers = INVOICE_GROUPED_HEADERS.map(h => HEADER_DISPLAY_NAMES[h] || h);
  const headerRow = headers.map(escapeCsvField).join(",");
  
  const rows: string[] = [];
  const today = new Date();
  
  // Generate 2 invoices using the provided clients
  for (let i = 0; i < Math.min(2, useClients.length); i++) {
    const client = useClients[i];
    const invoiceNumber = `INV-${String(56 + i).padStart(4, "0")}`; // Start at INV-0056
    const issueDate = new Date(today.getTime() - (i * 5 * 24 * 60 * 60 * 1000));
    const dueDate = new Date(issueDate.getTime() + (30 * 24 * 60 * 60 * 1000));
    const items = SAMPLE_LINE_ITEMS[i % SAMPLE_LINE_ITEMS.length];
    
    // Invoice header row
    const invoiceRow = [
      "invoice",
      invoiceNumber,
      client.name,
      client.email || "",
      issueDate.toISOString().split("T")[0],
      dueDate.toISOString().split("T")[0],
      "USD",
      "Sent",
      `PO-${String(1000 + i).padStart(4, "0")}`,
      "Thank you for your business",
      "", "", "", "",
    ].map(escapeCsvField);
    rows.push(invoiceRow.join(","));
    
    // Item rows
    for (const item of items) {
      const amount = item.quantity * item.unit_price;
      const itemRow = [
        "item",
        invoiceNumber,
        "", "", "", "", "", "", "", "",
        item.description,
        item.quantity.toString(),
        item.unit_price.toFixed(2),
        amount.toFixed(2),
      ].map(escapeCsvField);
      rows.push(itemRow.join(","));
    }
  }
  
  return [headerRow, ...rows].join("\n");
}

// ============================================================================
// TEST HELPERS (dev mode only)
// ============================================================================

/**
 * Test helper: Parse a sample TSV string and return invoice groups
 * This is a simplified parser for testing - it doesn't do full validation
 * but verifies the basic grouping logic works.
 */
export function testParseGroupedInvoices(tsvContent: string): InvoiceGroupPayload[] {
  const lines = tsvContent.split(/\r?\n/).filter(line => line.trim() !== '');
  if (lines.length < 2) return [];

  const headers = lines[0].split('\t').map(h => h.trim());
  const headerIndex = (name: string) => {
    const normalized = name.toLowerCase().replace(/\s+/g, '').replace(/_/g, '');
    return headers.findIndex(h => {
      const hNorm = h.toLowerCase().replace(/\s+/g, '').replace(/_/g, '');
      return hNorm === normalized || hNorm.includes(normalized) || normalized.includes(hNorm);
    });
  };

  const rowTypeIdx = headerIndex('row_type');
  const invoiceNumIdx = headerIndex('invoice_number');
  const clientNameIdx = headerIndex('client_name');
  const issueDateIdx = headerIndex('issue_date');
  const itemDescIdx = headerIndex('item_description');
  const qtyIdx = headerIndex('quantity');
  const unitPriceIdx = headerIndex('unit_price');
  const amountIdx = headerIndex('amount');

  const groups = new Map<string, InvoiceGroupPayload>();

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split('\t');
    const rowType = (cols[rowTypeIdx] || '').toLowerCase().trim();
    const invoiceNum = cols[invoiceNumIdx]?.trim() || '';

    if (!invoiceNum) continue;

    if (rowType === 'invoice' || rowType === 'header') {
      // Invoice header row
      if (!groups.has(invoiceNum)) {
        groups.set(invoiceNum, {
          rowId: `line:${i + 1}`,
          invoice_number: invoiceNum,
          client_name: cols[clientNameIdx]?.trim() || '',
          issue_date: cols[issueDateIdx]?.trim() || '',
          base_status: 'sent',
          items: [],
        });
      }
    } else if (rowType === 'item' || (cols[itemDescIdx] && cols[qtyIdx] && cols[unitPriceIdx])) {
      // Item row
      if (!groups.has(invoiceNum)) {
        // Create implicit group
        groups.set(invoiceNum, {
          rowId: `line:${i + 1}`,
          invoice_number: invoiceNum,
          client_name: '',
          issue_date: '',
          base_status: 'sent',
          items: [],
        });
      }

      const group = groups.get(invoiceNum)!;
      const qty = parseFloat(cols[qtyIdx]?.trim() || '0');
      const price = parseFloat(cols[unitPriceIdx]?.trim() || '0');
      
      // Amount is optional - compute if blank
      let amount = parseFloat(cols[amountIdx]?.trim() || '0');
      if (!amount && qty > 0 && price > 0) {
        amount = qty * price;
      }
      
      if (qty > 0 && price > 0) {
        group.items.push({
          description: cols[itemDescIdx]?.trim() || '',
          quantity: qty,
          unit_price: price,
          amount: amount,
        });
      }
    }
  }

  return Array.from(groups.values());
}

/**
 * Run self-test for sample TSV generation and parsing
 * Returns test results for dev logging
 */
export function runInvoiceSampleSelfTest(): {
  passed: boolean;
  sampleTsvLength: number;
  parsedInvoiceCount: number;
  parsedItemCount: number;
  errors: string[];
} {
  const errors: string[] = [];
  
  // Generate sample TSV
  const sampleTsv = buildInvoicesSampleTsv();
  
  // Parse it back
  const parsed = testParseGroupedInvoices(sampleTsv);
  
  // Validate
  if (parsed.length !== SAMPLE_INVOICES.length) {
    errors.push(`Expected ${SAMPLE_INVOICES.length} invoices, got ${parsed.length}`);
  }
  
  let totalItems = 0;
  for (const invoice of SAMPLE_INVOICES) {
    totalItems += invoice.items.length;
  }
  
  let parsedItems = 0;
  for (const group of parsed) {
    parsedItems += group.items.length;
  }
  
  if (parsedItems !== totalItems) {
    errors.push(`Expected ${totalItems} items, got ${parsedItems}`);
  }
  
  return {
    passed: errors.length === 0,
    sampleTsvLength: sampleTsv.length,
    parsedInvoiceCount: parsed.length,
    parsedItemCount: parsedItems,
    errors,
  };
}
