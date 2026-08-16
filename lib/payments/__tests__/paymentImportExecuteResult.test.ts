import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  extractRpcImportPaymentsResults,
  mapRpcPaymentImportResults,
  parseRpcPaymentImportRowResult,
} from "../paymentImportExecuteResult";

const PREVIEW_ROWS = [
  { rowId: "row-1", rowIndex: 1, action: "insert" },
  { rowId: "row-2", rowIndex: 2, action: "update" },
  { rowId: "row-3", rowIndex: 3, action: "skip" },
];

const PROCESSED_ROWS = [
  { rowId: "row-1", rowIndex: 1, action: "insert" },
  { rowId: "row-2", rowIndex: 2, action: "update" },
];

describe("payment import execute result contract", () => {
  it("A — successful INSERT with payment_id and no error maps to ok", () => {
    const parsed = parseRpcPaymentImportRowResult({
      rowId: "row-1",
      status: "ok",
      payment_id: "e2bd1d4a-4d87-4b97-8a6d-931836ecfe3c",
      error: null,
    });

    assert.equal(parsed.status, "ok");
    assert.equal(parsed.payment_id, "e2bd1d4a-4d87-4b97-8a6d-931836ecfe3c");
    assert.equal(parsed.error_message, null);

    const mapped = mapRpcPaymentImportResults({
      rpcData: {
        ok: true,
        results: [
          {
            rowId: "row-1",
            status: "ok",
            payment_id: "e2bd1d4a-4d87-4b97-8a6d-931836ecfe3c",
            error: null,
          },
        ],
      },
      previewRows: PREVIEW_ROWS,
      processedRows: PROCESSED_ROWS,
    });

    assert.equal(mapped.get("row-1")?.status, "ok");
    assert.equal(
      mapped.get("row-1")?.payment_id,
      "e2bd1d4a-4d87-4b97-8a6d-931836ecfe3c"
    );
  });

  it("B — successful UPDATE maps to ok", () => {
    const mapped = mapRpcPaymentImportResults({
      rpcData: {
        ok: true,
        results: [
          {
            rowId: "row-2",
            status: "ok",
            payment_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
            error: null,
          },
        ],
      },
      previewRows: PREVIEW_ROWS,
      processedRows: PROCESSED_ROWS,
    });

    assert.equal(mapped.get("row-2")?.status, "ok");
    assert.equal(
      mapped.get("row-2")?.payment_id,
      "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
    );
  });

  it("C — RPC row failure with error maps to failed", () => {
    const parsed = parseRpcPaymentImportRowResult({
      rowId: "row-1",
      status: "failed",
      payment_id: null,
      error: "Payment exceeds invoice outstanding balance.",
    });

    assert.equal(parsed.status, "failed");
    assert.equal(parsed.payment_id, null);
    assert.match(parsed.error_message ?? "", /outstanding balance/);
  });

  it("D — mixed batch preserves per-row success and failure", () => {
    const mapped = mapRpcPaymentImportResults({
      rpcData: {
        ok: false,
        results: [
          {
            rowId: "row-1",
            status: "ok",
            payment_id: "11111111-1111-1111-1111-111111111111",
            error: null,
          },
          {
            rowId: "row-2",
            status: "failed",
            payment_id: null,
            error: "Payment exceeds invoice outstanding balance.",
          },
        ],
      },
      previewRows: PREVIEW_ROWS,
      processedRows: PROCESSED_ROWS,
    });

    assert.equal(mapped.get("row-1")?.status, "ok");
    assert.equal(mapped.get("row-2")?.status, "failed");
    assert.match(mapped.get("row-2")?.error_message ?? "", /outstanding balance/);
  });

  it("E — overpayment rejection remains failed with no payment_id", () => {
    const mapped = mapRpcPaymentImportResults({
      rpcData: {
        ok: false,
        results: [
          {
            rowId: "row-1",
            status: "failed",
            payment_id: null,
            error:
              "Payment exceeds invoice outstanding balance. Invoice INV-0050: payment 2600, available 2500.",
          },
        ],
      },
      previewRows: PREVIEW_ROWS,
      processedRows: PROCESSED_ROWS,
    });

    const result = mapped.get("row-1");
    assert.equal(result?.status, "failed");
    assert.equal(result?.payment_id, null);
    assert.match(result?.error_message ?? "", /outstanding balance/);
  });

  it("extractRpcImportPaymentsResults reads canonical envelope.results", () => {
    const results = extractRpcImportPaymentsResults({
      ok: true,
      results: [{ rowId: "row-1", status: "ok" }],
    });
    assert.equal(results.length, 1);
  });

  it("legacy action-based rows remain supported", () => {
    const parsed = parseRpcPaymentImportRowResult({
      row_id: 1,
      action: "INSERT",
      payment_id: "legacy-id",
      error_message: null,
    });
    assert.equal(parsed.status, "ok");
    assert.equal(parsed.payment_id, "legacy-id");
  });

  it("production regression — status ok must not be treated as failed when action absent", () => {
    const parsed = parseRpcPaymentImportRowResult({
      rowId: "row-1",
      status: "ok",
      payment_id: "e2bd1d4a-4d87-4b97-8a6d-931836ecfe3c",
      error: null,
    });
    assert.notEqual(parsed.status, "failed");
  });
});

describe("executePaymentsImport wiring", () => {
  it("F — preview semantics unchanged; execute uses canonical RPC result parser", () => {
    const src = readFileSync(
      "app/[workspaceId]/settings/import/actions/payments.ts",
      "utf8"
    );
    assert.match(src, /validatePaymentImportBatchOverpay/);
    assert.match(src, /mapRpcPaymentImportResults/);
    assert.doesNotMatch(
      src.slice(src.indexOf("export async function executePaymentsImport")),
      /action === "INSERT"/
    );
  });
});
