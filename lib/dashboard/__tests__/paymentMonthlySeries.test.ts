import assert from "node:assert/strict";
import { it } from "node:test";
import { buildPaymentMonthlySeries, formatYearMonth } from "../paymentMonthlySeries";

it("places August invoice's September payment in September and partial payments across years", () => {
  const payments = [
    { amount: 100, payment_date: "2026-09-17", status: "completed" },
    { amount: 40, payment_date: "2026-12-31", status: "paid" },
    { amount: 60, payment_date: "2027-01-01", status: null },
    { amount: 999, payment_date: "2027-01-01", status: "refunded" },
  ];
  assert.deepEqual(buildPaymentMonthlySeries(payments, ["2026-08", "2026-09", "2026-12", "2027-01"], "Asia/Amman").map(r => r.amount), [0, 100, 40, 60]);
});
it("uses workspace date only for missing business date and labels without local timezone conversion", () => {
  const rows = buildPaymentMonthlySeries([{ amount: 10, payment_date: null, created_at: "2026-12-31T23:30:00Z", status: "completed" }], ["2026-12", "2027-01"], "Asia/Amman");
  assert.deepEqual(rows.map(r => r.amount), [0, 10]);
  assert.equal(formatYearMonth("2026-09"), "Sep 2026");
});
