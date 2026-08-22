import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  computeManualRenewalPeriodUpdate,
  computePaidPeriodEnd,
} from "@/lib/billing/billingPeriod";

const PERIOD_START = "2026-08-22T00:00:00.000Z";
const PERIOD_END_ANNUAL = "2027-08-22T00:00:00.000Z";
const PERIOD_END_MONTHLY = "2026-09-22T00:00:00.000Z";

describe("manual renewal action contract", () => {
  it("markWorkspaceRenewedAction uses computeManualRenewalPeriodUpdate", () => {
    const src = readFileSync("app/admin/actions.ts", "utf8");
    const renewalBlock = src.slice(src.indexOf("export async function markWorkspaceRenewedAction"));
    assert.match(src, /computeManualRenewalPeriodUpdate/);
    assert.match(src, /normalizeBillingInterval\(existing\?\.billingInterval\)/);
    assert.doesNotMatch(renewalBlock, /billing_interval:/);
    assert.doesNotMatch(src, /setDate\(nextPeriod\.getDate\(\) \+ 30\)/);
  });
});

describe("computeManualRenewalPeriodUpdate", () => {
  it("1 — active monthly early renewal preserves start and stacks end from existing end", () => {
    const now = new Date("2026-09-01T00:00:00.000Z");
    const update = computeManualRenewalPeriodUpdate(now, {
      currentPeriodStartsAt: "2026-08-22T00:00:00.000Z",
      currentPeriodEndsAt: PERIOD_END_MONTHLY,
      billingInterval: "monthly",
    });

    assert.equal(update.currentPeriodStartsAt, "2026-08-22T00:00:00.000Z");
    assert.equal(
      update.currentPeriodEndsAt,
      computePaidPeriodEnd(new Date(PERIOD_END_MONTHLY), "monthly").toISOString()
    );
    assert.equal(update.currentPeriodEndsAt, "2026-10-22T00:00:00.000Z");
  });

  it("2 — active annual early renewal preserves start and stacks end from existing end", () => {
    const now = new Date("2027-08-01T00:00:00.000Z");
    const update = computeManualRenewalPeriodUpdate(now, {
      currentPeriodStartsAt: PERIOD_START,
      currentPeriodEndsAt: PERIOD_END_ANNUAL,
      billingInterval: "annual",
    });

    assert.equal(update.currentPeriodStartsAt, PERIOD_START);
    assert.equal(
      update.currentPeriodEndsAt,
      computePaidPeriodEnd(new Date(PERIOD_END_ANNUAL), "annual").toISOString()
    );
    assert.equal(update.currentPeriodEndsAt, "2028-08-22T00:00:00.000Z");
  });

  it("3 — expired monthly renewal starts at now and extends one calendar month", () => {
    const now = new Date("2026-10-01T00:00:00.000Z");
    const update = computeManualRenewalPeriodUpdate(now, {
      currentPeriodStartsAt: "2026-08-22T00:00:00.000Z",
      currentPeriodEndsAt: PERIOD_END_MONTHLY,
      billingInterval: "monthly",
    });

    assert.equal(update.currentPeriodStartsAt, now.toISOString());
    assert.equal(
      update.currentPeriodEndsAt,
      computePaidPeriodEnd(now, "monthly").toISOString()
    );
    assert.equal(update.currentPeriodEndsAt, "2026-11-01T00:00:00.000Z");
  });

  it("4 — expired annual renewal starts at now and extends one calendar year", () => {
    const now = new Date("2027-09-01T00:00:00.000Z");
    const update = computeManualRenewalPeriodUpdate(now, {
      currentPeriodStartsAt: PERIOD_START,
      currentPeriodEndsAt: PERIOD_END_ANNUAL,
      billingInterval: "annual",
    });

    assert.equal(update.currentPeriodStartsAt, now.toISOString());
    assert.equal(
      update.currentPeriodEndsAt,
      computePaidPeriodEnd(now, "annual").toISOString()
    );
    assert.equal(update.currentPeriodEndsAt, "2028-09-01T00:00:00.000Z");
  });

  it("5 — missing period uses now and interval-aware end", () => {
    const now = new Date("2026-07-15T12:00:00.000Z");
    const monthly = computeManualRenewalPeriodUpdate(now, {
      currentPeriodStartsAt: null,
      currentPeriodEndsAt: null,
      billingInterval: "monthly",
    });
    assert.equal(monthly.currentPeriodStartsAt, now.toISOString());
    assert.equal(monthly.currentPeriodEndsAt, "2026-08-15T12:00:00.000Z");

    const annual = computeManualRenewalPeriodUpdate(now, {
      currentPeriodStartsAt: null,
      currentPeriodEndsAt: "not-a-date",
      billingInterval: "annual",
    });
    assert.equal(annual.currentPeriodStartsAt, now.toISOString());
    assert.equal(annual.currentPeriodEndsAt, "2027-07-15T12:00:00.000Z");
  });

  it("6 — billing_interval is not part of renewal period update (preserved separately)", () => {
    const update = computeManualRenewalPeriodUpdate(new Date("2027-08-01T00:00:00.000Z"), {
      currentPeriodStartsAt: PERIOD_START,
      currentPeriodEndsAt: PERIOD_END_ANNUAL,
      billingInterval: "annual",
    });
    assert.equal("billingInterval" in update, false);
    assert.equal("billing_interval" in update, false);
  });
});
