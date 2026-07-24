import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  formatWorkspaceDisplayDateTime,
  getWorkspaceCalendarDate,
  normalizeDateOnlyString,
  parseInstant,
} from "../formatDateTime";
import {
  addCalendarDays,
  differenceCalendarDays,
  getWorkspaceCalendarDateNow,
  resolveWorkspaceEvaluationDate,
} from "../workspaceCalendar";
import { computeDueDate } from "@/lib/invoices/paymentTerms";
import { buildEligibleReminderCandidates } from "@/lib/reminders/getEligibleReminders";
import { resolveAdminDisplayTimeZone } from "../formatDateTime";

const BOUNDARY_INSTANT = new Date("2026-07-24T22:31:00.000Z");

describe("workspace calendar contract (A/B)", () => {
  it("A — Asia/Amman midnight boundary maps to 2026-07-25", () => {
    assert.equal(
      getWorkspaceCalendarDate(BOUNDARY_INSTANT, "Asia/Amman"),
      "2026-07-25"
    );
    assert.equal(
      getWorkspaceCalendarDateNow("Asia/Amman", BOUNDARY_INSTANT),
      "2026-07-25"
    );
  });

  it("B — America/New_York same instant maps to 2026-07-24", () => {
    assert.equal(
      getWorkspaceCalendarDate(BOUNDARY_INSTANT, "America/New_York"),
      "2026-07-24"
    );
  });
});

describe("resolveWorkspaceEvaluationDate (F)", () => {
  it("uses workspace timezone for reminder evaluation date", () => {
    assert.equal(
      resolveWorkspaceEvaluationDate(BOUNDARY_INSTANT, "Asia/Amman"),
      "2026-07-25"
    );
    assert.equal(
      resolveWorkspaceEvaluationDate(BOUNDARY_INSTANT, "America/New_York"),
      "2026-07-24"
    );
  });
});

describe("computeDueDate / Net terms (C/D)", () => {
  it("D — Net 30 calendar arithmetic: 2026-07-25 + 30 = 2026-08-24", () => {
    assert.equal(computeDueDate("2026-07-25", 30), "2026-08-24");
  });

  it("C — due date add does not shift via local timezone parsing", () => {
    assert.equal(computeDueDate("2026-07-31", 1), "2026-08-01");
  });
});

describe("normalizeDateOnlyString (I)", () => {
  it("extracts YYYY-MM-DD without UTC day shift", () => {
    assert.equal(normalizeDateOnlyString("2026-07-25"), "2026-07-25");
    assert.equal(normalizeDateOnlyString("2026-07-25T00:00:00.000Z"), "2026-07-25");
  });
});

describe("Suggested vs automatic eligibility date (F/G)", () => {
  it("G — on_due rule matches when evaluation date equals due_date in workspace TZ", () => {
    const evaluationDate = resolveWorkspaceEvaluationDate(
      BOUNDARY_INSTANT,
      "Asia/Amman"
    );
    assert.equal(evaluationDate, "2026-07-25");

    const candidates = buildEligibleReminderCandidates({
      workspaceId: "ws-tz",
      evaluationDate,
      workspaceTimeZone: "Asia/Amman",
      invoices: [
        {
          id: "inv-4",
          invoice_number: "INV-0004",
          client_id: "client-1",
          client_name: "Acme",
          client_is_active: true,
          client_archived_at: null,
          due_date: "2026-07-25",
          outstanding: 100,
          paid: 0,
          total: 100,
          base_status: "sent",
          display_status: "sent",
          currency: "USD",
          is_overdue: false,
          overdue_days: 0,
        },
      ],
      rules: [
        {
          id: "rule-on-due",
          name: "On due date",
          trigger_type: "on_due",
          offset_days: 0,
          for_status: "any",
          is_enabled: true,
          template_id: "tpl-1",
          sort_order: 1,
          reminder_template: {
            id: "tpl-1",
            workspace_id: "ws-tz",
            is_enabled: true,
          },
        },
      ],
      historyRows: [],
      clientEmailsByClientId: new Map([["client-1", "a@test.com"]]),
    });

    assert.equal(candidates.length, 1);
    assert.equal(candidates[0]?.scheduledDate, "2026-07-25");
  });
});

describe("days overdue at timezone boundary (H)", () => {
  it("calendar diff uses date-only semantics", () => {
    assert.equal(differenceCalendarDays("2026-07-25", "2026-07-24"), 1);
    assert.equal(addCalendarDays("2026-07-24", 1), "2026-07-25");
  });
});

describe("timestamp presentation (J/K/L)", () => {
  it("J — workspace-facing timestamp formats in workspace timezone", () => {
    const formatted = formatWorkspaceDisplayDateTime(
      "2026-07-24T22:31:00.000Z",
      "Asia/Amman"
    );
    assert.match(formatted, /Jul 25, 2026/);
  });

  it("K — admin display resolves browser/admin timezone helper", () => {
    const tz = resolveAdminDisplayTimeZone();
    assert.ok(typeof tz === "string" && tz.length > 0);
  });

  it("L — UTC instant storage unchanged (parse round-trip)", () => {
    const iso = "2026-07-24T22:31:00.000Z";
    assert.equal(parseInstant(iso)?.toISOString(), iso);
  });
});
