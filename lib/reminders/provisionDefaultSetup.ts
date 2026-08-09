import { isWorkspacePlan, type WorkspacePlan } from "@/lib/billing/plans";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  CANONICAL_REMINDER_STAGES,
  getDefaultEnabledForPlan,
  isCanonicalTemplateCode,
  type CanonicalTemplateCode,
} from "./canonicalDefaults";

export type ProvisionAdmin = Pick<ReturnType<typeof supabaseAdmin>, "from">;

export type ProvisionDefaultReminderSetupResult = {
  ok: true;
  templatesCreated: number;
  templatesExisting: number;
  rulesCreated: number;
  rulesExisting: number;
};

type TemplateRow = {
  id: string;
  workspace_id: string;
  code: string;
};

type RuleRow = {
  id: string;
  workspace_id: string;
  template_id: string;
  is_enabled: boolean | null;
  trigger_type: string;
  offset_days: number;
  for_status: string;
};

function reminderRuleScheduleKey(rule: {
  trigger_type: string;
  offset_days: number;
  for_status: string;
}): string {
  return `${rule.trigger_type}:${rule.offset_days}:${rule.for_status}`;
}

export async function provisionDefaultReminderSetup(params: {
  workspaceId: string;
  plan: WorkspacePlan;
  standaloneTrial?: boolean;
  admin?: ProvisionAdmin;
}): Promise<ProvisionDefaultReminderSetupResult> {
  const { workspaceId, plan } = params;
  const standaloneTrial = params.standaloneTrial === true;
  const admin = params.admin ?? supabaseAdmin();

  let templatesCreated = 0;
  let templatesExisting = 0;
  let rulesCreated = 0;
  let rulesExisting = 0;

  const { data: existingTemplates, error: templatesError } = await admin
    .from("reminder_templates")
    .select("id, workspace_id, code")
    .eq("workspace_id", workspaceId);

  if (templatesError) {
    throw new Error(
      `Failed to load reminder templates: ${templatesError.message}`
    );
  }

  const templatesByCode = new Map<string, TemplateRow>();
  for (const row of (existingTemplates ?? []) as TemplateRow[]) {
    templatesByCode.set(row.code, row);
  }

  for (const stage of CANONICAL_REMINDER_STAGES) {
    if (templatesByCode.has(stage.code)) {
      templatesExisting += 1;
      continue;
    }

    const { data: inserted, error: insertError } = await admin
      .from("reminder_templates")
      .insert({
        workspace_id: workspaceId,
        code: stage.code,
        name: stage.templateName,
        subject: stage.subject,
        body: stage.body,
        is_enabled: true,
        sort_order: stage.sortOrder,
        channel: "email",
      })
      .select("id, workspace_id, code")
      .maybeSingle();

    if (insertError?.code === "23505") {
      const { data: raced, error: racedError } = await admin
        .from("reminder_templates")
        .select("id, workspace_id, code")
        .eq("workspace_id", workspaceId)
        .eq("code", stage.code)
        .maybeSingle();

      if (racedError) {
        throw new Error(
          `Failed to resolve reminder template race for ${stage.code}: ${racedError.message}`
        );
      }

      if (raced) {
        templatesByCode.set(stage.code, raced as TemplateRow);
        templatesExisting += 1;
        continue;
      }
    }

    if (insertError) {
      throw new Error(
        `Failed to create reminder template ${stage.code}: ${insertError.message}`
      );
    }

    if (!inserted?.id) {
      throw new Error(`Reminder template insert returned no id for ${stage.code}`);
    }

    templatesByCode.set(stage.code, inserted as TemplateRow);
    templatesCreated += 1;
  }

  const { data: existingRules, error: rulesError } = await admin
    .from("reminder_rules")
    .select("id, workspace_id, template_id, is_enabled, trigger_type, offset_days, for_status")
    .eq("workspace_id", workspaceId);

  if (rulesError) {
    throw new Error(`Failed to load reminder rules: ${rulesError.message}`);
  }

  const rulesByTemplateId = new Map<string, RuleRow>();
  const existingScheduleKeys = new Set<string>();
  for (const row of (existingRules ?? []) as RuleRow[]) {
    if (!rulesByTemplateId.has(row.template_id)) {
      rulesByTemplateId.set(row.template_id, row);
    }
    existingScheduleKeys.add(reminderRuleScheduleKey(row));
  }

  for (const stage of CANONICAL_REMINDER_STAGES) {
    const template = templatesByCode.get(stage.code);
    if (!template) {
      throw new Error(`Canonical template missing after provision: ${stage.code}`);
    }

    const scheduleKey = reminderRuleScheduleKey({
      trigger_type: stage.triggerType,
      offset_days: stage.offsetDays,
      for_status: stage.forStatus,
    });

    if (existingScheduleKeys.has(scheduleKey)) {
      rulesExisting += 1;
      continue;
    }

    const existingRule = rulesByTemplateId.get(template.id);
    if (existingRule) {
      rulesExisting += 1;
      existingScheduleKeys.add(scheduleKey);
      continue;
    }

    const { data: insertedRule, error: ruleInsertError } = await admin
      .from("reminder_rules")
      .insert({
        workspace_id: workspaceId,
        template_id: template.id,
        name: stage.ruleName,
        trigger_type: stage.triggerType,
        offset_days: stage.offsetDays,
        for_status: stage.forStatus,
        is_enabled: getDefaultEnabledForPlan(plan, stage.code, { standaloneTrial }),
        sort_order: stage.sortOrder,
      })
      .select("id, workspace_id, template_id, is_enabled, trigger_type, offset_days, for_status")
      .maybeSingle();

    if (ruleInsertError?.code === "23505") {
      const { data: racedRule, error: racedError } = await admin
        .from("reminder_rules")
        .select("id, workspace_id, template_id, is_enabled, trigger_type, offset_days, for_status")
        .eq("workspace_id", workspaceId)
        .eq("trigger_type", stage.triggerType)
        .eq("offset_days", stage.offsetDays)
        .eq("for_status", stage.forStatus)
        .maybeSingle();

      if (racedError) {
        throw new Error(
          `Failed to resolve reminder rule race for ${stage.code}: ${racedError.message}`
        );
      }

      if (racedRule) {
        rulesByTemplateId.set(template.id, racedRule as RuleRow);
        existingScheduleKeys.add(scheduleKey);
        rulesExisting += 1;
        continue;
      }
    }

    if (ruleInsertError) {
      throw new Error(
        `Failed to create reminder rule for ${stage.code}: ${ruleInsertError.message}`
      );
    }

    if (!insertedRule?.id) {
      throw new Error(`Reminder rule insert returned no id for ${stage.code}`);
    }

    rulesByTemplateId.set(template.id, insertedRule as RuleRow);
    existingScheduleKeys.add(scheduleKey);
    rulesCreated += 1;
  }

  return {
    ok: true,
    templatesCreated,
    templatesExisting,
    rulesCreated,
    rulesExisting,
  };
}

