import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  EXPECTED_RESTORE_OVERPAY_MESSAGE,
  isExpectedPaymentManualRpcError,
  mapUnarchivePaymentRpcError,
  mapUpdatePaymentRpcError,
} from "../mapCreatePaymentRpcError";

const MIGRATION_PATH =
  "supabase/migrations/20260825140000_rpc_unarchive_payment_manual_and_legacy_paid.sql";
const ACTIONS_PATH = "app/[workspaceId]/payments/actions.ts";
const INTEGRATION_SQL_PATH = "scripts/db/rpcUnarchivePaymentManual.integration.sql";

function readUnarchiveBlock(): string {
  const src = readFileSync(ACTIONS_PATH, "utf8");
  return src.slice(
    src.indexOf("export async function unarchivePayment"),
    src.indexOf("export async function bulkArchivePayments")
  );
}

function readBulkUnarchiveBlock(): string {
  const src = readFileSync(ACTIONS_PATH, "utf8");
  return src.slice(
    src.indexOf("export async function bulkUnarchivePayments"),
    src.length
  );
}

describe("payment restore + legacy paid hardening", () => {
  const migration = readFileSync(MIGRATION_PATH, "utf8");
  const unarchiveBlock = readUnarchiveBlock();
  const bulkUnarchiveBlock = readBulkUnarchiveBlock();
  const integrationSql = readFileSync(INTEGRATION_SQL_PATH, "utf8");

  it("migration defines rpc_unarchive_payment_manual with SECURITY DEFINER hardening", () => {
    assert.match(migration, /CREATE OR REPLACE FUNCTION public\.rpc_unarchive_payment_manual/);
    assert.match(migration, /SECURITY DEFINER/);
    assert.match(migration, /SET search_path = pg_catalog, public/);
    assert.match(migration, /auth\.uid\(\)/);
    assert.match(migration, /REVOKE EXECUTE[\s\S]*FROM PUBLIC/);
    assert.match(migration, /REVOKE EXECUTE[\s\S]*FROM anon/);
    assert.match(migration, /GRANT EXECUTE[\s\S]*TO authenticated/);
    assert.doesNotMatch(migration, /GRANT EXECUTE[\s\S]*TO service_role/);
  });

  it("restore RPC locks invoice before outstanding read and payment lock", () => {
    const restoreFn = migration.slice(
      migration.indexOf("CREATE OR REPLACE FUNCTION public.rpc_unarchive_payment_manual"),
      migration.indexOf("REVOKE EXECUTE ON FUNCTION public.rpc_unarchive_payment_manual")
    );
    const invoiceLockIdx = restoreFn.indexOf("FROM public.invoices i");
    const invoiceForUpdateIdx = restoreFn.indexOf("FOR UPDATE", invoiceLockIdx);
    const paymentLockIdx = restoreFn.indexOf(
      "FROM public.payments p",
      invoiceForUpdateIdx
    );
    const paymentForUpdateIdx = restoreFn.indexOf("FOR UPDATE", paymentLockIdx);
    const outstandingIdx = restoreFn.indexOf("FROM public.invoices_view iv");
    assert.ok(invoiceForUpdateIdx > invoiceLockIdx);
    assert.ok(paymentForUpdateIdx > invoiceForUpdateIdx);
    assert.ok(outstandingIdx > paymentForUpdateIdx);
  });

  it("restore uses COALESCE(net_amount, amount) and effective statuses NULL/completed/paid", () => {
    const restoreFn = migration.slice(
      migration.indexOf("CREATE OR REPLACE FUNCTION public.rpc_unarchive_payment_manual"),
      migration.indexOf("REVOKE EXECUTE ON FUNCTION public.rpc_unarchive_payment_manual")
    );
    assert.match(restoreFn, /COALESCE\(v_payment\.net_amount, v_payment\.amount\)/);
    assert.match(restoreFn, /v_payment_status IN \('completed', 'paid'\)/);
    assert.match(restoreFn, /Restoring this payment would exceed the invoice outstanding balance\./);
  });

  it("update RPC new_effective includes legacy paid status", () => {
    assert.match(
      migration,
      /v_new_effective := CASE[\s\S]*WHEN v_status IS NULL OR v_status IN \('completed', 'paid'\)/
    );
  });

  it("legacy paid update delta maps overpay to canonical message", () => {
    const mapped = mapUpdatePaymentRpcError({
      code: "P0001",
      message:
        "Updating this payment would result in overpayment. Current outstanding: 100.00, payment change: +50.00.",
    });
    assert.match(mapped.error, /exceeds the invoice outstanding balance/);
    assert.equal(isExpectedPaymentManualRpcError(mapped), true);
  });

  it("restore overpay maps to clean expected message", () => {
    const mapped = mapUnarchivePaymentRpcError({
      code: "P0001",
      message: EXPECTED_RESTORE_OVERPAY_MESSAGE,
    });
    assert.equal(mapped.error, EXPECTED_RESTORE_OVERPAY_MESSAGE);
    assert.equal(isExpectedPaymentManualRpcError(mapped), true);
  });

  it("unarchivePayment delegates to atomic restore helper", () => {
    assert.match(unarchiveBlock, /restorePaymentViaRpc/);
    assert.doesNotMatch(unarchiveBlock, /wouldRestorePaymentCauseOverpay/);
    assert.doesNotMatch(unarchiveBlock, /\.update\(\{ archived_at: null \}\)/);
    const actionsSrc = readFileSync(ACTIONS_PATH, "utf8");
    assert.match(actionsSrc, /rpc_unarchive_payment_manual/);
  });

  it("bulkUnarchive restores sequentially via atomic RPC", () => {
    assert.match(bulkUnarchiveBlock, /restorePaymentViaRpc/);
    assert.match(bulkUnarchiveBlock, /\[\.\.\.paymentIds\]\.sort\(\)/);
    assert.doesNotMatch(bulkUnarchiveBlock, /validatePaymentUnarchiveBatchOverpay/);
    assert.doesNotMatch(bulkUnarchiveBlock, /\.in\("id", idsToUnarchive\)/);
  });

  it("successful restore audits; RPC failure path has no audit in helper loop before continue", () => {
    assert.match(unarchiveBlock, /logAuditEvent\([\s\S]*action: "unarchived"/);
    assert.match(bulkUnarchiveBlock, /logAuditEvent\([\s\S]*action: "unarchived"/);
    const restoreHelper = readFileSync(ACTIONS_PATH, "utf8").slice(
      readFileSync(ACTIONS_PATH, "utf8").indexOf("async function restorePaymentViaRpc"),
      readFileSync(ACTIONS_PATH, "utf8").indexOf("export async function createPayment")
    );
    assert.doesNotMatch(restoreHelper, /logAuditEvent/);
  });

  it("failed bulk restore returns clean message without throwing", () => {
    assert.doesNotMatch(bulkUnarchiveBlock, /throw new Error\(restoreResult\.error\)/);
    assert.match(bulkUnarchiveBlock, /return \{ ok: false, message: firstError \}/);
  });

  it("integration SQL proves restore success to 1000 and later rejection after capacity shrinks", () => {
    assert.match(integrationSql, /paid becomes 1000 exactly|v_paid <> 1000/);
    assert.match(integrationSql, /restore A \(700\) must reject/);
    assert.match(integrationSql, /Restoring this payment would exceed the invoice outstanding balance/);
    assert.match(integrationSql, /overpay rejection still restored payment A/);
  });

  it("create/update/restore serialize on public.invoices FOR UPDATE", () => {
    const createMigration = readFileSync(
      "supabase/migrations/20260825120000_rpc_create_payment_manual.sql",
      "utf8"
    );
    assert.match(createMigration, /FROM public\.invoices i[\s\S]*FOR UPDATE/);
    assert.match(migration, /FROM public\.invoices i[\s\S]*FOR UPDATE/);
  });
});

describe("payment restore effective amount semantics", () => {
  const restoreFn = readFileSync(MIGRATION_PATH, "utf8").slice(
    readFileSync(MIGRATION_PATH, "utf8").indexOf(
      "CREATE OR REPLACE FUNCTION public.rpc_unarchive_payment_manual"
    ),
    readFileSync(MIGRATION_PATH, "utf8").indexOf(
      "REVOKE EXECUTE ON FUNCTION public.rpc_unarchive_payment_manual"
    )
  );

  it("pending/failed/refunded archived payments set restore effective to 0", () => {
    assert.match(restoreFn, /v_restore_effective := CASE/);
    assert.match(restoreFn, /ELSE 0[\s\S]*END;/);
    assert.doesNotMatch(restoreFn, /'pending'/);
    assert.doesNotMatch(restoreFn, /'failed'/);
    assert.doesNotMatch(restoreFn, /'refunded'/);
  });
});
