import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";

const REMOVED_PATHS = [
  "app/[workspaceId]/payments/_lib/getPayments.ts",
  "app/[workspaceId]/payments/_lib/getEligibleInvoices.ts",
  "app/[workspaceId]/payments/import-actions.ts",
  "app/[workspaceId]/payments/_components/PaymentsPagination.tsx",
  "app/[workspaceId]/payments/_components/PaymentsSortableHeader.tsx",
  "components/payments/payment-modal.tsx",
  "components/payments/payment-form.tsx",
  "components/payments/payments-toolbar.tsx",
  "components/payments/delete-payment-button.tsx",
  "lib/schemas/payment.ts",
];

describe("R2N payment legacy cleanup", () => {
  it("removed orphaned files no longer exist", () => {
    for (const path of REMOVED_PATHS) {
      assert.equal(existsSync(path), false, `expected removed: ${path}`);
    }
  });

  it("only one live PaymentsTable implementation remains", () => {
    assert.equal(existsSync("components/payments/PaymentsTable.tsx"), true);
    assert.equal(
      existsSync("app/[workspaceId]/payments/_components/PaymentsTable.tsx"),
      false
    );
    assert.equal(existsSync("components/payments/payments-table.tsx"), false);
  });

  it("payments list page imports canonical live stack", () => {
    const source = readFileSync("app/[workspaceId]/payments/page.tsx", "utf8");
    assert.match(source, /components\/payments\/PaymentsTable/);
    assert.match(source, /resolvePaymentBusinessDate/);
    assert.match(source, /loadPayments/);
    assert.doesNotMatch(source, /getPayments/);
  });

  it("live payment form uses lib/payments/schema not legacy lib/schemas/payment", () => {
    const form = readFileSync(
      "app/[workspaceId]/payments/_components/PaymentForm.tsx",
      "utf8"
    );
    assert.match(form, /@\/lib\/payments\/schema/);
    assert.doesNotMatch(form, /lib\/schemas\/payment/);
  });

  it("payment import remains on settings import path", () => {
    assert.equal(
      existsSync("app/[workspaceId]/settings/import/actions/payments.ts"),
      true
    );
    const source = readFileSync(
      "app/[workspaceId]/settings/import/actions/payments.ts",
      "utf8"
    );
    assert.match(source, /rpc_import_payments/);
  });

  it("no repository imports reference deleted getPayments helper", () => {
    const hits = [
      "getPayments.ts",
      "import-actions.ts",
      "lib/schemas/payment",
      "payment-modal",
      "payments-toolbar",
      "delete-payment-button",
    ];
    for (const needle of hits) {
      assert.doesNotMatch(
        readFileSync("app/[workspaceId]/payments/page.tsx", "utf8"),
        new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      );
    }
  });
});

describe("R2N canonical route wiring", () => {
  it("record payment route uses PaymentForm and createPayment", () => {
    const source = readFileSync("app/[workspaceId]/payments/new/page.tsx", "utf8");
    assert.match(source, /PaymentForm/);
    assert.match(source, /createPayment/);
  });

  it("payment detail and edit routes remain wired", () => {
    const detail = readFileSync(
      "app/[workspaceId]/payments/[paymentId]/page.tsx",
      "utf8"
    );
    const edit = readFileSync(
      "app/[workspaceId]/payments/[paymentId]/edit/page.tsx",
      "utf8"
    );
    assert.match(detail, /formatPaymentBusinessDate/);
    assert.match(edit, /resolvePaymentBusinessDate/);
    assert.match(edit, /updatePayment/);
  });

  it("bulk archive uses PaymentsBulkActions and PaymentArchiveConfirmDialog", () => {
    const table = readFileSync("components/payments/PaymentsTable.tsx", "utf8");
    assert.match(table, /PaymentsBulkActions/);
    const bulk = readFileSync(
      "app/[workspaceId]/payments/_components/PaymentsBulkActions.tsx",
      "utf8"
    );
    assert.match(bulk, /PaymentArchiveConfirmDialog/);
    assert.match(bulk, /bulkArchivePayments/);
  });
});
