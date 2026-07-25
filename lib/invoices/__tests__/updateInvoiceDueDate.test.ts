import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  resolvePaymentTermsDays,
  type PaymentTermsCode,
} from "../paymentTerms";

/** Mirrors updateInvoice preset-day normalization in actions.ts */
function resolveUpdateInvoiceEffectiveDays(
  termsCode: PaymentTermsCode,
  explicitDays: number | null | undefined,
  clientDefaultDays?: number | null
): number {
  const explicitDaysForTerms =
    termsCode === "custom" ? (explicitDays ?? null) : null;
  return resolvePaymentTermsDays(
    termsCode,
    explicitDaysForTerms,
    clientDefaultDays ?? null,
    null
  );
}

describe("updateInvoice due-date edit contract (INV-0007)", () => {
  it("A — Net 30 → Due on Receipt: effective days become 0 (due date comes from form)", () => {
    assert.equal(
      resolveUpdateInvoiceEffectiveDays("due_on_receipt", 30),
      0
    );
  });

  it("B — stale paymentTermsDays=30 does not survive for Due on Receipt", () => {
    assert.equal(
      resolveUpdateInvoiceEffectiveDays("due_on_receipt", 30),
      0
    );
    assert.notEqual(
      resolveUpdateInvoiceEffectiveDays("due_on_receipt", 30),
      30
    );
  });

  it("C — Net 30 edit still resolves to 30 days", () => {
    assert.equal(resolveUpdateInvoiceEffectiveDays("net_30", 30), 30);
    assert.equal(resolveUpdateInvoiceEffectiveDays("net_30", null), 30);
  });

  it("custom payment terms keep explicit days", () => {
    assert.equal(resolveUpdateInvoiceEffectiveDays("custom", 45), 45);
  });

  it("D — updateInvoice persists parsed.dueDate, not computeDueDate recompute", () => {
    const src = readFileSync("app/[workspaceId]/invoices/actions.ts", "utf8");
    const updateBlock = src.slice(
      src.indexOf("export async function updateInvoice"),
      src.indexOf("export async function deleteInvoice")
    );

    assert.match(updateBlock, /normalizeDateOnlyString\(parsed\.dueDate\)/);
    assert.doesNotMatch(
      updateBlock,
      /const dueDate = computeDueDate\(issueDate, effectiveDays\)/
    );
    assert.match(updateBlock, /due_date: dueDate/);
    assert.match(
      updateBlock,
      /paymentTermsCode === "custom"[\s\S]*explicitDaysForTerms/
    );
  });

  it("E — createInvoice still computes due_date server-side", () => {
    const src = readFileSync("app/[workspaceId]/invoices/actions.ts", "utf8");
    const createBlock = src.slice(
      src.indexOf("export async function createInvoice"),
      src.indexOf("export async function updateInvoice")
    );

    assert.match(
      createBlock,
      /const dueDate = computeDueDate\(parsed\.issueDate, effectiveDays\)/
    );
    assert.match(createBlock, /due_date: dueDate, \/\/ Computed server-side/);
  });

  it("InvoiceForm clears stale paymentTermsDays when preset changes", () => {
    const src = readFileSync(
      "app/[workspaceId]/invoices/_components/InvoiceForm.tsx",
      "utf8"
    );
    assert.match(
      src,
      /register\("paymentTerms"\)\.onChange\(e\)[\s\S]*setValue\("paymentTermsDays", undefined\)/
    );
  });
});
