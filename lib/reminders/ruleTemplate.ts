/**
 * Canonical reminder_templates resolution for rule-bound sends and eligibility.
 * Pure validation lives here; optional Supabase loaders are exported for send.ts.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase/index";

export type ReminderTemplateSnapshot = {
  id: string;
  workspace_id: string;
  subject: string;
  body: string;
  is_enabled: boolean | null;
};

export type ReminderRuleSnapshot = {
  id: string;
  workspace_id: string;
  template_id: string;
  is_enabled: boolean | null;
  trigger_type: string;
  offset_days: number;
};

export type RuleTemplateResolutionError =
  | "rule_not_found"
  | "rule_disabled"
  | "rule_workspace_mismatch"
  | "template_not_found"
  | "template_disabled"
  | "template_workspace_mismatch"
  | "caller_template_mismatch";

export type RuleTemplateResolution =
  | {
      ok: true;
      rule: ReminderRuleSnapshot;
      template: ReminderTemplateSnapshot;
      /** Always null — reminders.template_id FK targets message_templates, not reminder_templates. */
      logTemplateId: null;
      /** reminder_templates.id for audit/metadata only. */
      reminderTemplateId: string;
    }
  | {
      ok: false;
      reason: RuleTemplateResolutionError;
      message: string;
    };

export type ReminderTemplateEligibilityRow = {
  id: string;
  workspace_id: string;
  is_enabled: boolean | null;
};

/** Whether a joined reminder_templates row is eligible for rule-based contact. */
export function isUsableReminderTemplate(
  template: ReminderTemplateEligibilityRow | null | undefined
): template is ReminderTemplateEligibilityRow {
  if (!template) return false;
  if (template.is_enabled === false) return false;
  return true;
}

export function normalizeJoinedReminderTemplate<T extends ReminderTemplateEligibilityRow>(
  value: T | T[] | null | undefined
): T | null {
  if (Array.isArray(value)) {
    return value.length > 0 ? value[0] : null;
  }
  return value ?? null;
}

/** Rule is eligible for suggested reminders when its bound reminder_template exists and is enabled. */
export function ruleHasUsableReminderTemplate(
  rule: {
    template_id: string | null;
    reminder_template?:
      | ReminderTemplateEligibilityRow
      | ReminderTemplateEligibilityRow[]
      | null;
  },
  workspaceId: string
): boolean {
  if (!rule.template_id) return false;
  const joined = normalizeJoinedReminderTemplate(rule.reminder_template);
  if (joined) {
    return (
      joined.id === rule.template_id &&
      joined.workspace_id === workspaceId &&
      isUsableReminderTemplate(joined)
    );
  }
  return false;
}

/**
 * Pure rule-bound template resolution after rule + template rows are loaded.
 */
export function resolveRuleBoundTemplate(params: {
  workspaceId: string;
  rule: ReminderRuleSnapshot | null | undefined;
  template: ReminderTemplateSnapshot | null | undefined;
  callerTemplateId?: string | null;
  requireRuleEnabled?: boolean;
}): RuleTemplateResolution {
  const {
    workspaceId,
    rule,
    template,
    callerTemplateId,
    requireRuleEnabled = true,
  } = params;

  if (!rule) {
    return {
      ok: false,
      reason: "rule_not_found",
      message: "Reminder rule not found for this workspace.",
    };
  }

  if (rule.workspace_id !== workspaceId) {
    return {
      ok: false,
      reason: "rule_workspace_mismatch",
      message: "Reminder rule does not belong to this workspace.",
    };
  }

  if (requireRuleEnabled && rule.is_enabled === false) {
    return {
      ok: false,
      reason: "rule_disabled",
      message: "Reminder rule is disabled.",
    };
  }

  if (callerTemplateId && callerTemplateId !== rule.template_id) {
    return {
      ok: false,
      reason: "caller_template_mismatch",
      message:
        "Provided templateId does not match the template configured on the reminder rule.",
    };
  }

  if (!template || template.id !== rule.template_id) {
    return {
      ok: false,
      reason: "template_not_found",
      message: "Reminder template configured on the rule was not found.",
    };
  }

  if (template.workspace_id !== workspaceId) {
    return {
      ok: false,
      reason: "template_workspace_mismatch",
      message: "Reminder template does not belong to this workspace.",
    };
  }

  if (template.is_enabled === false) {
    return {
      ok: false,
      reason: "template_disabled",
      message: "Reminder template is disabled.",
    };
  }

  return {
    ok: true,
    rule,
    template,
    logTemplateId: null,
    reminderTemplateId: template.id,
  };
}

