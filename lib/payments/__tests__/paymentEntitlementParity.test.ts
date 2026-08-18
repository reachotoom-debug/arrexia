import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import "@/lib/test/nodeTestSetup";

import { EntitlementError, TRIAL_EXPIRED_MESSAGE } from "@/lib/billing/entitlementErrors";
import {
  assertImportEntitlement,
  assertWorkspaceMutationAllowed,
} from "@/lib/billing/entitlementGuard";
import { resolveWorkspaceEntitlement } from "@/lib/billing/resolveWorkspaceEntitlement";

const PAYMENTS_ACTIONS = "app/[workspaceId]/payments/actions.ts";
const PAYMENTS_IMPORT = "app/[workspaceId]/settings/import/actions/payments.ts";

function readFunctionBlock(src: string, startMarker: string, endMarker: string): string {
  const start = src.indexOf(startMarker);
  assert.ok(start >= 0, `missing ${startMarker}`);
  const end = src.indexOf(endMarker, start + startMarker.length);
  assert.ok(end > start, `missing end marker after ${startMarker}`);
  return src.slice(start, end);
}

function assertEntitlementBeforeMutation(block: string, label: string) {
  const entitlementIdx = block.indexOf("getPaymentMutationEntitlementBlock");
  assert.ok(entitlementIdx >= 0, `${label} must call getPaymentMutationEntitlementBlock`);
  const authIdx = Math.max(
    block.indexOf("requireUser("),
    block.indexOf("requireWorkspace(")
  );
  assert.ok(authIdx >= 0, `${label} must require auth/workspace`);
  assert.ok(
    entitlementIdx > authIdx,
    `${label} entitlement guard must run after auth`
  );
  const mutationIdx = Math.min(
    ...[
      block.indexOf('.from("payments")'),
      block.indexOf(".from('payments')"),
      block.indexOf('.update({ archived_at'),
    ].filter((idx) => idx >= 0)
  );
  if (mutationIdx >= 0) {
    assert.ok(
      entitlementIdx < mutationIdx,
      `${label} entitlement guard must run before payment mutations`
    );
  }
}

describe("payment mutation entitlement parity", () => {
  const actionsSrc = readFileSync(PAYMENTS_ACTIONS, "utf8");

  it("A — createPayment remains entitlement-guarded (reference path)", () => {
    const block = readFunctionBlock(
      actionsSrc,
      "export async function createPayment",
      "export async function updatePayment"
    );
    assertEntitlementBeforeMutation(block, "createPayment");
    assert.match(actionsSrc, /assertWorkspaceMutationAllowed\(workspaceId, "payment_mutation"\)/);
  });

  it("B — updatePayment is entitlement-guarded before load/update", () => {
    const block = readFunctionBlock(
      actionsSrc,
      "export async function updatePayment",
      "export async function deletePayment"
    );
    assertEntitlementBeforeMutation(block, "updatePayment");
    assert.match(block, /return \{ error: entitlementBlock\.error, code: entitlementBlock\.code \}/);
  });

  it("C — deletePayment is entitlement-guarded (archive semantics)", () => {
    const block = readFunctionBlock(
      actionsSrc,
      "export async function deletePayment",
      "export async function archivePayment"
    );
    assertEntitlementBeforeMutation(block, "deletePayment");
    assert.match(block, /archived_at: new Date\(\)\.toISOString\(\)/);
  });

  it("D — archivePayment is entitlement-guarded", () => {
    const block = readFunctionBlock(
      actionsSrc,
      "export async function archivePayment",
      "export async function unarchivePayment"
    );
    assertEntitlementBeforeMutation(block, "archivePayment");
  });

  it("E — unarchivePayment is entitlement-guarded", () => {
    const block = readFunctionBlock(
      actionsSrc,
      "export async function unarchivePayment",
      "export async function bulkArchivePayments"
    );
    assertEntitlementBeforeMutation(block, "unarchivePayment");
  });

  it("F — bulkArchivePayments is entitlement-guarded", () => {
    const block = readFunctionBlock(
      actionsSrc,
      "export async function bulkArchivePayments",
      "export async function bulkUnarchivePayments"
    );
    assertEntitlementBeforeMutation(block, "bulkArchivePayments");
    assert.match(block, /return \{ ok: false, message: entitlementBlock\.error \}/);
  });

  it("G — bulkUnarchivePayments is entitlement-guarded", () => {
    const start = actionsSrc.indexOf("export async function bulkUnarchivePayments");
    assert.ok(start >= 0);
    const block = actionsSrc.slice(start);
    assertEntitlementBeforeMutation(block, "bulkUnarchivePayments");
  });

  it("K — workspace authorization remains required on all mutation exports", () => {
    for (const fn of [
      "createPayment",
      "updatePayment",
      "deletePayment",
      "archivePayment",
      "unarchivePayment",
      "bulkArchivePayments",
      "bulkUnarchivePayments",
    ] as const) {
      const start = actionsSrc.indexOf(`export async function ${fn}`);
      assert.ok(start >= 0, `missing ${fn}`);
      const next = actionsSrc.indexOf("export async function", start + 1);
      const block = next >= 0 ? actionsSrc.slice(start, next) : actionsSrc.slice(start);
      assert.match(block, /requireWorkspace\(workspaceId\)/);
    }
  });

  it("L — payment overpay and unarchive overpay guards remain intact", () => {
    assert.match(actionsSrc, /wouldRestorePaymentCauseOverpay/);
    assert.match(actionsSrc, /validatePaymentUnarchiveBatchOverpay/);
    assert.match(actionsSrc, /Payment amount \(\$\{paymentAmount\.toFixed\(2\)\}\) exceeds the invoice outstanding balance/);
  });
});

