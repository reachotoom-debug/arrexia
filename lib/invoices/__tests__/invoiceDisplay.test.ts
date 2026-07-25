import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { getWorkspaceCalendarDateNow } from "@/lib/datetime/workspaceCalendar";
import {
  dueDateDiffDays,
  getInvoiceDueStatus,
  shouldShowDueTiming,
} from "../invoiceDisplay";
import {
  computeInvoiceOverdueDays,
  evaluateWorkspaceInvoiceAging,
  resolveWorkspaceBusinessDate,
} from "../workspaceInvoiceAging";

const BOUNDARY_INSTANT = new Date("2026-07-24T22:30:00.000Z");
const REFERENCE = "2026-07-25";

describe("dueDateDiffDays (R2J)", () => {
  it("A — due today → diff 0", () => {
    assert.equal(
      dueDateDiffDays({ dueDate: "2026-07-25", referenceDate: REFERENCE }),
      0
    );
  });

  it("B — due yesterday → diff -1", () => {
    assert.equal(
      dueDateDiffDays({ dueDate: "2026-07-24", referenceDate: REFERENCE }),
      -1
    );
  });

  it("C — due tomorrow → diff 1", () => {
    assert.equal(
      dueDateDiffDays({ dueDate: "2026-07-26", referenceDate: REFERENCE }),
      1
    );
  });

  it("G — date-only parsing does not shift due date", () => {
    assert.equal(
      dueDateDiffDays({
        dueDate: "2026-07-25T00:00:00.000Z",
        referenceDate: "2026-07-25",
      }),
      0
    );
  });
});

describe("getInvoiceDueStatus (R2J)", () => {
  it("A — due today label", () => {
    const status = getInvoiceDueStatus("2026-07-25", REFERENCE);
    assert.equal(status.line, "Due today");
    assert.equal(status.variant, "soon");
    assert.equal(status.bold, false);
  });

  it("B — one day overdue label", () => {
    const status = getInvoiceDueStatus("2026-07-24", REFERENCE);
    assert.equal(status.line, "1 day overdue");
    assert.equal(status.variant, "overdue");
    assert.equal(status.bold, true);
  });

  it("C — due in one day label", () => {
    const status = getInvoiceDueStatus("2026-07-26", REFERENCE);
    assert.equal(status.line, "Due in 1 day");
    assert.equal(status.variant, "soon");
    assert.equal(status.bold, false);
  });

  it("H — paid/void/draft gating unchanged (shouldShowDueTiming)", () => {
    assert.equal(shouldShowDueTiming("paid"), false);
    assert.equal(shouldShowDueTiming("void"), false);
    assert.equal(shouldShowDueTiming("draft"), false);
    assert.equal(shouldShowDueTiming("sent"), true);
    assert.equal(shouldShowDueTiming("overdue"), true);
    assert.equal(shouldShowDueTiming("partially_paid"), true);
  });
});

describe("workspace reference date at boundary (R2J D/E/F)", () => {
  it("D — Asia/Amman boundary maps instant to 2026-07-25", () => {
    assert.equal(
      getWorkspaceCalendarDateNow("Asia/Amman", BOUNDARY_INSTANT),
      "2026-07-25"
    );
    assert.equal(
      resolveWorkspaceBusinessDate(BOUNDARY_INSTANT, "Asia/Amman"),
      "2026-07-25"
    );
  });

  it("E — America/New_York same instant maps to 2026-07-24", () => {
    assert.equal(
      getWorkspaceCalendarDateNow("America/New_York", BOUNDARY_INSTANT),
      "2026-07-24"
    );
  });

  it("F — server timezone does not affect calendar diff (explicit reference)", () => {
    const diff = dueDateDiffDays({
      dueDate: "2026-07-25",
      referenceDate: "2026-07-25",
    });
    assert.equal(diff, 0);
  });
});

describe("invoice detail parity with invoices_view aging (R2J I/J)", () => {
  it("Asia/Amman — due yesterday is 1 day overdue", () => {
    const workspaceToday = resolveWorkspaceBusinessDate(BOUNDARY_INSTANT, "Asia/Amman");
    assert.equal(workspaceToday, "2026-07-25");

    const aging = evaluateWorkspaceInvoiceAging({
      baseStatus: "sent",
      outstanding: 100,
      paid: 0,
      dueDate: "2026-07-24",
      referenceInstant: BOUNDARY_INSTANT,
      workspaceTimeZone: "Asia/Amman",
    });
    const dueStatus = getInvoiceDueStatus("2026-07-24", workspaceToday);

    assert.equal(aging.overdueDays, 1);
    assert.equal(aging.isOverdue, true);
    assert.equal(dueStatus.line, "1 day overdue");
    assert.equal(
      computeInvoiceOverdueDays({ dueDate: "2026-07-24", workspaceToday }),
      1
    );
  });

  it("Asia/Amman — due today is Due today, not overdue", () => {
    const workspaceToday = resolveWorkspaceBusinessDate(BOUNDARY_INSTANT, "Asia/Amman");
    const aging = evaluateWorkspaceInvoiceAging({
      baseStatus: "sent",
      outstanding: 100,
      paid: 0,
      dueDate: "2026-07-25",
      referenceInstant: BOUNDARY_INSTANT,
      workspaceTimeZone: "Asia/Amman",
    });
    const dueStatus = getInvoiceDueStatus("2026-07-25", workspaceToday);

    assert.equal(aging.overdueDays, 0);
    assert.equal(aging.isOverdue, false);
    assert.equal(dueStatus.line, "Due today");
  });

  it("Asia/Amman — due tomorrow is Due in 1 day", () => {
    const workspaceToday = resolveWorkspaceBusinessDate(BOUNDARY_INSTANT, "Asia/Amman");
    const aging = evaluateWorkspaceInvoiceAging({
      baseStatus: "sent",
      outstanding: 100,
      paid: 0,
      dueDate: "2026-07-26",
      referenceInstant: BOUNDARY_INSTANT,
      workspaceTimeZone: "Asia/Amman",
    });
    const dueStatus = getInvoiceDueStatus("2026-07-26", workspaceToday);

    assert.equal(aging.overdueDays, 0);
    assert.equal(aging.isOverdue, false);
    assert.equal(dueStatus.line, "Due in 1 day");
  });

  it("America/New_York — same instant uses NY workspace date, not Amman", () => {
    const workspaceToday = resolveWorkspaceBusinessDate(
      BOUNDARY_INSTANT,
      "America/New_York"
    );
    assert.equal(workspaceToday, "2026-07-24");

    const dueStatusToday = getInvoiceDueStatus("2026-07-24", workspaceToday);
    assert.equal(dueStatusToday.line, "Due today");

    const dueStatusTomorrow = getInvoiceDueStatus("2026-07-25", workspaceToday);
    assert.equal(dueStatusTomorrow.line, "Due in 1 day");
  });
});
