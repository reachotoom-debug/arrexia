import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { formatDate } from "@/lib/csv/exportCsv";
import {
  formatPaymentBusinessDate,
  resolvePaymentBusinessDate,
} from "../paymentBusinessDate";

const BOUNDARY_INSTANT = "2026-07-24T22:30:00.000Z";
const PAYMENT_DATE = "2026-07-25";

describe("resolvePaymentBusinessDate (R2M)", () => {
  it("A — payment_date present is authoritative DATE", () => {
    assert.equal(
      resolvePaymentBusinessDate({
        paymentDate: PAYMENT_DATE,
        createdAt: BOUNDARY_INSTANT,
        workspaceTimeZone: "Asia/Amman",
      }),
      "2026-07-25"
    );
  });

  it("B — payment_date absent uses workspace calendar from created_at", () => {
    assert.equal(
      resolvePaymentBusinessDate({
        paymentDate: null,
        createdAt: BOUNDARY_INSTANT,
        workspaceTimeZone: "Asia/Amman",
      }),
      "2026-07-25"
    );
  });

  it("C — Asia/Amman boundary on created_at fallback", () => {
    assert.equal(
      resolvePaymentBusinessDate({
        paymentDate: null,
        createdAt: BOUNDARY_INSTANT,
        workspaceTimeZone: "Asia/Amman",
      }),
      "2026-07-25"
    );
  });

  it("D — America/New_York same instant resolves to 2026-07-24", () => {
    assert.equal(
      resolvePaymentBusinessDate({
        paymentDate: null,
        createdAt: BOUNDARY_INSTANT,
        workspaceTimeZone: "America/New_York",
      }),
      "2026-07-24"
    );
  });

  it("E — explicit reference is timezone-stable (no process TZ dependence)", () => {
    const original = process.env.TZ;
    try {
      process.env.TZ = "UTC";
      const utcResult = resolvePaymentBusinessDate({
        paymentDate: PAYMENT_DATE,
        createdAt: BOUNDARY_INSTANT,
        workspaceTimeZone: "Asia/Amman",
      });
      process.env.TZ = "America/Los_Angeles";
      const laResult = resolvePaymentBusinessDate({
        paymentDate: PAYMENT_DATE,
        createdAt: BOUNDARY_INSTANT,
        workspaceTimeZone: "Asia/Amman",
      });
      assert.equal(utcResult, laResult);
      assert.equal(utcResult, "2026-07-25");
    } finally {
      if (original === undefined) delete process.env.TZ;
      else process.env.TZ = original;
    }
  });
});

describe("formatPaymentBusinessDate (R2M)", () => {
  it("formats resolved business date for display", () => {
    assert.equal(
      formatPaymentBusinessDate({
        paymentDate: PAYMENT_DATE,
        createdAt: null,
        workspaceTimeZone: "Asia/Amman",
      }),
      "Jul 25, 2026"
    );
  });
});

describe("payment list data contract (R2M F)", () => {
  it("payments page resolves businessPaymentDate at server layer", () => {
    const source = readFileSync("app/[workspaceId]/payments/page.tsx", "utf8");
    assert.match(source, /resolvePaymentBusinessDate/);
    assert.match(source, /businessPaymentDate:/);
    assert.doesNotMatch(source, /payment_date:\s*payment\.payment_date\s*\|\|\s*payment\.created_at/);
  });

  it("live PaymentsTable displays businessPaymentDate only", () => {
    const source = readFileSync("components/payments/PaymentsTable.tsx", "utf8");
    assert.match(source, /businessPaymentDate/);
    assert.doesNotMatch(source, /p\.payment_date/);
  });
});

describe("TIMESTAMPTZ audit fields (R2M G)", () => {
  it("payment detail keeps created_at as workspace timestamp", () => {
    const source = readFileSync(
      "app/[workspaceId]/payments/[paymentId]/page.tsx",
      "utf8"
    );
    assert.match(source, /formatTimestamp\(payment\.created_at/);
    assert.match(source, /formatPaymentBusinessDate/);
  });
});

describe("CSV DATE export (R2M H)", () => {
  it("exact YYYY-MM-DD unchanged via exportCsv", () => {
    assert.equal(formatDate("2026-07-25"), "2026-07-25");
  });

  it("payment export route uses resolvePaymentBusinessDate", () => {
    const source = readFileSync("app/api/export/payments/route.ts", "utf8");
    assert.match(source, /resolvePaymentBusinessDate/);
    assert.doesNotMatch(source, /payment\.payment_date\s*\|\|\s*payment\.paid_at/);
  });
});

describe("dead duplicate payment components (R2M J)", () => {
  it("legacy app PaymentsTable removed", () => {
    assert.equal(
      existsSync("app/[workspaceId]/payments/_components/PaymentsTable.tsx"),
      false
    );
  });

  it("legacy components/payments-table removed", () => {
    assert.equal(existsSync("components/payments/payments-table.tsx"), false);
  });

  it("live list still imports components/payments/PaymentsTable", () => {
    const source = readFileSync("app/[workspaceId]/payments/page.tsx", "utf8");
    assert.match(source, /components\/payments\/PaymentsTable/);
  });
});

describe("payment import unchanged (R2M I)", () => {
  it("import schema requires YYYY-MM-DD payment_date", () => {
    const source = readFileSync("lib/payments/import-schema.ts", "utf8");
    assert.match(source, /payment_date.*YYYY-MM-DD/);
  });
});
