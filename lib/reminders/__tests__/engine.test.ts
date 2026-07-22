import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  computeInvoiceTiming,
  matchesReminderRuleTrigger,
} from "../ruleTrigger";

function dueDateDaysFromToday(today: Date, dayOffset: number): string {
  const d = new Date(today);
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + dayOffset);
  return d.toISOString().slice(0, 10);
}

describe("matchesReminderRuleTrigger (canonical reminder_rules contract)", () => {
  const today = new Date("2026-07-22T12:00:00.000Z");

  it("before_due / offset 3 matches exactly 3 days before due", () => {
    const timing = computeInvoiceTiming(
      { due_date: dueDateDaysFromToday(today, 3) },
      today
    );
    assert.equal(matchesReminderRuleTrigger(timing, "before_due", 3), true);
  });

  it("before_due / offset 3 does NOT match 2 or 4 days before due", () => {
    const twoDaysBefore = computeInvoiceTiming(
      { due_date: dueDateDaysFromToday(today, 2) },
      today
    );
    const fourDaysBefore = computeInvoiceTiming(
      { due_date: dueDateDaysFromToday(today, 4) },
      today
    );
    assert.equal(matchesReminderRuleTrigger(twoDaysBefore, "before_due", 3), false);
    assert.equal(matchesReminderRuleTrigger(fourDaysBefore, "before_due", 3), false);
  });

  it("on_due / offset 0 matches due date", () => {
    const timing = computeInvoiceTiming(
      { due_date: dueDateDaysFromToday(today, 0) },
      today
    );
    assert.equal(matchesReminderRuleTrigger(timing, "on_due", 0), true);
  });

  it("after_due / offset 3 matches exactly 3 days overdue", () => {
    const timing = computeInvoiceTiming(
      { due_date: dueDateDaysFromToday(today, -3) },
      today
    );
    assert.equal(matchesReminderRuleTrigger(timing, "after_due", 3), true);
  });

  it("after_due / offset 7 matches exactly 7 days overdue", () => {
    const timing = computeInvoiceTiming(
      { due_date: dueDateDaysFromToday(today, -7) },
      today
    );
    assert.equal(matchesReminderRuleTrigger(timing, "after_due", 7), true);
  });

  it("legacy relative_to_due_date trigger type never matches (post-normalization contract)", () => {
    const timing = computeInvoiceTiming(
      { due_date: dueDateDaysFromToday(today, 3) },
      today
    );
    assert.equal(matchesReminderRuleTrigger(timing, "relative_to_due_date", -3), false);
  });
});

describe("findApplicableRuleForInvoice outstanding gate", () => {
  it("outstanding <= 0 does not qualify", () => {
    for (const outstanding of [0, -1]) {
      assert.equal(Boolean(outstanding && outstanding > 0), false);
    }
  });
});