/**
 * Non-fatal wrapper for bootstrap — workspace creation must not fail if
 * reminder provisioning fails (settings insert uses the same best-effort pattern).
 */
export async function provisionDefaultReminderSetupSafe(params: {
  workspaceId: string;
  plan: WorkspacePlan;
  standaloneTrial?: boolean;
  admin?: ProvisionAdmin;
}): Promise<ProvisionDefaultReminderSetupResult | null> {
  try {
    return await provisionDefaultReminderSetup(params);
  } catch (error) {
    console.error("[provisionDefaultReminderSetup]", {
      workspaceId: params.workspaceId,
      plan: params.plan,
      error,
    });
    return null;
  }
}

export async function resolveWorkspacePlanForProvisioning(
  admin: ProvisionAdmin,
  workspaceId: string
): Promise<WorkspacePlan> {
  const { data, error } = await admin
    .from("workspace_plans")
    .select("plan")
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load workspace plan: ${error.message}`);
  }

  if (isWorkspacePlan(data?.plan)) {
    return data.plan;
  }

  return "free";
}

/** Returns canonical template codes present on rules for a workspace (for tests/diagnostics). */
export function summarizeCanonicalRuleBindings(
  templates: Array<{ id: string; code: string; workspace_id: string }>,
  rules: Array<{ template_id: string; workspace_id: string }>,
  workspaceId: string
): CanonicalTemplateCode[] {
  const templateCodeById = new Map<string, CanonicalTemplateCode>();
  for (const template of templates) {
    if (template.workspace_id !== workspaceId) continue;
    if (isCanonicalTemplateCode(template.code)) {
      templateCodeById.set(template.id, template.code);
    }
  }

  const bound: CanonicalTemplateCode[] = [];
  for (const rule of rules) {
    const code = templateCodeById.get(rule.template_id);
    if (code && rule.workspace_id === workspaceId) {
      bound.push(code);
    }
  }

  return bound.sort();
}
