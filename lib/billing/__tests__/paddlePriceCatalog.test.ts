import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  PADDLE_PRODUCTION_PRICE_CATALOG,
  PADDLE_SANDBOX_PRICE_CATALOG,
  getPaddlePriceCatalog,
  isPaddleCheckoutPlan,
  resolvePaddlePriceId,
  resolvePlanFromPaddlePriceId,
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

describe("Paddle production price catalog", () => {
  it("maps starter monthly and annual to verified live price IDs", () => {
    const monthly = resolvePaddlePriceId("starter", "monthly", "production");
    assert.equal(monthly.ok, true);
    if (monthly.ok) {
      assert.equal(monthly.priceId, PADDLE_PRODUCTION_PRICE_CATALOG.starter.monthly);
      assert.equal(monthly.priceId, "pri_01m1at62xv6w2m6qs1phhv9dcr");
      assert.equal(monthly.environment, "production");
    }

    const annual = resolvePaddlePriceId("starter", "annual", "production");
    assert.equal(annual.ok, true);
    if (annual.ok) {
      assert.equal(annual.priceId, PADDLE_PRODUCTION_PRICE_CATALOG.starter.annual);
      assert.equal(annual.priceId, "pri_01m1at9cd7hb9ppq4hg2hj39dj");
    }
  });

  it("maps pro monthly and annual to verified live price IDs", () => {
    const monthly = resolvePaddlePriceId("pro", "monthly", "production");
    assert.equal(monthly.ok, true);
    if (monthly.ok) {
      assert.equal(monthly.priceId, "pri_01m1ate0g915aeyvcf0y7kwr1z");
    }

    const annual = resolvePaddlePriceId("pro", "annual", "production");
    assert.equal(annual.ok, true);
    if (annual.ok) {
      assert.equal(annual.priceId, "pri_01m1atg3nvsrvkqhcfrrww1sdh0");
    }
  });

  it("maps business monthly and annual to verified live price IDs", () => {
    const monthly = resolvePaddlePriceId("business", "monthly", "production");
    assert.equal(monthly.ok, true);
    if (monthly.ok) {
      assert.equal(monthly.priceId, "pri_01m1atnep0q6m6a8c77ht58z6h");
    }

    const annual = resolvePaddlePriceId("business", "annual", "production");
    assert.equal(annual.ok, true);
    if (annual.ok) {
      assert.equal(annual.priceId, "pri_01m1atpxgh4t3msdn24hh45htd");
    }
  });

  it("does not resolve enterprise or free in production", () => {
    const enterprise = resolvePaddlePriceId("enterprise", "monthly", "production");
    assert.equal(enterprise.ok, false);
    if (!enterprise.ok) {
      assert.equal(enterprise.code, "CONTACT_SALES_ONLY");
    }

    const free = resolvePaddlePriceId("free", "monthly", "production");
    assert.equal(free.ok, false);
    if (!free.ok) {
      assert.equal(free.code, "FREE_PLAN");
    }
  });

  it("never falls back to sandbox price IDs when environment is production", () => {
    const sandboxIds = new Set(
      Object.values(PADDLE_SANDBOX_PRICE_CATALOG).flatMap((planPrices) =>
        Object.values(planPrices)
      )
    );

    for (const plan of ["starter", "pro", "business"] as const) {
      for (const interval of ["monthly", "annual"] as const) {
        const resolution = resolvePaddlePriceId(plan, interval, "production");
        assert.equal(resolution.ok, true);
        if (resolution.ok) {
          assert.equal(resolution.environment, "production");
          assert.equal(sandboxIds.has(resolution.priceId), false);
        }
      }
    }
  });

  it("reverse lookup resolves live price IDs within production catalog only", () => {
    const starterMonthly = resolvePlanFromPaddlePriceId(
      "pri_01m1at62xv6w2m6qs1phhv9dcr",
      "production"
    );
    assert.equal(starterMonthly.ok, true);
    if (starterMonthly.ok) {
      assert.equal(starterMonthly.plan, "starter");
      assert.equal(starterMonthly.interval, "monthly");
    }

    const sandboxStarterMonthly = resolvePlanFromPaddlePriceId(
      "pri_01m160et1jrsbnb0hftets4ej2",
      "production"
    );
    assert.equal(sandboxStarterMonthly.ok, false);
    if (!sandboxStarterMonthly.ok) {
      assert.equal(sandboxStarterMonthly.code, "UNKNOWN_PRICE_ID");
    }
  });

  it("contains exactly six production price IDs across three plans", () => {
    const ids = Object.values(PADDLE_PRODUCTION_PRICE_CATALOG).flatMap((planPrices) =>
      Object.values(planPrices)
    );
    assert.equal(ids.length, 6);
    assert.equal(new Set(ids).size, 6);
    for (const id of ids) {
      assert.match(id, /^pri_/);
    }
  });

  it("keeps sandbox and production catalogs fully isolated", () => {
    const sandboxCatalog = getPaddlePriceCatalog("sandbox");
    const productionCatalog = getPaddlePriceCatalog("production");

    const sandboxIds = new Set(
      Object.values(sandboxCatalog).flatMap((planPrices) => Object.values(planPrices))
    );
    const productionIds = new Set(
      Object.values(productionCatalog).flatMap((planPrices) => Object.values(planPrices))
    );

    for (const id of productionIds) {
      assert.equal(sandboxIds.has(id), false);
    }
  });
});
