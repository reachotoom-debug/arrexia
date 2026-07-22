import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  isUsableReminderTemplate,
  resolveGenericManualTemplate,
  resolveRuleBoundTemplate,
  ruleHasUsableReminderTemplate,
  ruleTemplateErrorOutcome,
  type ReminderRuleSnapshot,
  type ReminderTemplateSnapshot,
} from "../ruleTemplate";

const WORKSPACE_A = "ws-a";
const WORKSPACE_B = "ws-b";

const RULE: ReminderRuleSnapshot = {
  id: "rule-1",
  workspace_id: WORKSPACE_A,
  template_id: "tpl-1",
  is_enabled: true,
  trigger_type: "on_due",
  offset_days: 0,
};

const TEMPLATE: ReminderTemplateSnapshot = {
  id: "tpl-1",
  workspace_id: WORKSPACE_A,
  subject: "Rule subject {{invoice_number}}",
  body: "Rule body for {{client_name}}",
  is_enabled: true,
};

describe("resolveRuleBoundTemplate", () => {
  it("resolves reminder_templates content for a valid rule", () => {
    const result = resolveRuleBoundTemplate({
      workspaceId: WORKSPACE_A,
      rule: RULE,
      template: TEMPLATE,
      callerTemplateId: "tpl-1",
    });

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.template.subject, "Rule subject {{invoice_number}}");
    assert.equal(result.template.body, "Rule body for {{client_name}}");
    assert.equal(result.reminderTemplateId, "tpl-1");
  });

  it("does not send when reminder_template is disabled", () => {
    const result = resolveRuleBoundTemplate({
      workspaceId: WORKSPACE_A,
      rule: RULE,
      template: { ...TEMPLATE, is_enabled: false },
    });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.reason, "template_disabled");
    assert.equal(ruleTemplateErrorOutcome(result.reason), "skipped");
  });

  it("does not fall back when reminder_template is missing", () => {
    const result = resolveRuleBoundTemplate({
      workspaceId: WORKSPACE_A,
      rule: RULE,
      template: null,
    });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.reason, "template_not_found");
  });

  it("rejects mismatched caller templateId in favor of the rule relationship", () => {
    const result = resolveRuleBoundTemplate({
      workspaceId: WORKSPACE_A,
      rule: RULE,
      template: TEMPLATE,
      callerTemplateId: "other-template-id",
    });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.reason, "caller_template_mismatch");
  });

  it("logs template_id as null to avoid message_templates FK violations", () => {
    const result = resolveRuleBoundTemplate({
      workspaceId: WORKSPACE_A,
      rule: RULE,
      template: TEMPLATE,
    });

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.logTemplateId, null);
    assert.equal(result.reminderTemplateId, "tpl-1");
  });

  it("rejects cross-workspace rule", () => {
    const result = resolveRuleBoundTemplate({
      workspaceId: WORKSPACE_A,
      rule: { ...RULE, workspace_id: WORKSPACE_B },
      template: TEMPLATE,
    });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.reason, "rule_workspace_mismatch");
  });

  it("rejects cross-workspace template", () => {
    const result = resolveRuleBoundTemplate({
      workspaceId: WORKSPACE_A,
      rule: RULE,
      template: { ...TEMPLATE, workspace_id: WORKSPACE_B },
    });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.reason, "template_workspace_mismatch");
  });

  it("preserves rule identity on successful resolution (ruleId carried separately by send)", () => {
    const result = resolveRuleBoundTemplate({
      workspaceId: WORKSPACE_A,
      rule: RULE,
      template: TEMPLATE,
    });

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.rule.id, "rule-1");
    assert.equal(result.rule.template_id, "tpl-1");
  });
});

describe("ruleHasUsableReminderTemplate", () => {
  it("requires joined template to match rule template_id and workspace", () => {
    assert.equal(
      ruleHasUsableReminderTemplate(
        {
          template_id: "tpl-1",
          reminder_template: {
            id: "tpl-1",
            workspace_id: WORKSPACE_A,
            is_enabled: true,
          },
        },
        WORKSPACE_A
      ),
      true
    );
    assert.equal(isUsableReminderTemplate({ id: "tpl-1", workspace_id: WORKSPACE_A, is_enabled: false }), false);
  });
});

describe("resolveGenericManualTemplate", () => {
  it("uses explicit message_templates id when provided for generic manual send", async () => {
    const calls: string[] = [];
    const supabase = {
      from(table: string) {
        calls.push(table);
        return {
          select() {
            return this;
          },
          eq() {
            return this;
          },
          maybeSingle: async () => ({
            data: { id: "msg-tpl-1" },
            error: null,
          }),
          order() {
            return this;
          },
          limit() {
            return this;
          },
          single: async () => ({
            data: {
              id: "msg-tpl-1",
              subject: "Manual subject",
              body: "Manual body",
            },
            error: null,
          }),
          insert() {
            return this;
          },
        };
      },
    };

    const result = await resolveGenericManualTemplate(
      supabase as never,
      WORKSPACE_A,
      "msg-tpl-1"
    );

    assert.equal(result.resolvedTemplateId, "msg-tpl-1");
    assert.deepEqual(result.templateData, {
      subject: "Manual subject",
      body: "Manual body",
    });
    assert.ok(calls.includes("message_templates"));
  });
});
