import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const templateFormSrc = readFileSync(
  "app/[workspaceId]/settings/_components/ReminderTemplateFormDialog.tsx",
  "utf8"
);
const ruleFormSrc = readFileSync(
  "app/[workspaceId]/settings/_components/ReminderRuleForm.tsx",
  "utf8"
);

function countOccurrences(source: string, needle: string): number {
  return source.split(needle).length - 1;
}

describe("Reminder form modal layout contracts", () => {
  it("A — Template form does not use right-aligned field labels", () => {
    assert.doesNotMatch(templateFormSrc, /label[^>]*text-right/);
    assert.doesNotMatch(templateFormSrc, /htmlFor="reminder-template-name"[\s\S]*?className="[^"]*text-right/);
    assert.match(templateFormSrc, /block text-left text-sm font-medium/);
  });

  it("B — Rule form does not use right-aligned field labels", () => {
    assert.doesNotMatch(ruleFormSrc, /label[^>]*text-right/);
    assert.doesNotMatch(ruleFormSrc, /htmlFor="reminder-rule-name"[\s\S]*?className="[^"]*text-right/);
    assert.match(ruleFormSrc, /block text-left text-sm font-medium/);
  });

  it("C — Template form contains only one visible Name field label", () => {
    assert.equal(countOccurrences(templateFormSrc, "Name <span aria-hidden"), 1);
    assert.doesNotMatch(templateFormSrc, /DialogDescription/);
  });

  it("D — Template and Rule forms use one-column vertical field structure", () => {
    assert.doesNotMatch(templateFormSrc, /grid-cols-2/);
    assert.doesNotMatch(ruleFormSrc, /grid-cols-2/);
    assert.match(templateFormSrc, /className="space-y-4"/);
    assert.match(ruleFormSrc, /className="space-y-4"/);
    assert.match(templateFormSrc, /space-y-1\.5/);
    assert.match(ruleFormSrc, /space-y-1\.5/);
  });

  it("E — Existing create/update handlers remain wired", () => {
    assert.match(templateFormSrc, /createReminderTemplate/);
    assert.match(templateFormSrc, /updateReminderTemplate/);
    assert.match(ruleFormSrc, /createReminderRule/);
    assert.match(ruleFormSrc, /updateReminderRule/);
    assert.match(ruleFormSrc, /deleteReminderRule/);
  });

  it("F — Existing validation/schema references remain unchanged", () => {
    assert.match(templateFormSrc, /ReminderTemplateSchema/);
    assert.match(ruleFormSrc, /ReminderRuleSchema/);
    assert.match(templateFormSrc, /zodResolver/);
    assert.match(ruleFormSrc, /zodResolver/);
  });

  it("G — Modals isolate layout from table text alignment", () => {
    assert.match(templateFormSrc, /text-left/);
    assert.match(templateFormSrc, /max-h-\[85vh\]/);
    assert.match(ruleFormSrc, /text-left/);
    assert.match(ruleFormSrc, /max-h-\[85vh\]/);
  });
});
