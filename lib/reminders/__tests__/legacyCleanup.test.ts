import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";

const REMOVED_LEGACY_PATHS = [
  "lib/reminders.ts",
  "lib/reminders/engine.ts",
  "lib/reminders/suggested.ts",
  "lib/reminders/suggestions.ts",
  "lib/reminders/resolve-template.ts",
  "lib/reminders/send-invoice-reminder.ts",
  "lib/reminders/get-eligible-invoices.ts",
  "lib/reminders/templates.ts",
  "lib/reminders/ensure.ts",
  "components/reminders/reminders-table.tsx",
  "components/reminders/reminder-modal.tsx",
  "components/reminders/reminder-form.tsx",
  "lib/schemas/reminder.ts",
  "app/[workspaceId]/reminders/SendReminderButton.tsx",
  "app/[workspaceId]/collections/_components/CollectionContactButton.tsx",
];

describe("R2D legacy reminder cleanup", () => {
  for (const relativePath of REMOVED_LEGACY_PATHS) {
    it(`removed dead legacy file: ${relativePath}`, () => {
      assert.equal(existsSync(relativePath), false);
    });
  }

  it("Suggested Reminders page uses canonical getEligibleReminders", () => {
    const src = readFileSync("app/[workspaceId]/reminders/page.tsx", "utf8");
    assert.match(src, /getEligibleReminders/);
    assert.doesNotMatch(src, /getSuggestedReminders|findApplicableRuleForInvoice/);
  });

  it("manual suggested send uses sendReminderForInvoice", () => {
    const actions = readFileSync("app/[workspaceId]/reminders/actions.ts", "utf8");
    const button = readFileSync(
      "app/[workspaceId]/reminders/_components/send-reminder-button.tsx",
      "utf8"
    );
    assert.match(actions, /sendReminderForInvoice/);
    assert.match(button, /sendReminderAction/);
  });

  it("automatic runner uses gated canonical path", () => {
    const src = readFileSync("lib/reminders/run-reminders.ts", "utf8");
    assert.match(src, /loadAutomationGateForWorkspace/);
    assert.match(src, /loadEmailReadinessForWorkspace/);
    assert.match(src, /getEligibleReminders/);
    assert.match(src, /executeEligibleReminderCandidates/);
    assert.doesNotMatch(src, /findApplicableRuleForInvoice|getSuggestedReminders/);
  });

  it("collections actions no longer reference reminder_history", () => {
    const src = readFileSync("app/[workspaceId]/collections/actions.ts", "utf8");
    assert.doesNotMatch(src, /reminder_history/);
    assert.match(src, /updateCollectionsNote/);
  });

  it("rule-bound templates resolve through ruleTemplate module", () => {
    const sendSrc = readFileSync("lib/reminders/send.ts", "utf8");
    assert.match(sendSrc, /fetchRuleBoundTemplate/);
    assert.doesNotMatch(sendSrc, /resolve-template|resolveTemplateForRule/);
  });
});
