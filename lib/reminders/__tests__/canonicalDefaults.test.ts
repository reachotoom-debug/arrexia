import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  CANONICAL_REMINDER_STAGES,
  CANONICAL_TEMPLATE_CODES,
  getDefaultEnabledForPlan,
  isCanonicalTemplateCode,
  NO_REMINDER_TEMPLATES_MESSAGE,
  REMINDER_RULE_FOR_STATUS_UI_OPTIONS,
} from "../canonicalDefaults";

describe("canonical reminder defaults", () => {
  it("defines five canonical template codes", () => {
    assert.equal(CANONICAL_TEMPLATE_CODES.length, 5);
    assert.deepEqual([...CANONICAL_TEMPLATE_CODES], [
      "pre_due",
      "due_day",
      "plus_3",
      "plus_7",
      "final",
    ]);
  });

  it("maps stages to canonical trigger contract", () => {
    assert.deepEqual(
      CANONICAL_REMINDER_STAGES.map((s) => ({
        code: s.code,
        triggerType: s.triggerType,
        offsetDays: s.offsetDays,
        forStatus: s.forStatus,
      })),
      [
        { code: "pre_due", triggerType: "before_due", offsetDays: 3, forStatus: "sent" },
        { code: "due_day", triggerType: "on_due", offsetDays: 0, forStatus: "sent" },
        { code: "plus_3", triggerType: "after_due", offsetDays: 3, forStatus: "sent" },
        { code: "plus_7", triggerType: "after_due", offsetDays: 7, forStatus: "sent" },
        { code: "final", triggerType: "after_due", offsetDays: 14, forStatus: "sent" },
      ]
    );
  });

  it("Starter/free enable Automation Lite stages only (G)", () => {
    for (const code of CANONICAL_TEMPLATE_CODES) {
      const enabledStarter = getDefaultEnabledForPlan("starter", code);
      const enabledFree = getDefaultEnabledForPlan("free", code);
      const expected =
        code === "pre_due" || code === "due_day" || code === "plus_7";
      assert.equal(enabledStarter, expected, code);
      assert.equal(enabledFree, expected, code);
    }
  });

  it("Pro enables all canonical stages for newly created missing rules (H)", () => {
    for (const code of CANONICAL_TEMPLATE_CODES) {
      assert.equal(getDefaultEnabledForPlan("pro", code), true, code);
    }
  });

  it("Draft is not in user-facing status selector (N)", () => {
    const values = REMINDER_RULE_FOR_STATUS_UI_OPTIONS.map((o) => o.value);
    assert.ok(!values.includes("draft" as never));
    assert.deepEqual(values, ["any", "sent", "partially_paid", "overdue"]);
  });

  it("exposes understandable no-template copy (M)", () => {
    assert.match(NO_REMINDER_TEMPLATES_MESSAGE, /No reminder templates are available yet/i);
  });

  it("recognizes canonical template codes", () => {
    assert.equal(isCanonicalTemplateCode("pre_due"), true);
    assert.equal(isCanonicalTemplateCode("custom_code"), false);
  });
});
