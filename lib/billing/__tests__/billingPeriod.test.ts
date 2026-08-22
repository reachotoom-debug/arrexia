import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  addCalendarMonthsUtc,
  addCalendarYearsUtc,
  computePaidPeriodEnd,
} from "@/lib/billing/billingPeriod";

describe("billingPeriod", () => {
  it("adds one calendar month for a normal date", () => {
    const start = new Date("2026-03-15T12:00:00.000Z");
    const end = addCalendarMonthsUtc(start, 1);
    assert.equal(end.toISOString(), "2026-04-15T12:00:00.000Z");
  });

  it("Jan 31 monthly clamps to Feb 28 in a non-leap year", () => {
    const start = new Date("2025-01-31T12:00:00.000Z");
    const end = addCalendarMonthsUtc(start, 1);
    assert.equal(end.toISOString(), "2025-02-28T12:00:00.000Z");
  });

  it("Jan 31 monthly clamps to Feb 29 in a leap year", () => {
    const start = new Date("2024-01-31T12:00:00.000Z");
    const end = addCalendarMonthsUtc(start, 1);
    assert.equal(end.toISOString(), "2024-02-29T12:00:00.000Z");
  });

  it("Feb 29 annual clamps to Feb 28 in the next non-leap year", () => {
    const start = new Date("2024-02-29T12:00:00.000Z");
    const end = addCalendarYearsUtc(start, 1);
    assert.equal(end.toISOString(), "2025-02-28T12:00:00.000Z");
  });

  it("adds one calendar year for a normal date", () => {
    const start = new Date("2026-08-20T09:30:00.000Z");
    const end = addCalendarYearsUtc(start, 1);
    assert.equal(end.toISOString(), "2027-08-20T09:30:00.000Z");
  });

  it("computePaidPeriodEnd uses monthly and annual contracts", () => {
    const start = new Date("2026-07-26T12:00:00.000Z");
    assert.equal(
      computePaidPeriodEnd(start, "monthly").toISOString(),
      "2026-08-26T12:00:00.000Z"
    );
    assert.equal(
      computePaidPeriodEnd(start, "annual").toISOString(),
      "2027-07-26T12:00:00.000Z"
    );
  });
});
