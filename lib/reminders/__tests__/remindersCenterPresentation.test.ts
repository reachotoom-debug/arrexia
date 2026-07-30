import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildAutomationStatusPresentation,
  computeHistoryRemindersSummary,
  computeReadyRemindersSummary,
  formatHumanReminderRuleLabel,
  formatReminderActionReason,
  normalizeReminderFailureReason,
} from "../remindersCenterPresentation";

describe("Reminders Automation Center presentation (Task 4)", () => {
  it("Ready to Send tab label is present in RemindersTabs", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(
      "app/[workspaceId]/reminders/_components/RemindersTabs.tsx",
      "utf8"
    );
    assert.match(src, /Ready to Send/);
    assert.doesNotMatch(src, /Suggested reminders/);
  });

  it("page subtitle uses automation-focused copy", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("app/[workspaceId]/reminders/page.tsx", "utf8");
    assert.match(src, /Manage scheduled payment reminders/);
  });

  it("human-readable rule labels map canonical schedules", () => {
    assert.equal(
      formatHumanReminderRuleLabel({ triggerType: "on_due", offsetDays: 0 }),
      "First Reminder"
    );
    assert.equal(
      formatHumanReminderRuleLabel({ triggerType: "after_due", offsetDays: 7 }),
      "7-Day Reminder"
    );
    assert.equal(
      formatHumanReminderRuleLabel({ triggerType: "after_due", offsetDays: 14 }),
      "14-Day Reminder"
    );
    assert.equal(
      formatHumanReminderRuleLabel({ triggerType: "after_due", offsetDays: 60 }),
      "Final Notice"
    );
    assert.equal(
      formatHumanReminderRuleLabel({ triggerType: "after_due", offsetDays: 21, ruleName: "Custom 21" }),
      "21-Day Reminder"
    );
  });

  it("reason formatting stays business-readable", () => {
    assert.equal(
      formatReminderActionReason({
        triggerType: "before_due",
        offsetDays: 3,
        daysFromDue: -3,
        isOverdue: false,
      }),
      "Scheduled reminder due today"
    );
    assert.equal(
      formatReminderActionReason({
        triggerType: "after_due",
        offsetDays: 7,
        daysFromDue: 7,
        isOverdue: true,
      }),
      "7-day follow-up"
    );
  });

  it("ready summary handles single currency", () => {
    const summary = computeReadyRemindersSummary(
      [
        {
          clientId: "c1",
          ruleId: "r1",
          outstanding: 1000,
          currency: "USD",
        },
        {
          clientId: "c1",
          ruleId: "r2",
          outstanding: 500,
          currency: "USD",
        },
      ],
      "USD"
    );

    assert.equal(summary.readyCount, 2);
    assert.equal(summary.distinctCustomerCount, 1);
    assert.equal(summary.distinctRuleCount, 2);
    assert.match(summary.outstandingLabel, /1,500/);
    assert.equal(summary.outstandingDetail, undefined);
  });

  it("ready summary does not combine multiple currencies", () => {
    const summary = computeReadyRemindersSummary(
      [
        {
          clientId: "c1",
          ruleId: "r1",
          outstanding: 1000,
          currency: "USD",
        },
        {
          clientId: "c2",
          ruleId: "r1",
          outstanding: 500,
          currency: "EUR",
        },
      ],
      "USD"
    );

    assert.match(summary.outstandingLabel, /\$/);
    assert.match(summary.outstandingLabel, /€/);
    assert.match(summary.outstandingDetail ?? "", /currency/i);
  });

  it("automation status counts active and disabled rules", () => {
    const status = buildAutomationStatusPresentation({
      workspaceId: "ws-1",
      automationAllowed: true,
      rules: [
        { is_enabled: true },
        { is_enabled: true },
        { is_enabled: false },
      ],
      settingsLoaded: true,
    });

    assert.equal(status.statusLabel, "Enabled");
    assert.equal(status.activeRules, 2);
    assert.equal(status.disabledRules, 1);
    assert.match(status.statusDetail, /enabled/i);
  });

  it("history summary uses workspace timezone for today metrics", () => {
    const summary = computeHistoryRemindersSummary({
      workspaceTimeZone: "UTC",
      evaluationInstant: new Date("2026-07-30T15:00:00.000Z"),
      rows: [
        { status: "sent", sent_at: "2026-07-30T08:00:00.000Z", created_at: null },
        { status: "failed", sent_at: "2026-07-30T09:00:00.000Z", created_at: null },
        { status: "sent", sent_at: "2026-07-29T08:00:00.000Z", created_at: null },
        { status: "skipped", sent_at: "2026-07-30T10:00:00.000Z", created_at: null },
      ],
    });

    assert.equal(summary.sentToday, 1);
    assert.equal(summary.failedToday, 1);
    assert.equal(summary.last30DaysCompleted, 3);
    assert.equal(summary.successRateLabel, "67%");
  });

  it("success rate shows em dash when no completed attempts", () => {
    const summary = computeHistoryRemindersSummary({
      workspaceTimeZone: "UTC",
      rows: [],
    });

    assert.equal(summary.successRateLabel, "—");
  });

  it("failure normalization maps known provider messages", () => {
    assert.equal(
      normalizeReminderFailureReason("Domain not verified with Resend"),
      "Sender domain not verified"
    );
    assert.equal(
      normalizeReminderFailureReason("You can only send testing emails to your own email address using onboarding@resend.dev"),
      "Provider rejected recipient"
    );
    assert.equal(
      normalizeReminderFailureReason("Request timed out while sending email"),
      "Email send timed out"
    );
  });

  it("failure normalization falls back safely", () => {
    assert.equal(normalizeReminderFailureReason(null), "Email delivery failed");
    assert.equal(
      normalizeReminderFailureReason("Something completely unexpected happened here with extra detail"),
      "Email delivery failed"
    );
  });

  it("Email send action contract remains on sendReminderAction", async () => {
    const { readFileSync } = await import("node:fs");
    const buttonSrc = readFileSync(
      "app/[workspaceId]/reminders/_components/send-reminder-button.tsx",
      "utf8"
    );
    const actionsSrc = readFileSync("app/[workspaceId]/reminders/actions.ts", "utf8");

    assert.match(buttonSrc, /sendReminderAction/);
    assert.match(buttonSrc, /showEmailLabel/);
    assert.match(buttonSrc, />Email</);
    assert.match(actionsSrc, /sendReminderForInvoice/);
  });

  it("getEligibleReminders remains the ready-queue data source", async () => {
    const { readFileSync } = await import("node:fs");
    const pageSrc = readFileSync("app/[workspaceId]/reminders/page.tsx", "utf8");
    assert.match(pageSrc, /getEligibleReminders/);
    assert.doesNotMatch(pageSrc, /buildDailyActionCategories/);
  });
});
