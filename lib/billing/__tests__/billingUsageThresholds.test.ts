import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  getUsageProgressPercent,
  getUsageThresholdLevel,
  getUsageThresholdMessage,
} from "@/lib/billing/billingUsageThresholds";

describe("billingUsageThresholds", () => {
  it("80% threshold is approaching", () => {
    assert.equal(getUsageThresholdLevel(40, 50), "approaching");
    assert.equal(getUsageThresholdMessage("approaching"), "Approaching limit");
  });

  it("95% threshold is almost", () => {
    assert.equal(getUsageThresholdLevel(48, 50), "almost");
    assert.equal(getUsageThresholdMessage("almost"), "Almost at limit");
  });

  it("100% threshold is reached", () => {
    assert.equal(getUsageThresholdLevel(50, 50), "reached");
    assert.equal(getUsageThresholdMessage("reached"), "Limit reached");
  });

  it("progress percent caps at 100", () => {
    assert.equal(getUsageProgressPercent(60, 50), 100);
  });
});
