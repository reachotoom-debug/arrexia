import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { formatDate } from "@/lib/csv/exportCsv";
import { formatDateOnlyField } from "@/lib/datetime/formatDateTime";
import { getWorkspaceCalendarDateNow } from "@/lib/datetime/workspaceCalendar";
import { formatInvoiceDate } from "../invoiceDisplay";
import { resolveWorkspaceBusinessDate } from "../workspaceInvoiceAging";

const DATE_ONLY = "2026-07-25";
const BOUNDARY_INSTANT = new Date("2026-07-24T22:30:00.000Z");

describe("formatDateOnlyField — calendar date preserved (R2K)", () => {
  it("1 — YYYY-MM-DD formats as Jul 25, 2026", () => {
    assert.equal(formatDateOnlyField(DATE_ONLY), "Jul 25, 2026");
  });

  it("2 — July 25 remains July 25 regardless of process timezone (UTC path)", () => {
    const original = process.env.TZ;
    try {
      process.env.TZ = "UTC";
      assert.equal(formatDateOnlyField(DATE_ONLY), "Jul 25, 2026");
    } finally {
      if (original === undefined) delete process.env.TZ;
      else process.env.TZ = original;
    }
  });

  it("3 — July 25 remains July 25 under America/Los_Angeles process TZ", () => {
    const original = process.env.TZ;
    try {
      process.env.TZ = "America/Los_Angeles";
      assert.equal(formatDateOnlyField(DATE_ONLY), "Jul 25, 2026");
    } finally {
      if (original === undefined) delete process.env.TZ;
      else process.env.TZ = original;
    }
  });

  it("4 — July 25 remains July 25 under Asia/Amman process TZ", () => {
    const original = process.env.TZ;
    try {
      process.env.TZ = "Asia/Amman";
      assert.equal(formatDateOnlyField(DATE_ONLY), "Jul 25, 2026");
    } finally {
      if (original === undefined) delete process.env.TZ;
      else process.env.TZ = original;
    }
  });
});

describe("formatInvoiceDate — live PDF path (R2K)", () => {
  it("delegates to calendar-safe date-only formatter", () => {
    assert.equal(formatInvoiceDate(DATE_ONLY), "Jul 25, 2026");
    assert.equal(formatInvoiceDate(DATE_ONLY), formatDateOnlyField(DATE_ONLY));
  });
});

describe("new-invoice default issue date (R2K)", () => {
  it("5 — Asia/Amman boundary instant resolves to 2026-07-25", () => {
    const primary = getWorkspaceCalendarDateNow("Asia/Amman", BOUNDARY_INSTANT);
    const fallback = resolveWorkspaceBusinessDate(BOUNDARY_INSTANT, "Asia/Amman");
    assert.equal(primary, "2026-07-25");
    assert.equal(fallback, "2026-07-25");
  });

  it("default path prefers workspace calendar now over UTC ISO slice", () => {
    const workspaceToday = getWorkspaceCalendarDateNow("Asia/Amman", BOUNDARY_INSTANT);
    const utcSlice = BOUNDARY_INSTANT.toISOString().slice(0, 10);
    assert.equal(workspaceToday, "2026-07-25");
    assert.equal(utcSlice, "2026-07-24");
    assert.notEqual(workspaceToday, utcSlice);
  });
});

describe("invoice CSV export date-only (R2K)", () => {
  it("exact YYYY-MM-DD passes through unchanged", () => {
    assert.equal(formatDate("2026-07-25"), "2026-07-25");
  });
});

describe("invoice list wiring (R2K)", () => {
  it("InvoicesTable imports formatDateOnlyField", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync(
      "app/[workspaceId]/invoices/_components/InvoicesTable.tsx",
      "utf8"
    );
    assert.match(source, /formatDateOnlyField/);
    assert.doesNotMatch(source, /new Date\(inv\.issue_date\)\.toLocaleDateString/);
    assert.doesNotMatch(source, /new Date\(inv\.due_date\)\.toLocaleDateString/);
  });
});

describe("invoice detail date-only parity (R2K)", () => {
  it("invoice detail page uses formatDateOnlyField for issue/due dates", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync(
      "app/[workspaceId]/invoices/[invoiceId]/page.tsx",
      "utf8"
    );
    assert.match(source, /formatDateOnlyField/);
    assert.match(source, /getInvoiceDueStatus/);
    assert.match(source, /getWorkspaceCalendarDateNow/);
  });
});
