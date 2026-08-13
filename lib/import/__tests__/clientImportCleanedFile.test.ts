import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  generateCleanedFile,
  generateExecutableCleanedFile,
  generateErrorReport,
  isExecutableImportPreviewRow,
} from "@/app/[workspaceId]/settings/import/_lib/downloadReports";
import { CLIENTS_EXPORT_HEADERS } from "@/app/[workspaceId]/settings/import/_spec/clients";

const HEADERS = CLIENTS_EXPORT_HEADERS;

const SAMPLE_NORMALIZED_ROWS = [
  {
    Name: "Acme Corp",
    Email: "client@example.com",
    Company: "Acme Corporation",
    Country: "United States",
    Phone: "+1234567890",
    WhatsApp: "+962781234567",
    "Payment Terms Days": "30",
    Status: "Active",
  },
  {
    Name: "Widget Inc",
    Email: "billing@widget.io",
    Company: "Widget Industries",
    Country: "United Kingdom",
    Phone: "",
    WhatsApp: "+447123456789",
    "Payment Terms Days": "15",
    Status: "Active",
  },
  {
    Name: "Global Services LLC",
    Email: "accounts@globalservices.com",
    Company: "",
    Country: "Germany",
    Phone: "+49301234567",
    WhatsApp: "",
    "Payment Terms Days": "45",
    Status: "Inactive",
  },
];

const MIXED_PREVIEW_ROWS = [
  { rowIndex: 1, action: "fail", reason: "Client is archived (email: client@example.com)" },
  { rowIndex: 2, action: "insert" },
  { rowIndex: 3, action: "update" },
];

function parseTsv(content: string): string[][] {
  return content
    .trim()
    .split("\n")
    .map((line) => line.split("\t"));
}

describe("client import cleaned file export", () => {
  it("A — mixed preview exports INSERT + UPDATE only", () => {
    const cleaned = generateExecutableCleanedFile(
      HEADERS,
      SAMPLE_NORMALIZED_ROWS,
      MIXED_PREVIEW_ROWS,
      "tsv"
    );
    const rows = parseTsv(cleaned);
    assert.equal(rows.length, 3); // header + 2 data rows
    assert.deepEqual(rows[0], [...HEADERS]);
    assert.equal(rows[1][0], "Widget Inc");
    assert.equal(rows[2][0], "Global Services LLC");
    assert.ok(!cleaned.includes("Acme Corp"));
  });

  it("B — reparse cleaned output contains no rejected FAIL row", () => {
    const cleaned = generateExecutableCleanedFile(
      HEADERS,
      SAMPLE_NORMALIZED_ROWS,
      MIXED_PREVIEW_ROWS,
      "tsv"
    );
    assert.doesNotMatch(cleaned, /client@example\.com/);
    assert.match(cleaned, /billing@widget\.io/);
    assert.match(cleaned, /accounts@globalservices\.com/);
  });

  it("C — archived client row is excluded, not converted", () => {
    const cleaned = generateExecutableCleanedFile(
      HEADERS,
      SAMPLE_NORMALIZED_ROWS,
      MIXED_PREVIEW_ROWS,
      "tsv"
    );
    assert.doesNotMatch(cleaned, /Acme Corp/);
    const failStillFail = MIXED_PREVIEW_ROWS.find((row) => row.action === "fail");
    assert.equal(failStillFail?.action, "fail");
  });

  it("D — Phone and WhatsApp remain separate columns", () => {
    const cleaned = generateExecutableCleanedFile(
      HEADERS,
      SAMPLE_NORMALIZED_ROWS,
      [{ rowIndex: 1, action: "insert" }],
      "tsv"
    );
    const dataRow = parseTsv(cleaned)[1];
    const phoneIdx = HEADERS.indexOf("Phone");
    const whatsappIdx = HEADERS.indexOf("WhatsApp");
    assert.equal(dataRow[phoneIdx], "+1234567890");
    assert.equal(dataRow[whatsappIdx], "+962781234567");
  });

  it("E — payment terms and status survive cleaned export", () => {
    const cleaned = generateExecutableCleanedFile(
      HEADERS,
      SAMPLE_NORMALIZED_ROWS,
      [{ rowIndex: 3, action: "update" }],
      "tsv"
    );
    const dataRow = parseTsv(cleaned)[1];
    assert.equal(dataRow[HEADERS.indexOf("Payment Terms Days")], "45");
    assert.equal(dataRow[HEADERS.indexOf("Status")], "Inactive");
  });

  it("F — CSV output escapes commas and remains parseable", () => {
    const rowsWithComma = [
      {
        ...SAMPLE_NORMALIZED_ROWS[1],
        Company: "Widget, Inc.",
      },
    ];
    const cleaned = generateExecutableCleanedFile(
      HEADERS,
      rowsWithComma,
      [{ rowIndex: 1, action: "insert" }],
      "csv"
    );
    assert.match(cleaned, /"Widget, Inc\."/);
    const lines = cleaned.trim().split("\n");
    assert.equal(lines.length, 2);
  });

  it("G — all-valid input keeps every executable row", () => {
    const allValidPreview = [
      { rowIndex: 1, action: "insert" },
      { rowIndex: 2, action: "insert" },
      { rowIndex: 3, action: "update" },
    ];
    const cleaned = generateExecutableCleanedFile(
      HEADERS,
      SAMPLE_NORMALIZED_ROWS,
      allValidPreview,
      "tsv"
    );
    const dataRows = parseTsv(cleaned).slice(1);
    assert.equal(dataRows.length, 3);
  });

  it("H — all-failed preview produces header-only cleaned file", () => {
    const cleaned = generateExecutableCleanedFile(
      HEADERS,
      SAMPLE_NORMALIZED_ROWS,
      [{ rowIndex: 1, action: "fail" }],
      "tsv"
    );
    const rows = parseTsv(cleaned);
    assert.equal(rows.length, 1);
    assert.deepEqual(rows[0], [...HEADERS]);
  });

  it("isExecutableImportPreviewRow identifies insert/update only", () => {
    assert.equal(isExecutableImportPreviewRow("insert"), true);
    assert.equal(isExecutableImportPreviewRow("update"), true);
    assert.equal(isExecutableImportPreviewRow("fail"), false);
    assert.equal(isExecutableImportPreviewRow("skip"), false);
  });

  it("error report still contains failed rows only", () => {
    const report = generateErrorReport(
      HEADERS,
      SAMPLE_NORMALIZED_ROWS,
      MIXED_PREVIEW_ROWS.map((row) => ({
        rowIndex: row.rowIndex,
        action: row.action,
        reason: "reason" in row ? row.reason : undefined,
      })),
      "tsv"
    );
    assert.match(report, /Acme Corp/);
    assert.match(report, /Error Reason/);
    assert.doesNotMatch(report, /Widget Inc\t/);
  });

  it("legacy generateCleanedFile still exports all rows when unfiltered", () => {
    const allRows = generateCleanedFile(HEADERS, SAMPLE_NORMALIZED_ROWS, "tsv");
    const dataRows = parseTsv(allRows).slice(1);
    assert.equal(dataRows.length, 3);
  });
});
