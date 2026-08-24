import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  getPaymentCreationBlockReason,
  paymentCreationBlockMessage,
} from "@/lib/receivables/operationalEligibility";
import {
  mapCreatePaymentRpcError,
  mapUpdatePaymentRpcError,
} from "../mapCreatePaymentRpcError";
import { PaymentFormSchema } from "../schema";
import { getEffectivePaymentAmount } from "../paymentImportOverpay";

const MIGRATION_PATH =
  "supabase/migrations/20260825120000_rpc_create_payment_manual.sql";
const ACTIONS_PATH = "app/[workspaceId]/payments/actions.ts";
const INTEGRATION_SQL_PATH =
  "scripts/db/rpcCreatePaymentManualConcurrency.integration.sql";

function readFunctionBlock(startMarker: string, endMarker: string): string {
  const src = readFileSync(ACTIONS_PATH, "utf8");
  return src.slice(src.indexOf(startMarker), src.indexOf(endMarker));
}

function readCreatePaymentBlock(): string {
  return readFunctionBlock(
    "export async function createPayment",
    "export async function updatePayment"
  );
}

function readUpdatePaymentBlock(): string {
  return readFunctionBlock(
    "export async function updatePayment",
    "export async function deletePayment"
  );
}

describe("manual payment create + update concurrency hardening", () => {
  const migration = readFileSync(MIGRATION_PATH, "utf8");
  const createBlock = readCreatePaymentBlock();
  const updateBlock = readUpdatePaymentBlock();
  const integrationSql = readFileSync(INTEGRATION_SQL_PATH, "utf8");

  describe("createPayment", () => {
    it("delegates to rpc_create_payment_manual", () => {
      assert.match(createBlock, /\.rpc\(\s*["']rpc_create_payment_manual["']/);
      assert.doesNotMatch(
        createBlock,
        /\.from\(["']payments["']\)\s*\n?\s*\.insert\(/
      );
    });

    it("keeps entitlement and auth before RPC", () => {
      assert.match(createBlock, /requireUser\(\)/);
      assert.match(createBlock, /requireWorkspace\(workspaceId\)/);
      assert.match(createBlock, /getPaymentMutationEntitlementBlock/);
      const entitlementIdx = createBlock.indexOf("getPaymentMutationEntitlementBlock");
      const rpcIdx = createBlock.indexOf('"rpc_create_payment_manual"');
      assert.ok(entitlementIdx >= 0 && rpcIdx > entitlementIdx);
    });

    it("preserves audit log and revalidation after RPC", () => {
      assert.match(createBlock, /logAuditEvent\(/);
      assert.match(createBlock, /revalidateFinancialSurfacesAfterPayment/);
      assert.match(createBlock, /return \{ id: data\.id \}/);
    });

    it("maps duplicate transaction_id to user-facing error", () => {
      assert.match(createBlock, /mapCreatePaymentRpcError/);
      const mapped = mapCreatePaymentRpcError({
        code: "23505",
        message:
          "A payment with this transaction reference already exists in this workspace.",
      });
      assert.match(mapped.error, /transaction reference already exists/);
    });
  });

  describe("updatePayment", () => {
    it("delegates to rpc_update_payment_manual", () => {
      assert.match(updateBlock, /\.rpc\(\s*["']rpc_update_payment_manual["']/);
      assert.doesNotMatch(
        updateBlock,
        /\.from\(["']invoices_view["']\)/
      );
      assert.doesNotMatch(
        updateBlock,
        /\.from\(["']payments["']\)\s*\n?\s*\.update\(/
      );
    });

    it("keeps entitlement and auth before RPC", () => {
      assert.match(updateBlock, /requireUser\(\)/);
      assert.match(updateBlock, /requireWorkspace\(workspaceId\)/);
      assert.match(updateBlock, /getPaymentMutationEntitlementBlock/);
      const entitlementIdx = updateBlock.indexOf("getPaymentMutationEntitlementBlock");
      const rpcIdx = updateBlock.indexOf('"rpc_update_payment_manual"');
      assert.ok(entitlementIdx >= 0 && rpcIdx > entitlementIdx);
    });

    it("preserves audit log and revalidation after RPC", () => {
      assert.match(updateBlock, /logAuditEvent\(/);
      assert.match(updateBlock, /revalidateFinancialSurfacesAfterPayment/);
      assert.match(updateBlock, /return \{ success: true \}/);
    });

    it("maps overpayment and duplicate transaction_id errors", () => {
      assert.match(updateBlock, /mapUpdatePaymentRpcError/);
      const overpay = mapUpdatePaymentRpcError({
        message:
          "Updating this payment would result in overpayment. Current outstanding: 300.00, payment change: +700.00.",
      });
      assert.match(overpay.error, /exceeds the invoice outstanding balance/);
      const dup = mapUpdatePaymentRpcError({
        code: "23505",
        message:
          "A payment with this transaction reference already exists in this workspace.",
      });
      assert.match(dup.error, /transaction reference already exists/);
    });
  });

  describe("migration contract", () => {
    it("create RPC locks invoice FOR UPDATE before outstanding check", () => {
      const createFn = migration.slice(
        migration.indexOf("CREATE OR REPLACE FUNCTION public.rpc_create_payment_manual"),
        migration.indexOf("CREATE OR REPLACE FUNCTION public.rpc_update_payment_manual")
      );
      assert.match(createFn, /FROM public\.invoices i[\s\S]*FOR UPDATE/);
      const lockIdx = createFn.indexOf("FOR UPDATE");
      const viewIdx = createFn.indexOf("FROM public.invoices_view iv");
      assert.ok(lockIdx > 0 && viewIdx > lockIdx);
    });

    it("update RPC locks invoice FOR UPDATE before effective delta validation", () => {
      const updateFn = migration.slice(
        migration.indexOf("CREATE OR REPLACE FUNCTION public.rpc_update_payment_manual")
      );
      assert.match(updateFn, /FROM public\.invoices i[\s\S]*FOR UPDATE/);
      const lockIdx = updateFn.indexOf("FOR UPDATE");
      const viewIdx = updateFn.indexOf("FROM public.invoices_view iv");
      const deltaAssignIdx = updateFn.indexOf("v_effective_delta := v_new_effective - v_old_effective");
      assert.ok(lockIdx > 0 && viewIdx > lockIdx && deltaAssignIdx > viewIdx);
    });

    it("update RPC re-reads payment FOR UPDATE after invoice lock", () => {
      const updateFn = migration.slice(
        migration.indexOf("CREATE OR REPLACE FUNCTION public.rpc_update_payment_manual")
      );
      const invoiceLockIdx = updateFn.indexOf(
        "Lock invoice first (shared serialization point with rpc_create_payment_manual)"
      );
      const paymentRereadIdx = updateFn.indexOf(
        "Re-read and lock payment after invoice lock"
      );
      const paymentLockIdx = updateFn.indexOf(
        "FROM public.payments p",
        paymentRereadIdx
      );
      const paymentForUpdateIdx = updateFn.indexOf("FOR UPDATE", paymentLockIdx);
      assert.ok(
        invoiceLockIdx >= 0 &&
          paymentRereadIdx > invoiceLockIdx &&
          paymentLockIdx > paymentRereadIdx &&
          paymentForUpdateIdx > paymentLockIdx
      );
      assert.doesNotMatch(
        updateFn.slice(invoiceLockIdx, paymentRereadIdx),
        /FROM public\.payments p[\s\S]*FOR UPDATE/
      );
    });

    it("update RPC lock ordering is invoice FOR UPDATE then payment FOR UPDATE", () => {
      const updateFn = migration.slice(
        migration.indexOf("CREATE OR REPLACE FUNCTION public.rpc_update_payment_manual")
      );
      const invoiceForUpdateIdx = updateFn.indexOf(
        "FROM public.invoices i",
        updateFn.indexOf("Lock invoice first")
      );
      const paymentForUpdateIdx = updateFn.indexOf(
        "FOR UPDATE",
        updateFn.indexOf("Re-read and lock payment after invoice lock")
      );
      assert.ok(invoiceForUpdateIdx >= 0 && paymentForUpdateIdx > invoiceForUpdateIdx);
    });

    it("update RPC old/new effective amounts use COALESCE(net_amount, amount)", () => {
      const updateFn = migration.slice(
        migration.indexOf("CREATE OR REPLACE FUNCTION public.rpc_update_payment_manual")
      );
      assert.match(
        updateFn,
        /THEN COALESCE\(v_payment\.net_amount, v_payment\.amount\)/
      );
      assert.match(
        updateFn,
        /THEN COALESCE\(v_payment\.net_amount, p_amount\)/
      );
    });

    it("update RPC preserves existing edit restrictions (archived invoice only)", () => {
      const updateFn = migration.slice(
        migration.indexOf("CREATE OR REPLACE FUNCTION public.rpc_update_payment_manual")
      );
      assert.match(updateFn, /iv\.archived_at IS NULL/);
      assert.doesNotMatch(updateFn, /Cannot create payment for draft invoice/);
      assert.doesNotMatch(updateFn, /Cannot create payment for inactive client/);
    });

    it("create RPC retains draft/inactive/archived client guards (unchanged)", () => {
      const createFn = migration.slice(
        migration.indexOf("CREATE OR REPLACE FUNCTION public.rpc_create_payment_manual"),
        migration.indexOf("CREATE OR REPLACE FUNCTION public.rpc_update_payment_manual")
      );
      assert.match(createFn, /Cannot create payment for draft invoice/);
      assert.match(createFn, /Cannot create payment for inactive client/);
    });

    it("both RPCs lock the same invoices row (shared table + FOR UPDATE)", () => {
      assert.match(migration, /rpc_create_payment_manual[\s\S]*FROM public\.invoices i/);
      assert.match(migration, /rpc_update_payment_manual[\s\S]*FROM public\.invoices i/);
    });

    it("create uses invoices_view outstanding with tolerance", () => {
      assert.match(migration, /v_outstanding \+ v_tolerance/);
      assert.match(
        migration,
        /Payment amount \(%\) exceeds the invoice outstanding balance/
      );
    });

    it("update uses effective delta against outstanding with tolerance", () => {
      assert.match(migration, /v_effective_delta := v_new_effective - v_old_effective/);
      assert.match(migration, /v_new_outstanding := v_outstanding - v_effective_delta/);
      assert.match(migration, /v_new_outstanding < -v_tolerance/);
      assert.match(
        migration,
        /Updating this payment would result in overpayment/
      );
    });

    it("update counts legacy paid status in old effective amount", () => {
      const updateFn = migration.slice(
        migration.indexOf("CREATE OR REPLACE FUNCTION public.rpc_update_payment_manual")
      );
      assert.match(updateFn, /v_old_status IN \('completed', 'paid'\)/);
    });

    it("update rejects client/invoice reassignment", () => {
      assert.match(migration, /Cannot change client for an existing payment/);
      assert.match(migration, /Cannot change invoice for an existing payment/);
    });

    it("create preserves archived/inactive/void/draft guards", () => {
      assert.match(migration, /Cannot create payment for archived invoice/);
      assert.match(migration, /Cannot create payment for archived client/);
      assert.match(migration, /Cannot create payment for inactive client/);
      assert.match(migration, /Cannot create payment for void invoice/);
      assert.match(migration, /Cannot create payment for draft invoice/);
    });

    it("SECURITY DEFINER hardening and authenticated-only grants on both RPCs", () => {
      assert.match(migration, /SECURITY DEFINER/);
      assert.match(migration, /SET search_path = pg_catalog, public/);
      assert.match(migration, /auth\.uid\(\)/);
      assert.match(migration, /REVOKE EXECUTE[\s\S]*FROM PUBLIC/);
      assert.match(migration, /REVOKE EXECUTE[\s\S]*FROM anon/);
      assert.match(migration, /GRANT EXECUTE[\s\S]*TO authenticated/);
      assert.doesNotMatch(migration, /GRANT EXECUTE[\s\S]*TO service_role/);
      assert.match(migration, /rpc_update_payment_manual[\s\S]*REVOKE EXECUTE/);
      assert.match(migration, /rpc_update_payment_manual[\s\S]*GRANT EXECUTE/);
    });
  });

  describe("status semantics", () => {
    it("pending/failed/refunded are non-effective; completed is effective", () => {
      assert.equal(getEffectivePaymentAmount(700, "pending"), 0);
      assert.equal(getEffectivePaymentAmount(700, "completed"), 700);
      assert.equal(getEffectivePaymentAmount(700, "failed"), 0);
      assert.equal(getEffectivePaymentAmount(700, "refunded"), 0);
    });

    it("operational eligibility messages align with create RPC copy", () => {
      assert.equal(
        paymentCreationBlockMessage("inactive_client"),
        "Cannot create payment for inactive client"
      );
      assert.equal(
        getPaymentCreationBlockReason({
          clientArchived: false,
          clientIsActive: true,
          invoiceArchived: false,
          baseStatus: "draft",
          outstanding: 500,
        }),
        "draft_invoice"
      );
    });
  });

  describe("integration SQL", () => {
    it("covers create and update mutation invariants", () => {
      assert.match(integrationSql, /rpc_create_payment_manual/);
      assert.match(integrationSql, /rpc_update_payment_manual/);
      assert.match(integrationSql, /pending B must fail over capacity/);
      assert.match(integrationSql, /completed amount increase beyond capacity/);
      assert.match(integrationSql, /net_amount effective amount semantics/);
      assert.match(integrationSql, /same payment stale old state/);
      assert.match(integrationSql, /TWO-SESSION PARALLEL CONCURRENCY TEST/);
    });

    it("documents that sequential tests do not prove parallel locking alone", () => {
      assert.match(
        integrationSql,
        /Sequential assertions below do NOT prove parallel session behavior/
      );
    });
  });

  it("form schema rejects zero/negative amounts", () => {
    const base = {
      clientId: "00000000-0000-4000-8000-000000000001",
      invoiceId: "00000000-0000-4000-8000-000000000002",
      date: "2026-01-15",
      method: "cash" as const,
      status: "completed" as const,
    };
    assert.throws(() => PaymentFormSchema.parse({ ...base, amount: 0 }));
    assert.throws(() => PaymentFormSchema.parse({ ...base, amount: -10 }));
  });
});
