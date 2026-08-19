import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

describe("invoice detail settings load contract", () => {
  it("loads settings once and derives timezone from the canonical row", () => {
    const src = readFileSync(
      "app/[workspaceId]/invoices/[invoiceId]/page.tsx",
      "utf8"
    );

    assert.doesNotMatch(src, /loadWorkspaceTimeZone/);
    assert.match(src, /\.from\("settings"\)[\s\S]*\.select\("\*"\)/);
    assert.match(src, /const workspaceTimeZone = settings\?\.timezone \?\? null/);
  });

  it("preserves workspace business-date and overdue calculations", () => {
    const src = readFileSync(
      "app/[workspaceId]/invoices/[invoiceId]/page.tsx",
      "utf8"
    );

    assert.match(src, /getWorkspaceCalendarDateNow\(workspaceTimeZone\)/);
    assert.match(src, /resolveWorkspaceBusinessDate\(new Date\(\), workspaceTimeZone\)/);
    assert.match(src, /getInvoiceDueStatus\(invoice\.due_date, workspaceToday\)/);
    assert.match(src, /formatWorkspaceDisplayDateTime\(value, workspaceTimeZone\)/);
  });
});
