import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { revalidateFinancialSurfacesAfterPayment } from "../revalidateFinancialSurfaces";

describe("revalidateFinancialSurfacesAfterPayment", () => {
  it("revalidates all core financial workspace surfaces", () => {
    const paths: string[] = [];
    revalidateFinancialSurfacesAfterPayment("ws-1", (path) => paths.push(path));

    assert.deepEqual(paths, [
      "/ws-1/dashboard",
      "/ws-1/actions",
      "/ws-1/collections",
      "/ws-1/clients",
      "/ws-1/invoices",
      "/ws-1/payments",
    ]);
  });

  it("revalidates specific invoice, client, and payment detail paths", () => {
    const paths: string[] = [];
    revalidateFinancialSurfacesAfterPayment("ws-1", (path) => paths.push(path), {
      invoiceId: "inv-1",
      clientId: "client-1",
      paymentId: "pay-1",
    });

    assert.ok(paths.includes("/ws-1/invoices/inv-1"));
    assert.ok(paths.includes("/ws-1/clients/client-1"));
    assert.ok(paths.includes("/ws-1/payments/pay-1"));
  });
});

describe("payment actions revalidation contract", () => {
  it("uses shared financial revalidation helper", () => {
    const src = readFileSync("app/[workspaceId]/payments/actions.ts", "utf8");
    assert.match(src, /revalidateFinancialSurfacesAfterPayment/);
    assert.match(src, /revalidateFinancialSurfacesAfterPayment\(workspaceId, revalidatePath/);
  });
});
