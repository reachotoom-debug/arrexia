import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const PAYMENTS_ACTION_PATH =
  "app/[workspaceId]/settings/import/actions/payments.ts";
const LIFECYCLE_MIGRATION_PATH =
  "supabase/migrations/20260826120000_rpc_import_payments_lifecycle_hardening.sql";
const MANUAL_PAYMENT_MIGRATION_PATH =
  "supabase/migrations/20260825120000_rpc_create_payment_manual.sql";
const INTEGRATION_SQL_PATH =
  "scripts/db/paymentImportLifecycle.integration.sql";

function readRpcBody(migrationPath: string): string {
  const migration = readFileSync(migrationPath, "utf8");
  const start = migration.indexOf(
    "CREATE OR REPLACE FUNCTION public.rpc_import_payments("
  );
  const end = migration.indexOf("$$;", start);
  assert.ok(start >= 0 && end > start, `expected rpc_import_payments in ${migrationPath}`);
  return migration.slice(start, end);
}

describe("IMP-004 — custom invoice number compatibility", () => {
  const src = readFileSync(PAYMENTS_ACTION_PATH, "utf8");
  const previewBlock = src.slice(
    src.indexOf("export async function previewPaymentsImport"),
    src.indexOf("export async function executePaymentsImport")
  );

  it("does not enforce INV- prefix format in preview", () => {
    assert.doesNotMatch(previewBlock, /\^INV-\\d\+/);
    assert.doesNotMatch(previewBlock, /Expected format: INV-####/);
    assert.doesNotMatch(previewBlock, /Invalid invoice number format/);
  });

  it("accepts arbitrary invoice numbers via workspace-scoped exact lookup", () => {
    assert.match(
      previewBlock,
      /from\("invoices_view"\)[\s\S]*\.eq\("invoice_number", invoiceNumber\)/
    );
    assert.match(previewBlock, /\.eq\("workspace_id", workspaceId\)/);
  });

  it("TEST-IMP-004 path — custom number resolves when present in workspace", () => {
    assert.match(previewBlock, /Invoice not found:/);
    assert.doesNotMatch(
      previewBlock,
      /invoiceNumberPattern|INV-\d\+/
    );
  });

  it("INV-0004 standard numbers remain supported (no format gate)", () => {
    assert.match(previewBlock, /invoiceNumber = invoiceNumberRaw/);
    assert.doesNotMatch(previewBlock, /\.test\(invoiceNumber/);
  });

  it("blank invoice number fails with required message", () => {
    assert.match(previewBlock, /Invoice Number is required/);
  });

  it("nonexistent custom number fails with invoice not found", () => {
    assert.match(previewBlock, /reason: `Invoice not found: \$\{invoiceNumber\}`/);
  });

  it("workspace isolation — lookup scoped to workspaceId", () => {
    const invoiceLookup = previewBlock.slice(
      previewBlock.indexOf("Resolve invoice by exact workspace_id"),
      previewBlock.indexOf("Lifecycle parity with rpc_create_payment_manual")
    );
    assert.match(invoiceLookup, /\.eq\("workspace_id", workspaceId\)/);
    assert.match(invoiceLookup, /\.eq\("invoice_number", invoiceNumber\)/);
    assert.doesNotMatch(invoiceLookup, /other.*workspace/i);
  });
});

describe("PAY-IMP-NEW-001 — payment import lifecycle hardening migration", () => {
  const migration = readFileSync(LIFECYCLE_MIGRATION_PATH, "utf8");
  const rpcBody = readRpcBody(LIFECYCLE_MIGRATION_PATH);
  const manualRpc = readFileSync(MANUAL_PAYMENT_MIGRATION_PATH, "utf8");

  it("successor migration replaces canonical rpc_import_payments", () => {
    assert.match(migration, /CREATE OR REPLACE FUNCTION public\.rpc_import_payments\(/);
    assert.match(LIFECYCLE_MIGRATION_PATH, /20260826120000_rpc_import_payments_lifecycle_hardening\.sql$/);
  });

  it("sent/payable invoice path — overpay guard still present after lifecycle checks", () => {
    const lifecycleIdx = rpcBody.indexOf("PAY-IMP-NEW-001");
    const overpayIdx = rpcBody.indexOf("Overpayment guard", lifecycleIdx);
    assert.ok(lifecycleIdx >= 0 && overpayIdx > lifecycleIdx);
    assert.match(rpcBody, /Payment exceeds invoice outstanding balance/);
    assert.match(rpcBody, /_payment_import_capacity/);
    assert.match(rpcBody, /FOR UPDATE/);
  });

  it("draft invoice rejects with manual-payment message", () => {
    assert.match(rpcBody, /Cannot create payment for draft invoice\. Invoice must be sent first\./);
    assert.match(manualRpc, /Cannot create payment for draft invoice\. Invoice must be sent first\./);
  });

  it("void invoice rejects", () => {
    assert.match(rpcBody, /Cannot create payment for void invoice/);
    assert.match(manualRpc, /Cannot create payment for void invoice/);
  });

  it("archived invoice excluded at lookup", () => {
    assert.match(rpcBody, /archived_at IS NULL/);
  });

  it("inactive client rejects", () => {
    assert.match(rpcBody, /Cannot create payment for inactive client/);
    assert.match(rpcBody, /v_client_is_active IS NOT TRUE/);
    assert.match(manualRpc, /Cannot create payment for inactive client/);
  });

  it("archived client rejects", () => {
    assert.match(rpcBody, /Cannot create payment for archived client/);
    assert.match(manualRpc, /Cannot create payment for archived client/);
  });

  it("pending/failed semantics unchanged", () => {
    assert.match(rpcBody, /NOT IN \('completed', 'pending', 'failed'\)/);
    assert.match(rpcBody, /WHEN v_status IS NULL OR v_status IN \('completed', 'paid'\) THEN v_amount/);
    assert.match(rpcBody, /ELSE 0\s+END;/);
  });

  it("invoice FOR UPDATE before lifecycle and overpay", () => {
    const lockIdx = rpcBody.indexOf("FOR UPDATE");
    const lifecycleIdx = rpcBody.indexOf("PAY-IMP-NEW-001");
    const overpayIdx = rpcBody.indexOf("Overpayment guard", lifecycleIdx);
    assert.ok(lockIdx >= 0 && lockIdx < lifecycleIdx && overpayIdx > lifecycleIdx);
  });

  it("service_role-only ACL re-applied after CREATE OR REPLACE", () => {
    assert.match(
      migration,
      /REVOKE ALL ON FUNCTION public\.rpc_import_payments\(uuid, jsonb, boolean\) FROM PUBLIC/i
    );
    assert.match(
      migration,
      /REVOKE EXECUTE ON FUNCTION public\.rpc_import_payments\(uuid, jsonb, boolean\) FROM anon/i
    );
    assert.match(
      migration,
      /REVOKE EXECUTE ON FUNCTION public\.rpc_import_payments\(uuid, jsonb, boolean\) FROM authenticated/i
    );
    assert.match(
      migration,
      /GRANT EXECUTE ON FUNCTION public\.rpc_import_payments\(uuid, jsonb, boolean\) TO service_role/i
    );
    assert.doesNotMatch(migration, /GRANT EXECUTE[\s\S]*TO authenticated/i);
  });

  it("integration SQL documents lifecycle rejection scenarios", () => {
    const sql = readFileSync(INTEGRATION_SQL_PATH, "utf8");
    assert.match(sql, /rpc_import_payments/);
    assert.match(sql, /draft invoice/i);
    assert.match(sql, /void invoice/i);
    assert.match(sql, /inactive client/i);
    assert.match(sql, /archived client/i);
    assert.match(sql, /sent invoice accepts payment/i);
  });
});

describe("PAY-IMP-NEW-001 — preview lifecycle parity", () => {
  const src = readFileSync(PAYMENTS_ACTION_PATH, "utf8");
  const lifecycleBlock = src.slice(
    src.indexOf("Lifecycle parity with rpc_create_payment_manual"),
    src.indexOf("// Handle transaction_id")
  );

  it("preview rejects draft, void, inactive, and archived client", () => {
    assert.match(lifecycleBlock, /base_status === "void"/);
    assert.match(lifecycleBlock, /base_status === "draft"/);
    assert.match(lifecycleBlock, /Cannot create payment for archived client/);
    assert.match(lifecycleBlock, /Cannot create payment for inactive client/);
  });
});

describe("payment import currency resolution (rpc_import_payments)", () => {
  const rpcBody = readRpcBody(LIFECYCLE_MIGRATION_PATH);

  it("does not default blank CSV currency to USD before invoice lookup", () => {
    const preInvoiceSection = rpcBody.slice(
      rpcBody.indexOf("Extract optional fields"),
      rpcBody.indexOf("Find invoice by workspace_id")
    );
    assert.doesNotMatch(preInvoiceSection, /v_currency := 'USD'/);
    assert.match(preInvoiceSection, /Validate explicit currency only/);
  });

  it("blank CSV currency + JOD invoice => JOD (invoice fallback after lookup)", () => {
    const invoiceCurrencyBlock = rpcBody.slice(
      rpcBody.indexOf("Use invoice currency if CSV currency is empty"),
      rpcBody.indexOf("Invoice row lock")
    );
    assert.match(
      invoiceCurrencyBlock,
      /IF v_currency IS NULL OR v_currency = '' THEN[\s\S]*v_currency := COALESCE\(v_invoice_currency, 'USD'\)/
    );
  });

  it("blank CSV currency + USD invoice => USD via invoice fallback", () => {
    assert.match(rpcBody, /COALESCE\(v_invoice_currency, 'USD'\)/);
    const postInvoiceFallback = rpcBody.match(
      /IF v_currency IS NULL OR v_currency = '' THEN[\s\S]*?v_currency := COALESCE\(v_invoice_currency, 'USD'\)/m
    );
    assert.ok(postInvoiceFallback);
  });

  it("explicit EUR CSV currency remains EUR (no overwrite after invoice lookup)", () => {
    const postLookupCurrency = rpcBody.slice(
      rpcBody.indexOf("Use invoice currency if CSV currency is empty"),
      rpcBody.indexOf("PAY-IMP-NEW-001")
    );
    assert.match(postLookupCurrency, /IF v_currency IS NULL OR v_currency = '' THEN/);
    assert.doesNotMatch(postLookupCurrency, /v_currency := 'EUR'/);
    assert.doesNotMatch(postLookupCurrency, /v_currency := EXCLUDED\.currency/);
  });

  it("malformed explicit currency still fails validation", () => {
    assert.match(
      rpcBody,
      /IF v_currency IS NOT NULL THEN[\s\S]*Invalid currency: %s \(must be 3-letter ISO code\)/
    );
    assert.match(rpcBody, /LENGTH\(v_currency\) <> 3 OR NOT \(v_currency ~ '\^\[A-Z\]\{3\}\$'\)/);
  });
});
