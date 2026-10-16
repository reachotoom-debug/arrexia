import assert from "node:assert/strict";
import { test } from "node:test";
import { executeEligibleReminderCandidates } from "../executeReminderRun";
import type { EligibleReminderCandidate } from "../getEligibleReminders";

test("accepted history failures and uncertain delivery remain visible without retries", async () => {
  let calls = 0;
  const candidates = ["accepted", "uncertain"].map(invoiceId => ({ invoiceId, ruleId: "rule", templateId: null, scheduledDate: "2026-10-15" })) as EligibleReminderCandidate[];
  const result = await executeEligibleReminderCandidates("workspace", candidates, async () => ++calls === 1
    ? { success: true, status: "sent", historyPersisted: false, errorMessage: "History failed" }
    : { success: false, status: "failed", deliveryUncertain: true, errorMessage: "Timeout" });
  assert.equal(result.remindersSent, 1);
  assert.equal(result.remindersFailed, 1);
  assert.equal(result.remindersUncertain, 1);
  assert.equal(result.warnings[0].historyPersisted, false);
  assert.match(result.warnings[0].warning, /reconcile.*do not resend/i);
  assert.equal(result.errors[0].deliveryUncertain, true);
  assert.match(result.errors[0].error, /reconcile.*do not resend/i);
  assert.equal(calls, 2);
});
