import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  calculateAveragePaymentTermsDays,
  sumPaymentsReceivedInLast30CalendarDays,
} from "@/app/[workspaceId]/dashboard/_utils/dashboardOverviewMetrics";

describe("dashboardOverviewMetrics", () => {
  it("sums completed payments by payment business date in last 30 calendar days", () => {
    const now = new Date("2026-07-18T12:00:00.000Z");
    const result = sumPaymentsReceivedInLast30CalendarDays(
      [
        {
          amount: 100,
          net_amount: 95,
          payment_date: "2026-07-10",
          created_at: "2026-07-10T10:00:00.000Z",
          status: "completed",
        },
        {
          amount: 50,
          payment_date: "2026-06-01",
          created_at: "2026-06-01T10:00:00.000Z",
          status: "completed",
        },
        {
          amount: 200,
          payment_date: "2026-07-15",
          created_at: "2026-07-15T10:00:00.000Z",
          status: "pending",
        },
      ],
      "UTC",
      now
    );

    assert.equal(result.amount, 95);
    assert.equal(result.count, 1);
    assert.equal(result.windowEnd, "2026-07-18");
    assert.equal(result.windowStart, "2026-06-19");
  });

  it("returns null average payment terms when no fully paid invoices in window", () => {
    const windowStart = new Date("2026-04-01T00:00:00.000Z");
    const avg = calculateAveragePaymentTermsDays(
      [
        {
          outstanding: 100,
          issueDate: "2026-05-01",
          dueDate: "2026-05-31",
        },
      ],
      windowStart
    );
    assert.equal(avg, null);
  });

  it("calculates average issue-to-due days on fully paid invoices", () => {
    const windowStart = new Date("2026-04-01T00:00:00.000Z");
    const avg = calculateAveragePaymentTermsDays(
      [
        {
          outstanding: 0,
          issueDate: "2026-05-01",
          dueDate: "2026-05-31",
        },
        {
          outstanding: 0,
          issueDate: "2026-06-01",
          dueDate: "2026-06-16",
        },
      ],
      windowStart
    );
    assert.equal(avg, 23);
  });
});
