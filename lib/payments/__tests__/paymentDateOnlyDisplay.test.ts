import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { formatDate } from "@/lib/csv/exportCsv";
import { formatDateOnlyField } from "@/lib/datetime/formatDateTime";
import { getWorkspaceCalendarDateNow } from "@/lib/datetime/workspaceCalendar";
import { resolveWorkspaceBusinessDate } from "@/lib/invoices/workspaceInvoiceAging";

const PAYMENT_DATE = "2026-07-25";
const BOUNDARY_INSTANT = new Date("2026-07-24T22:30:00.000Z");

describe("payment DATE formatting (R2L)", () => {
  it("1 — 2026-07-25 remains Jul 25, 2026", () => {
    assert.equal(formatDateOnlyField(PAYMENT_DATE), "Jul 25, 2026");
  });

  it("2 — July 25 stable under UTC process timezone", () => {
    const original = process.env.TZ;
    try {
      process.env.TZ = "UTC";
      assert.equal(formatDateOnlyField(PAYMENT_DATE), "Jul 25, 2026");
    } finally {
      if (original === undefined) delete process.env.TZ;
      else process.env.TZ = original;
    }
  });

  it("3 — July 25 stable under America/Los_Angeles process timezone", () => {
    const original = process.env.TZ;
    try {
      process.env.TZ = "America/Los_Angeles";
      assert.equal(formatDateOnlyField(PAYMENT_DATE), "Jul 25, 2026");
    } finally {
      if (original === undefined) delete process.env.TZ;
      else process.env.TZ = original;
    }
  });

  it("4 — July 25 stable under Asia/Amman process timezone", () => {
    const original = process.env.TZ;
    try {
      process.env.TZ = "Asia/Amman";
      assert.equal(formatDateOnlyField(PAYMENT_DATE), "Jul 25, 2026");
    } finally {
      if (original === undefined) delete process.env.TZ;
      else process.env.TZ = original;
    }
  });
});

describe("new-payment default date (R2L)", () => {
  it("5 — Asia/Amman boundary instant resolves to 2026-07-25", () => {
    assert.equal(
      getWorkspaceCalendarDateNow("Asia/Amman", BOUNDARY_INSTANT),
      "2026-07-25"
    );
    assert.equal(
      resolveWorkspaceBusinessDate(BOUNDARY_INSTANT, "Asia/Amman"),
      "2026-07-25"
    );
  });

  it("UTC ISO slice disagrees with workspace business date at boundary", () => {
    assert.equal(BOUNDARY_INSTANT.toISOString().slice(0, 10), "2026-07-24");
    assert.notEqual(
      getWorkspaceCalendarDateNow("Asia/Amman", BOUNDARY_INSTANT),
      BOUNDARY_INSTANT.toISOString().slice(0, 10)
    );
  });
});

describe("payment UI wiring (R2L)", () => {
  it("6 — live PaymentsTable uses formatDateOnlyField", () => {
    const source = readFileSync("components/payments/PaymentsTable.tsx", "utf8");
    assert.match(source, /formatDateOnlyField/);
    assert.doesNotMatch(source, /toLocaleDateString/);
  });

  it("7 — archive confirmation dialog uses formatDateOnlyField", () => {
    const source = readFileSync(
      "app/[workspaceId]/payments/_components/PaymentArchiveConfirmDialog.tsx",
      "utf8"
    );
    assert.match(source, /formatDateOnlyField/);
    assert.doesNotMatch(source, /toLocaleDateString/);
  });

  it("8 — payment DATE export passes through YYYY-MM-DD", () => {
    assert.equal(formatDate("2026-07-25"), "2026-07-25");
  });

  it("9 — invoice payment history distinguishes DATE vs TIMESTAMPTZ fallback", () => {
    const source = readFileSync(
      "app/[workspaceId]/invoices/[invoiceId]/page.tsx",
      "utf8"
    );
    assert.match(source, /formatPaymentHistoryDate/);
    assert.match(source, /payment\.payment_date/);
    assert.match(source, /formatDateTime\(payment\.created_at\)/);
  });

  it("10 — payment edit form uses normalizeDateOnlyString for DATE input", () => {
    const source = readFileSync(
      "app/[workspaceId]/payments/[paymentId]/edit/page.tsx",
      "utf8"
    );
    assert.match(source, /normalizeDateOnlyString/);
    assert.doesNotMatch(source, /new Date\(dateString\)/);
  });
});

describe("new payment page fallback (R2L)", () => {
  it("uses resolveWorkspaceBusinessDate instead of UTC ISO slice", () => {
    const source = readFileSync("app/[workspaceId]/payments/new/page.tsx", "utf8");
    assert.match(source, /resolveWorkspaceBusinessDate/);
    assert.doesNotMatch(source, /toISOString\(\)\.slice\(0, 10\)/);
  });
});
