import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  PADDLE_SANDBOX_PRICE_CATALOG,
  isPaddleCheckoutPlan,
  resolvePaddlePriceId,
} from "@/lib/billing/paddle/priceCatalog";

describe("Paddle sandbox price catalog", () => {
  it("maps starter monthly and annual to verified sandbox price IDs", () => {
    const monthly = resolvePaddlePriceId("starter", "monthly");
    assert.equal(monthly.ok, true);
    if (monthly.ok) {
      assert.equal(monthly.priceId, PADDLE_SANDBOX_PRICE_CATALOG.starter.monthly);
      assert.equal(monthly.priceId, "pri_01m160et1jrsbnb0hftets4ej2");
      assert.equal(monthly.environment, "sandbox");
    }

    const annual = resolvePaddlePriceId("starter", "annual");
    assert.equal(annual.ok, true);
    if (annual.ok) {
      assert.equal(annual.priceId, PADDLE_SANDBOX_PRICE_CATALOG.starter.annual);
      assert.equal(annual.priceId, "pri_01m160etc13kbxmwthd37pt3zj");
    }
  });

  it("maps pro monthly and annual to verified sandbox price IDs", () => {
    const monthly = resolvePaddlePriceId("pro", "monthly");
    assert.equal(monthly.ok, true);
    if (monthly.ok) {
      assert.equal(monthly.priceId, "pri_01m160evbf5cecq92r62bwkt95");
    }

    const annual = resolvePaddlePriceId("pro", "annual");
    assert.equal(annual.ok, true);
    if (annual.ok) {
      assert.equal(annual.priceId, "pri_01m160evjx58qzrjge92aq8mrc");
    }
  });

  it("maps business monthly and annual to verified sandbox price IDs", () => {
    const monthly = resolvePaddlePriceId("business", "monthly");
    assert.equal(monthly.ok, true);
    if (monthly.ok) {
      assert.equal(monthly.priceId, "pri_01m160ew3067phsj76b75twrkp");
    }

    const annual = resolvePaddlePriceId("business", "annual");
    assert.equal(annual.ok, true);
    if (annual.ok) {
      assert.equal(annual.priceId, "pri_01m160ewapjmxdq6ttp4565abw");
    }
  });

  it("does not resolve enterprise to a checkout price", () => {
    const monthly = resolvePaddlePriceId("enterprise", "monthly");
    assert.equal(monthly.ok, false);
    if (!monthly.ok) {
      assert.equal(monthly.code, "CONTACT_SALES_ONLY");
      assert.equal(monthly.plan, "enterprise");
    }

    const annual = resolvePaddlePriceId("enterprise", "annual");
    assert.equal(annual.ok, false);
    if (!annual.ok) {
      assert.equal(annual.code, "CONTACT_SALES_ONLY");
    }
  });

  it("does not resolve free to a checkout price", () => {
    const result = resolvePaddlePriceId("free", "monthly");
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, "FREE_PLAN");
      assert.equal(result.plan, "free");
    }
  });

  it("returns catalog-not-configured for production until a live catalog exists", () => {
    const result = resolvePaddlePriceId("starter", "monthly", "production");
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, "CATALOG_NOT_CONFIGURED");
    }
  });

  it("identifies checkout-eligible plans", () => {
    assert.equal(isPaddleCheckoutPlan("starter"), true);
    assert.equal(isPaddleCheckoutPlan("pro"), true);
    assert.equal(isPaddleCheckoutPlan("business"), true);
    assert.equal(isPaddleCheckoutPlan("enterprise"), false);
    assert.equal(isPaddleCheckoutPlan("free"), false);
  });

  it("contains exactly six sandbox price IDs across three plans", () => {
    const ids = Object.values(PADDLE_SANDBOX_PRICE_CATALOG).flatMap((planPrices) =>
      Object.values(planPrices)
    );
    assert.equal(ids.length, 6);
    assert.equal(new Set(ids).size, 6);
    for (const id of ids) {
      assert.match(id, /^pri_/);
    }
  });
});
