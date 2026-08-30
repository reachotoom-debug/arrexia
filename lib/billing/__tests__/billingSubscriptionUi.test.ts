import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  formatBillingIntervalLabel,
  formatPaidSubscriptionPrice,
  getPlanDefinition,
} from "@/lib/billing/plans";
import { formatPaidSubscriptionPeriodEndMessage } from "@/lib/billing/paidSubscriptionPeriodEndLabel";

const PERIOD_END = "2026-09-29T22:18:02.598648+00:00";
const FORMATTED_DATE = "Sep 29, 2026";

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

  it("active monthly + cancel_at_period_end=false => Renews {date}", () => {
    assert.equal(
      formatPaidSubscriptionPeriodEndMessage(PERIOD_END, false),
      `Renews ${FORMATTED_DATE}`
    );
  });

  it("active monthly + cancel_at_period_end=true => Access until {date}", () => {
    assert.equal(
      formatPaidSubscriptionPeriodEndMessage(PERIOD_END, true),
      `Access until ${FORMATTED_DATE}`
    );
  });

  it("active annual + cancel_at_period_end=false => Renews {date}", () => {
    const annualPeriodEnd = "2027-08-29T00:00:00Z";
    assert.equal(
      formatPaidSubscriptionPeriodEndMessage(annualPeriodEnd, false),
      "Renews Aug 29, 2027"
    );
  });

  it("active annual + cancel_at_period_end=true => Access until {date}", () => {
    const annualPeriodEnd = "2027-08-29T00:00:00Z";
    assert.equal(
      formatPaidSubscriptionPeriodEndMessage(annualPeriodEnd, true),
      "Access until Aug 29, 2027"
    );
  });

  it("BillingPlansClient renders cancellation-aware paid period end copy", () => {
    const src = readFileSync(
      "app/[workspaceId]/settings/_components/BillingPlansClient.tsx",
      "utf8"
    );
    assert.match(src, /formatPaidSubscriptionPeriodEndMessage/);
    assert.match(src, /paidCancelAtPeriodEnd/);
    assert.match(src, /paidPeriodEndsAt/);
    assert.doesNotMatch(src, /Renews \{formatDateOnlyField\(paidPeriodEndsAt\)\}/);
  });
});
