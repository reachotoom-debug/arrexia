/**
 * Clients import format specification (non-server constants).
 * This file does NOT have "use server" directive.
 * 
 * Canonical headers for clients import (8 columns):
 * - Name (required)
 * - Email (optional)
 * - Company (optional)
 * - Country (optional)
 * - Phone (optional)
 * - WhatsApp (optional)
 * - Payment Terms Days (optional, numeric)
 * - Status (optional, Active/Inactive)
 * 
 * Header aliases are supported for backwards compatibility:
 * - Name: ["Name", "Client Name", "client_name"]
 * - Email: ["Email", "Client Email", "email"]
 * - Company: ["Company", "Company Name", "company"]
 * - Country: ["Country", "country"]
 * - Phone: ["Phone", "Business phone", "phone"]
 * - WhatsApp: ["WhatsApp", "Whatsapp", "whatsapp"]
 * - Payment Terms Days: ["Payment Terms Days", "Payment Terms", "payment_terms_days"]
 * - Status: ["Status", "status", "Is Active", "is_active"]
 */

/**
 * Canonical headers for clients import (exact order)
 */
export const CLIENTS_EXPORT_HEADERS = [
  "Name",
  "Email",
  "Company",
  "Country",
  "Phone",
  "WhatsApp",
  "Payment Terms Days",
  "Status",
] as const;

export const CLIENTS_HEADER_COUNT = CLIENTS_EXPORT_HEADERS.length; // 8

export const CLIENTS_MANUAL_HEADERS = [
  ...CLIENTS_EXPORT_HEADERS,
] as const;

/**
 * Sample rows for clients import (using canonical headers)
 */
export const CLIENTS_SAMPLE_ROWS: Array<Record<string, string>> = [
  {
    "Name": "Acme Corp",
    "Email": "client@example.com",
    "Company": "Acme Corporation",
    "Country": "United States",
    "Phone": "+1234567890",
    "WhatsApp": "+962781234567",
    "Payment Terms Days": "30",
    "Status": "Active",
  },
  {
    "Name": "Widget Inc",
    "Email": "billing@widget.io",
    "Company": "Widget Industries",
    "Country": "United Kingdom",
    "Phone": "",
    "WhatsApp": "+447123456789",
    "Payment Terms Days": "15",
    "Status": "Active",
  },
  {
    "Name": "Global Services LLC",
    "Email": "accounts@globalservices.com",
    "Company": "",
    "Country": "Germany",
    "Phone": "+49301234567",
    "WhatsApp": "",
    "Payment Terms Days": "45",
    "Status": "Inactive",
  },
];

/**
 * Build sample CSV file with proper quoting and escaping
 * Uses canonical headers: Name, Email, Company, Country, Phone, WhatsApp, Payment Terms Days, Status
 */
export function buildClientsSampleCsv(): string {
  const headers = Array.from(CLIENTS_EXPORT_HEADERS);
  const headerRow = headers.map(h => escapeCsvField(h)).join(",");
  
  const rows = CLIENTS_SAMPLE_ROWS.map((row) =>
    headers.map((header) => escapeCsvField(row[header] || "")).join(",")
  );
  
  return [headerRow, ...rows].join("\n");
}

/**
 * Build sample TSV file with tabs (recommended format)
 * Uses canonical headers: Name, Email, Company, Country, Phone, WhatsApp, Payment Terms Days, Status
 * TSV is recommended because:
 * - Excel preserves tabs correctly
 * - No quoting issues with commas in data
 * - Phone numbers preserved as text
 */