export type GenericManualTemplateResolution = {
  resolvedTemplateId: string | null;
  templateData: { subject: string; body: string } | null;
};


export async function resolveGenericManualTemplate(
  supabase: SupabaseClient<Database>,
  workspaceId: string,
  explicitTemplateId?: string | null
): Promise<GenericManualTemplateResolution> {
  let resolvedTemplateId: string | null = null;

  if (explicitTemplateId) {
    const { data: existingTemplate } = await supabase
      .from("message_templates")
      .select("id")
      .eq("id", explicitTemplateId)
      .eq("workspace_id", workspaceId)
      .maybeSingle();

    if (existingTemplate) {
      resolvedTemplateId = explicitTemplateId;
    }
  }

  if (!resolvedTemplateId) {
    const { data: templates } = await supabase
      .from("message_templates")
      .select("id, workspace_id, created_at")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(1);

    if (templates && templates.length > 0) {
      resolvedTemplateId = templates[0].id;
    }
  }

  if (!resolvedTemplateId) {
    try {
      const defaultSubject = "Payment Reminder";
      const defaultBody = `This is a reminder that invoice {{invoice_number}} for {{amount_due}} was due on {{due_date}}.\n\nPlease make payment at your earliest convenience.`;

      const { data: newTemplate, error: insertError } = await supabase
        .from("message_templates")
        .insert({
          workspace_id: workspaceId,
          name: "Default Reminder Template",
          subject: defaultSubject,
          body: defaultBody,
          channel: "email",
        })
        .select("id")
        .single();

      if (!insertError && newTemplate) {
        resolvedTemplateId = newTemplate.id;
      }
    } catch (createError) {
      console.error(
        "[resolveGenericManualTemplate] Failed to create default template:",
        createError
      );
    }
  }

  let templateData: { subject: string; body: string } | null = null;
  if (resolvedTemplateId) {
    const { data: template } = await supabase
      .from("message_templates")
      .select("id, subject, body")
      .eq("id", resolvedTemplateId)
      .single();

    if (template?.body && template.subject != null) {
      templateData = { subject: template.subject, body: template.body };
    }
  }

  return {
    resolvedTemplateId,
    templateData,
  };
}

/** Load rule + reminder_templates row and resolve for rule-based send. */
export async function fetchRuleBoundTemplate(
  supabase: SupabaseClient<Database>,
  workspaceId: string,
  ruleId: string,
  callerTemplateId?: string | null
): Promise<RuleTemplateResolution> {
  const { data: rule, error: ruleError } = await supabase
    .from("reminder_rules")
    .select("id, workspace_id, template_id, is_enabled, trigger_type, offset_days")
    .eq("id", ruleId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (ruleError) {
    console.error("[fetchRuleBoundTemplate] rule load error", ruleError);
    return {
      ok: false,
      reason: "rule_not_found",
      message: "Failed to load reminder rule.",
    };
  }

  if (!rule) {
    return resolveRuleBoundTemplate({
      workspaceId,
      rule: null,
      template: null,
      callerTemplateId,
    });
  }

  const { data: template, error: templateError } = await supabase
    .from("reminder_templates")
    .select("id, workspace_id, subject, body, is_enabled")
    .eq("id", rule.template_id)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (templateError) {
    console.error("[fetchRuleBoundTemplate] template load error", templateError);
    return {
      ok: false,
      reason: "template_not_found",
      message: "Failed to load reminder template.",
    };
  }

  return resolveRuleBoundTemplate({
    workspaceId,
    rule,
    template,
    callerTemplateId,
  });
}

/** Map resolution errors to send outcomes. */
export function ruleTemplateErrorOutcome(
  reason: RuleTemplateResolutionError
): "skipped" | "failed" {
  switch (reason) {
    case "rule_disabled":
    case "template_disabled":
      return "skipped";
    default:
      return "failed";
  }
}
