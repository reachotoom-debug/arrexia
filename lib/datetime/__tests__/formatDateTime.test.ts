import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  APPLICATION_FALLBACK_TIMEZONE,
  EMPTY_TIMESTAMP_PLACEHOLDER,
  formatAdminDisplayDateTime,
  formatDateOnlyField,
  formatInstantInTimeZone,
  isValidTimeZone,
  parseInstant,
  resolveSafeTimeZone,
} from "../formatDateTime";

const UTC_INSTANT = "2026-07-19T23:43:00.000Z";

describe("formatInstantInTimeZone", () => {
  it("Test 1 — converts a UTC instant to an explicit timezone", () => {
    const formatted = formatInstantInTimeZone(UTC_INSTANT, "Asia/Amman");
    assert.match(formatted, /Jul 20, 2026/);
    assert.match(formatted, /2:43/);
  });

  it("Test 2 — handles date rollover across midnight", () => {
    const formatted = formatInstantInTimeZone(UTC_INSTANT, "Asia/Amman");
    assert.doesNotMatch(formatted, /Jul 19, 2026/);
    assert.match(formatted, /Jul 20, 2026/);
  });

  it("Test 3 — preserves the existing placeholder for null timestamps", () => {
    assert.equal(formatInstantInTimeZone(null, "Asia/Amman"), EMPTY_TIMESTAMP_PLACEHOLDER);
    assert.equal(formatAdminDisplayDateTime(null, "Asia/Amman"), EMPTY_TIMESTAMP_PLACEHOLDER);
  });

  it("Test 4 — falls back safely when timezone is invalid or missing", () => {
    assert.equal(resolveSafeTimeZone("Not/A_Timezone"), APPLICATION_FALLBACK_TIMEZONE);
    assert.equal(isValidTimeZone("Not/A_Timezone"), false);

    const formatted = formatInstantInTimeZone(UTC_INSTANT, "Not/A_Timezone");
    assert.match(formatted, /Jul 19, 2026/);
    assert.match(formatted, /11:43/);
  });

  it("Test 5 — explicit timezone formatting does not depend on server machine timezone", () => {
    const utcFormatted = formatInstantInTimeZone(UTC_INSTANT, "UTC");
    const ammanFormatted = formatInstantInTimeZone(UTC_INSTANT, "Asia/Amman");

    assert.match(utcFormatted, /Jul 19, 2026/);
    assert.match(utcFormatted, /11:43/);
    assert.notEqual(utcFormatted, ammanFormatted);
  });
});

describe("formatDateOnlyField", () => {
  it("Test 6 — does not shift calendar date-only values", () => {
    assert.equal(formatDateOnlyField("2026-07-20"), "Jul 20, 2026");
    assert.equal(formatDateOnlyField("2026-07-19"), "Jul 19, 2026");
  });

  it("does not treat invalid date-only input as a shifted instant", () => {
    assert.equal(formatDateOnlyField("invalid-date"), EMPTY_TIMESTAMP_PLACEHOLDER);
  });
});

describe("parseInstant", () => {
  it("parses Supabase-style ISO timestamps", () => {
    const parsed = parseInstant(UTC_INSTANT);
    assert.ok(parsed);
    assert.equal(parsed?.toISOString(), UTC_INSTANT);
  });
});