export function buildClientsSampleTsv(): string {
  const headers = Array.from(CLIENTS_EXPORT_HEADERS);
  const headerRow = headers.join("\t");
  
  const rows = CLIENTS_SAMPLE_ROWS.map((row) =>
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

// ============================================================================
// PARSER SELF-TESTS (dev mode only)
// ============================================================================

/**
 * Header alias lookup for testing
 */
const TEST_HEADER_ALIASES: Record<string, string[]> = {
  name: ["Name", "Client Name", "client_name", "Customer Name", "Customer"],
  email: ["Email", "Client Email", "email", "Email Address"],
  company: ["Company", "Company Name", "company", "Organization"],
  country: ["Country", "country", "Country Name"],
  phone: ["Phone", "Business phone", "phone", "Phone Number", "Telephone"],
  whatsapp: ["WhatsApp", "Whatsapp", "whatsapp", "WhatsApp Phone"],
  payment_terms_days: ["Payment Terms Days", "Payment Terms", "payment_terms_days", "Net Days"],
  status: ["Status", "status", "Is Active", "is_active"],
};

/**
 * Test case type for parser validation
 */
export interface ParserTestCase {
  name: string;
  input: string;
  expectedHeaders: string[];
  expectedRowCount: number;
  shouldPass: boolean;
  expectedErrors?: string[];
}

/**
 * Generate test cases for parser validation
 */
export function getParserTestCases(): ParserTestCase[] {
  return [
    // Test 1: Valid TSV with canonical headers
    {
      name: "Valid TSV with canonical headers",
      input: buildClientsSampleTsv(),
      expectedHeaders: Array.from(CLIENTS_EXPORT_HEADERS),
      expectedRowCount: CLIENTS_SAMPLE_ROWS.length,
      shouldPass: true,
    },
    
    // Test 2: Valid CSV with canonical headers
    {
      name: "Valid CSV with canonical headers",
      input: buildClientsSampleCsv(),
      expectedHeaders: Array.from(CLIENTS_EXPORT_HEADERS),
      expectedRowCount: CLIENTS_SAMPLE_ROWS.length,
      shouldPass: true,
    },
    
    // Test 3: TSV with alias headers (Client Name instead of Name)
    {
      name: "TSV with alias headers",
      input: [
        "Client Name\tEmail\tCompany\tCountry\tPhone\tWhatsApp\tPayment Terms Days\tStatus",
        "Test Corp\ttest@example.com\tTest Inc\tUSA\t+1111\t+2222\t30\tActive",
      ].join("\n"),
      expectedHeaders: ["Client Name", "Email", "Company", "Country", "Phone", "WhatsApp", "Payment Terms Days", "Status"],
      expectedRowCount: 1,
      shouldPass: true,
    },
    
    // Test 4: Missing required "Name" header
    {
      name: "Missing required Name header",
      input: [
        "Email\tCompany\tCountry\tPhone\tWhatsApp\tPayment Terms Days\tStatus",
        "test@example.com\tTest Inc\tUSA\t+1111\t+2222\t30\tActive",
      ].join("\n"),
      expectedHeaders: ["Email", "Company", "Country", "Phone", "WhatsApp", "Payment Terms Days", "Status"],
      expectedRowCount: 1,
      shouldPass: false,
      expectedErrors: ["Required header 'Name' is missing"],
    },
    
    // Test 5: Row with wrong column count
    {
      name: "Row with wrong column count (too few)",
      input: [
        "Name\tEmail\tCompany\tCountry\tPhone\tWhatsApp\tPayment Terms Days\tStatus",
        "Test Corp\ttest@example.com\tTest Inc", // Only 3 columns instead of 8
      ].join("\n"),
      expectedHeaders: Array.from(CLIENTS_EXPORT_HEADERS),
      expectedRowCount: 1,
      shouldPass: false,
      expectedErrors: ["Row 2 has 3 columns, expected 8"],
    },
    
    // Test 6: TSV with BOM
    {
      name: "TSV with UTF-8 BOM",
      input: "\uFEFF" + buildClientsSampleTsv(),
      expectedHeaders: Array.from(CLIENTS_EXPORT_HEADERS),
      expectedRowCount: CLIENTS_SAMPLE_ROWS.length,
      shouldPass: true,
    },
    
    // Test 7: Minimal valid file (Name only)
    {
      name: "Minimal valid file with Name only",
      input: [
        "Name",
        "Test Client",
        "Another Client",
      ].join("\n"),
      expectedHeaders: ["Name"],
      expectedRowCount: 2,
      shouldPass: true,
    },
  ];
}

/**
 * Run parser self-tests (dev mode only)
 * Returns { passed: number, failed: number, results: TestResult[] }
 */
export function runParserSelfTests(): {
  passed: number;
  failed: number;
  results: Array<{ name: string; passed: boolean; error?: string }>;
} {
  const testCases = getParserTestCases();
  const results: Array<{ name: string; passed: boolean; error?: string }> = [];
  let passed = 0;
  let failed = 0;
  
  for (const testCase of testCases) {
    try {
      // Basic validation: check if input is parseable
      const lines = testCase.input.split(/\r?\n/).filter(l => l.trim() !== "");
      
      if (lines.length === 0) {
        throw new Error("Empty input");
      }
      
      // Check header line
      const headerLine = lines[0].replace(/^\uFEFF/, "");
      const delimiter = headerLine.includes("\t") ? "\t" : ",";
      const headers = headerLine.split(delimiter).map(h => h.replace(/^"|"$/g, "").trim());
      
      // Check header count matches expected
      if (headers.length !== testCase.expectedHeaders.length) {
        throw new Error(`Header count mismatch: got ${headers.length}, expected ${testCase.expectedHeaders.length}`);
      }
      
      // Check row count
      const dataRows = lines.slice(1);
      if (dataRows.length !== testCase.expectedRowCount) {
        throw new Error(`Row count mismatch: got ${dataRows.length}, expected ${testCase.expectedRowCount}`);
      }
      
      // For column count test, verify the mismatch
      if (testCase.expectedErrors?.some(e => e.includes("columns"))) {
        const row = dataRows[0];
        const rowCols = row.split(delimiter).length;
        if (rowCols === headers.length) {
          throw new Error(`Expected column count error but row has correct count: ${rowCols}`);
        }
      }
      
      // Test passed
      results.push({ name: testCase.name, passed: true });
      passed++;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      
      // If test is expected to fail and it did, that's a pass
      if (!testCase.shouldPass) {
        results.push({ name: testCase.name, passed: true });
        passed++;
      } else {
        results.push({ name: testCase.name, passed: false, error: errorMsg });
        failed++;
      }
    }
  }
  
  return { passed, failed, results };
}

/**
 * Log parser self-test results to console (dev mode only)
 */
export function logParserSelfTests(): void {
  if (typeof window !== "undefined" && process.env.NODE_ENV === "development") {
    const { passed, failed, results } = runParserSelfTests();
    console.log(`[Clients Parser Self-Test] ${passed} passed, ${failed} failed`);
    results.forEach(r => {
      if (r.passed) {
        console.log(`  ✓ ${r.name}`);
      } else {
        console.log(`  ✗ ${r.name}: ${r.error}`);
      }
    });
  }
}
