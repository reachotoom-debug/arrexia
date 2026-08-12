import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  formatCountryDialPrefix,
  normalizeClientContactNumberForStorage,
  splitContactNumberForDisplay,
} from "@/lib/clients/clientPhoneInput";

describe("clientPhoneInput UX helpers", () => {
  it("shows Jordan dial prefix", () => {
    assert.equal(formatCountryDialPrefix("Jordan"), "+962");
  });

  it("splits international Jordan number for display", () => {
    assert.deepEqual(splitContactNumberForDisplay("+962791234567", "Jordan"), {
      inputValue: "791234567",
      showCountryPrefix: true,
    });
  });

  it("preserves foreign international input without country prefix", () => {
    assert.deepEqual(splitContactNumberForDisplay("+15551234567", "Jordan"), {
      inputValue: "+15551234567",
      showCountryPrefix: false,
    });
  });

  it("splits Germany local digits that already include country code", () => {
    assert.deepEqual(splitContactNumberForDisplay("49301234567", "Germany"), {
      inputValue: "301234567",
      showCountryPrefix: true,
    });
  });

  it("normalizes local Jordan WhatsApp for storage", () => {
    assert.equal(
      normalizeClientContactNumberForStorage("791234567", "Jordan"),
      "+962791234567"
    );
  });

  it("normalizes explicit international for storage", () => {
    assert.equal(
      normalizeClientContactNumberForStorage("+962791234567", "Jordan"),
      "+962791234567"
    );
  });

  it("normalizes Germany local digits without double country code", () => {
    assert.equal(
      normalizeClientContactNumberForStorage("49301234567", "Germany"),
      "+49301234567"
    );
  });

  it("returns null for blank input", () => {
    assert.equal(normalizeClientContactNumberForStorage("  ", "Jordan"), null);
  });
});
