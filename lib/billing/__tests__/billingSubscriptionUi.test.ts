import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  formatBillingIntervalLabel,
  formatPaidSubscriptionPrice,
  getPlanDefinition,
} from "@/lib/billing/plans";

describe("billing subscription UI presentation", () => {
  it("monthly paid display uses catalog monthly price", () => {
    assert.equal(formatPaidSubscriptionPrice("pro", "monthly"), "$89/mo");
    assert.equal(formatBillingIntervalLabel("monthly"), "Monthly");
  });

  it("annual paid display uses catalog annual price", () => {
    const annualPrice = getPlanDefinition("pro").annualPrice;
    assert.equal(annualPrice, 890);
    assert.equal(formatPaidSubscriptionPrice("pro", "annual"), "$890/year");
    assert.equal(formatBillingIntervalLabel("annual"), "Annual");
  });

  it("BillingPlansClient renders interval, price, and renewal for paid plans", () => {
    const src = readFileSync(
      "app/[workspaceId]/settings/_components/BillingPlansClient.tsx",
      "utf8"
    );
    assert.match(src, /formatPaidSubscriptionPrice/);
    assert.match(src, /formatBillingIntervalLabel/);
    assert.match(src, /Renews/);
    assert.match(src, /paidPeriodEndsAt/);
  });
});
