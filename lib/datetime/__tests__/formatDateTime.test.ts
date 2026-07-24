import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  APPLICATION_FALLBACK_TIMEZONE,
  EMPTY_TIMESTAMP_PLACEHOLDER,
  formatAdminDisplayDateTime,
  formatDateOnlyField,
  formatInstantInTimeZone,
  formatWorkspaceDateTime,
  formatWorkspaceDisplayDateTime,
  getWorkspaceCalendarDate,
  isValidTimeZone,
  normalizeDateOnlyString,
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

describe("getWorkspaceCalendarDate", () => {
  it("maps UTC instant to workspace calendar date via en-CA format", () => {
    assert.equal(getWorkspaceCalendarDate(UTC_INSTANT, "Asia/Amman"), "2026-07-20");
  });
});

describe("normalizeDateOnlyString", () => {
  it("returns date prefix without shifting", () => {
    assert.equal(normalizeDateOnlyString("2026-07-20"), "2026-07-20");
    assert.equal(normalizeDateOnlyString(null), null);
  });
});

describe("formatWorkspaceDateTime (R2H)", () => {
  const BANANA_INSTANT = "2026-07-24T23:36:00.000Z";

  it("A — Asia/Amman displays Jul 25 / 2:36 AM for Banana Company regression", () => {
    const formatted = formatWorkspaceDateTime(BANANA_INSTANT, "Asia/Amman");
    assert.match(formatted, /Jul 25, 2026/);
    assert.match(formatted, /2:36/);
    assert.doesNotMatch(formatted, /Jul 24, 2026, 11:36/);
  });

  it("B — America/New_York displays correct local date/time for same instant", () => {
    const formatted = formatWorkspaceDateTime(BANANA_INSTANT, "America/New_York");
    assert.match(formatted, /Jul 24, 2026/);
    assert.match(formatted, /7:36/);
  });

  it("C — same instant differs across workspace timezones", () => {
    const amman = formatWorkspaceDisplayDateTime(BANANA_INSTANT, "Asia/Amman");
    const ny = formatWorkspaceDisplayDateTime(BANANA_INSTANT, "America/New_York");
    assert.notEqual(amman, ny);
  });

  it("D — output is stable regardless of process timezone", () => {
    const formatted = formatInstantInTimeZone(BANANA_INSTANT, "Asia/Amman");
    assert.match(formatted, /Jul 25, 2026/);
    assert.match(formatted, /2:36/);
  });

  it("E — null timestamp handled safely", () => {
    assert.equal(formatWorkspaceDateTime(null, "Asia/Amman"), EMPTY_TIMESTAMP_PLACEHOLDER);
    assert.equal(formatWorkspaceDateTime(undefined, "Asia/Amman"), EMPTY_TIMESTAMP_PLACEHOLDER);
  });

  it("F — invalid timezone falls back to UTC", () => {
    const formatted = formatWorkspaceDateTime(BANANA_INSTANT, "Not/A_Timezone");
    assert.match(formatted, /Jul 24, 2026/);
    assert.match(formatted, /11:36/);
  });

  it("G — Reminder History page uses workspace timestamp formatter", () => {
    const src = readFileSync("app/[workspaceId]/reminders/page.tsx", "utf8");
    assert.match(src, /formatWorkspaceDisplayDateTime/);
    assert.match(src, /loadWorkspaceTimeZone/);
    assert.doesNotMatch(src, /toLocaleString\(/);
  });

  it("H — date-only due_date uses formatDateOnlyField, not timestamp formatter", () => {
    assert.equal(formatDateOnlyField("2026-07-25"), "Jul 25, 2026");
    const invoicePage = readFileSync("app/[workspaceId]/invoices/[invoiceId]/page.tsx", "utf8");
    assert.match(invoicePage, /formatDateOnlyField/);
  });

  it("I — AdminDateTimeCell remains on admin/browser timezone contract", () => {
    const src = readFileSync("components/admin/AdminDateTimeCell.tsx", "utf8");
    assert.match(src, /resolveAdminDisplayTimeZone/);
    assert.match(src, /formatAdminDisplayDateTime/);
    assert.doesNotMatch(src, /formatWorkspaceDisplayDateTime|formatWorkspaceDateTime/);
  });
});
