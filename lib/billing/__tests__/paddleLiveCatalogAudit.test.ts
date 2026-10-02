import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PADDLE_PRODUCTION_PRICE_CATALOG } from "../paddle/priceCatalog";
import { getPlanDefinition } from "../plans";
import { validateLivePaddleCatalog } from "../paddle/validateLiveCatalog";

function fixture() {
  return Object.entries(PADDLE_PRODUCTION_PRICE_CATALOG).flatMap(([plan, prices]) =>
    Object.entries(prices).map(([cadence, id]) => ({ id, status: "active", product_id: `pro_${plan}`,
      product: { id: `pro_${plan}`, name: `Arrexia ${plan[0].toUpperCase()}${plan.slice(1)}`, status: "active" },
      unit_price: { amount: String((cadence === "annual" ? getPlanDefinition(plan as "starter").annualPrice! : getPlanDefinition(plan as "starter").monthlyPrice!) * 100), currency_code: "USD" },
      billing_cycle: { interval: cadence === "annual" ? "year" : "month", frequency: 1 }, trial_period: null,
    })));
}
describe("Live Paddle catalog audit", () => {
  it("checks all six prices, active products, USD amounts, cadence and absence of a second Paddle trial", () => {
    const result = validateLivePaddleCatalog(fixture());
    assert.equal(result.length, 6); assert.ok(result.every(row => row.issues.length === 0));
  });
  it("reports a missing price rather than claiming verification", () => {
    assert.ok(validateLivePaddleCatalog(fixture().slice(1))[0].issues.includes("missing_price"));
  });
  it("reports wrong amount, currency, product, cadence, status and Paddle trial", () => {
    const rows = fixture();
    Object.assign(rows[0], { status: "archived", product: {id: "wrong", name: "Wrong", status: "archived"},
      unit_price: {amount: "1", currency_code: "EUR"}, billing_cycle: { interval: "year", frequency: 2 }, trial_period: {interval: "day", frequency: 14} });
    const result = validateLivePaddleCatalog(rows)[0];
    for (const issue of ["inactive_price", "product_mismatch", "inactive_product", "amount_mismatch", "currency_mismatch", "billing_cycle_mismatch", "unexpected_paddle_trial"]) {
      assert.ok(result.issues.includes(issue), issue);
    }
  });
});