describe("payment import entitlement parity", () => {
  const importSrc = readFileSync(PAYMENTS_IMPORT, "utf8");

  it("H — executePaymentsImport blocks before service-role RPC", () => {
    const start = importSrc.indexOf("export async function executePaymentsImport");
    assert.ok(start >= 0);
    const executeBlock = importSrc.slice(start);
    const entitlementIdx = executeBlock.indexOf("assertImportEntitlement");
    const rpcIdx = executeBlock.indexOf("supabaseAdmin().rpc");
    assert.ok(entitlementIdx >= 0, "execute must call assertImportEntitlement");
    assert.ok(rpcIdx > entitlementIdx, "entitlement must run before RPC");
    assert.match(
      executeBlock,
      /assertImportEntitlement\(workspaceId, \{ newClients: 0, newInvoices: 0 \}\)/
    );
  });

  it("I — execute uses csv_import write-access contract (no payment quantity limits)", () => {
    const start = importSrc.indexOf("export async function executePaymentsImport");
    const executeBlock = importSrc.slice(start);
    assert.match(
      executeBlock,
      /newClients: 0,\s*newInvoices: 0/
    );
  });

  it("J — preview remains workspace-auth only (no execute entitlement)", () => {
    const previewBlock = readFunctionBlock(
      importSrc,
      "export async function previewPaymentsImport",
      "export async function executePaymentsImport"
    );
    assert.match(previewBlock, /requireWorkspace\(workspaceId\)/);
    assert.doesNotMatch(previewBlock, /assertImportEntitlement/);
    assert.doesNotMatch(previewBlock, /assertWorkspaceMutationAllowed/);
  });
});

describe("canonical entitlement contract (payment paths)", () => {
  const NOW = new Date("2026-08-01T12:00:00.000Z");
  const PAST = "2026-07-01T00:00:00.000Z";

  it("expired trial resolves read-only (blocks mutations)", () => {
    const entitlement = resolveWorkspaceEntitlement({
      storedPlan: "free",
      subscription: {
        status: "trial",
        plan: "free",
        trialStartsAt: "2026-07-01T00:00:00.000Z",
        trialEndsAt: PAST,
        trialConsumedAt: "2026-07-01T00:00:00.000Z",
        currentPeriodStartsAt: null,
        currentPeriodEndsAt: null,
      },
      now: NOW,
    });
    assert.equal(entitlement.state, "trial_expired");
    assert.equal(entitlement.canMutate, false);
  });

  it("active trial remains mutable past entitlement layer", () => {
    const entitlement = resolveWorkspaceEntitlement({
      storedPlan: "free",
      subscription: {
        status: "trial",
        plan: "free",
        trialStartsAt: NOW.toISOString(),
        trialEndsAt: "2026-08-15T12:00:00.000Z",
        trialConsumedAt: NOW.toISOString(),
        currentPeriodStartsAt: null,
        currentPeriodEndsAt: null,
      },
      now: NOW,
    });
    assert.equal(entitlement.state, "trial");
    assert.equal(entitlement.canMutate, true);
  });

  it("assertWorkspaceMutationAllowed exposes payment_mutation capability", () => {
    assert.equal(typeof assertWorkspaceMutationAllowed, "function");
    assert.equal(typeof assertImportEntitlement, "function");
  });

  it("expired trial entitlement error message is stable", () => {
    const error = new EntitlementError("TRIAL_EXPIRED", TRIAL_EXPIRED_MESSAGE);
    assert.equal(error.code, "TRIAL_EXPIRED");
    assert.match(error.message, /trial/i);
  });
});
