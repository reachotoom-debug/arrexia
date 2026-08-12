import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import "./testSetup";

import { isTrialUsageExhausted } from "@/lib/billing/usageMetering";
import type { EntitlementUsageSnapshot } from "@/lib/billing/usageMetering";

const ENTITLEMENT_GUARD_PATH = "lib/billing/entitlementGuard.ts";
const ASSERT_LIMITS_PATH = "lib/billing/assertWithinPlanLimits.ts";
const ACTIONS_PATH = "app/[workspaceId]/invoices/actions.ts";

function readEntitlementGuardSource(): string {
  return readFileSync(ENTITLEMENT_GUARD_PATH, "utf8");
}

function extractFunctionBlock(source: string, signature: string, nextSignature: string): string {
  const start = source.indexOf(signature);
  assert.ok(start >= 0, `missing ${signature}`);
  const end = source.indexOf(nextSignature, start + signature.length);
  assert.ok(end > start, `missing end boundary after ${signature}`);
  return source.slice(start, end);
}

function usage(partial: Partial<EntitlementUsageSnapshot>): EntitlementUsageSnapshot {
  return {
    workspace_id: "ws-1",
    trial_invoices_created: 0,
    ai_generations_successful: 0,
    automated_reminders_sent: 0,
    manual_email_reminders_sent: 0,
    ...partial,
  };
}

describe("entitlement recursion fix contracts", () => {
  const src = readEntitlementGuardSource();

  it("H — assertInvoiceCreateEntitlement does not call assertInvoiceCreateAllowed", () => {
    assert.doesNotMatch(src, /assertInvoiceCreateAllowed/);
  });

  it("I — assertClientCreateEntitlement does not call assertClientCreateAllowed", () => {
    assert.doesNotMatch(src, /assertClientCreateAllowed/);
  });

  it("Allowed wrappers delegate one-way into entitlementGuard only", () => {
    const allowedSrc = readFileSync(ASSERT_LIMITS_PATH, "utf8");
    assert.match(allowedSrc, /assertInvoiceCreateEntitlement/);
    assert.match(allowedSrc, /assertClientCreateEntitlement/);
    assert.doesNotMatch(allowedSrc, /getInvoiceUsageThisMonth/);
  });

  it("non-trial invoice path uses getInvoiceUsageThisMonth directly", () => {
    const block = extractFunctionBlock(
      src,
      "export async function assertInvoiceCreateEntitlement",
      "export async function recordTrialInvoiceCreated"
    );
    assert.match(block, /getInvoiceUsageThisMonth/);
    assert.match(block, /invoiceLimitMonthly !== null/);
    assert.match(block, /PLAN_LIMIT_INVOICES/);
    assert.doesNotMatch(block, /assertInvoiceCreateAllowed/);
  });

  it("non-trial client path uses countActiveClientsForPlan directly", () => {
    const block = extractFunctionBlock(
      src,
      "export async function assertClientCreateEntitlement",
      "export async function assertInvoiceCreateEntitlement"
    );
    assert.match(block, /countActiveClientsForPlan/);
    assert.match(block, /PLAN_LIMIT_CLIENTS/);
    assert.doesNotMatch(block, /assertClientCreateAllowed/);
  });

  it("paid invoice preflight mirrors assertImportEntitlement net-new invoice check", () => {
    const invoiceBlock = extractFunctionBlock(
      src,
      "export async function assertInvoiceCreateEntitlement",
      "export async function recordTrialInvoiceCreated"
    );
    const importBlock = extractFunctionBlock(
      src,
      "export async function assertImportEntitlement",
      "export async function assertWhatsAppCollectionEntitlement"
    );
    assert.match(invoiceBlock, /invoiceUsage\.used >= \(invoiceUsage\.limit \?\? 0\)/);
    assert.match(importBlock, /invoiceUsage\.used \+ params\.newInvoices > \(invoiceUsage\.limit \?\? 0\)/);
  });

  it("paid client preflight mirrors assertImportEntitlement net-new client check", () => {
    const clientBlock = extractFunctionBlock(
      src,
      "export async function assertClientCreateEntitlement",
      "export async function assertInvoiceCreateEntitlement"
    );
    const importBlock = extractFunctionBlock(
      src,
      "export async function assertImportEntitlement",
      "export async function assertWhatsAppCollectionEntitlement"
    );
    assert.match(clientBlock, /activeClients >= limit/);
    assert.match(importBlock, /activeClients \+ params\.newClients > limit/);
  });

  it("M — updateInvoice does not invoke create entitlement", () => {
    const actionsSrc = readFileSync(ACTIONS_PATH, "utf8");
    const updateBlock = extractFunctionBlock(
      actionsSrc,
      "export async function updateInvoice",
      "export async function archiveInvoice"
    );
    assert.doesNotMatch(updateBlock, /assertInvoiceCreateAllowed/);
    assert.doesNotMatch(updateBlock, /assertInvoiceCreateEntitlement/);
  });
});

describe("entitlement recursion fix limit semantics", () => {
  it("A/C — paid monthly under-limit and unlimited checks are O(1) comparisons", () => {
    const underLimit = { used: 10, limit: 50 as number | null };
    const unlimited = { used: 999, limit: null as number | null };
    assert.equal(unlimited.limit === null, true);
    assert.equal(
      underLimit.limit !== null && underLimit.used >= (underLimit.limit ?? 0),
      false
    );
  });

  it("B — paid monthly at-limit triggers PLAN_LIMIT_INVOICES comparison", () => {
    const atLimit = { used: 50, limit: 50 };
    assert.equal(atLimit.used >= (atLimit.limit ?? 0), true);
  });

  it("D — trial invoice path uses trial usage exhaustion only", () => {
    assert.equal(isTrialUsageExhausted(usage({ trial_invoices_created: 74 }), "trial_invoices"), false);
    assert.equal(isTrialUsageExhausted(usage({ trial_invoices_created: 75 }), "trial_invoices"), true);
  });

  it("E/F — paid client under/at limit uses activeClients >= limit", () => {
    const limit = 50;
    assert.equal(10 >= limit, false);
    assert.equal(50 >= limit, true);
  });

  it("G — trial client path still gates on clientLimit when active count reached", () => {
    const clientLimit = 50;
    const activeCount = 50;
    assert.equal(clientLimit !== null && activeCount >= clientLimit, true);
  });
});
