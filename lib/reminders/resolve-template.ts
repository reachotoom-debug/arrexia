"use server";

import { supabaseServer } from "@/lib/supabase/server";
import { Database } from "@/types/supabase/index";

type Db = Database["public"]["Tables"];
type InvoiceRow = Db["invoices"]["Row"];
type ReminderRuleRow = Db["reminder_rules"]["Row"];
type ReminderTemplateRow = Db["reminder_templates"]["Row"];
type TemplateForResolve = Pick<
  ReminderTemplateRow,
  "id" | "code" | "name" | "subject" | "body" | "is_enabled"
>;

export type ResolvedReminderTemplate = {
  template: {
    id: string;
    code: string;
    name: string;
    subject: string;
    body: string;
  };
  ruleId: string | null;
};

/**
 * Fallback: pick a template purely by code + daysFromDue if rules or template_id mappings are broken.
 */
async function fallbackTemplateByCode(
  workspaceId: string,
  daysFromDue: number
): Promise<ResolvedReminderTemplate> {
  const supabase = await supabaseServer();

  const { data, error } = await supabase
    .from("reminder_templates")
    .select("id, code, name, subject, body, is_enabled");
    // NOTE: no .eq("workspace_id", workspaceId) here on purpose in fallback

  if (error) {
    console.error("[fallbackTemplateByCode] templates error", {
      message: error instanceof Error ? error.message : String(error),
      code: typeof error === "object" && error !== null && "code" in error ? String(error.code) : undefined,
    });
    throw new Error("Failed to load reminder templates");
  }

  const templates: TemplateForResolve[] = (data ?? []) as unknown as TemplateForResolve[];

  if (!templates || templates.length === 0) {
    throw new Error("No reminder templates configured (global fallback is empty)");
  }

  console.log("[fallbackTemplateByCode] using templates", {
    count: templates.length,
    codes: templates.map((t) => t.code),
  });

  const byCode = (code: string) =>
    templates.find((t) => t.code === code) ?? null;

  let chosen: TemplateForResolve | null = null;

  if (daysFromDue < 0) {
    // Before due date → use PRE_DUE_FRIENDLY if exists
    chosen =
      byCode("PRE_DUE_FRIENDLY") ||
      byCode("ON_DUE") ||
      templates[0];
  } else if (daysFromDue === 0) {
    // On due date
    chosen =
      byCode("ON_DUE") ||
      byCode("OVERDUE_1") ||
      templates[0];
  } else {
    // Overdue
    if (daysFromDue <= 7) {
      chosen =
        byCode("OVERDUE_1") ||
        byCode("FINAL_NOTICE") ||
        templates[0];
    } else {
      chosen =
        byCode("FINAL_NOTICE") ||
        byCode("OVERDUE_1") ||
        templates[0];
    }
  }

  if (!chosen) {
    chosen = templates[0];
  }

  return {
    template: {
      id: chosen.id,
      code: chosen.code,
      name: chosen.name,
      subject: chosen.subject,
      body: chosen.body,
    },
    ruleId: null,
  };
}

export async function resolveReminderTemplateForInvoice(
  workspaceId: string,
  invoice: InvoiceRow,
  daysFromDue: number
): Promise<ResolvedReminderTemplate> {
  const supabase = await supabaseServer();

  // ---- 1) Load rules for this workspace
  const { data: rules, error: rulesError } = await supabase
    .from("reminder_rules")
    .select("id, template_id, trigger_type, offset_days, for_status, is_enabled")
    .eq("workspace_id", workspaceId)
    .eq("trigger_type", "relative_to_due_date");

  if (rulesError) {
    console.error("[resolveReminderTemplateForInvoice] rules error", {
      message: rulesError instanceof Error ? rulesError.message : String(rulesError),
      code: typeof rulesError === "object" && rulesError !== null && "code" in rulesError ? String(rulesError.code) : undefined,
    });
    // Fall back directly if rule query fails
    return fallbackTemplateByCode(workspaceId, daysFromDue);
  }

  if (!rules || rules.length === 0) {
    console.warn(
      "[resolveReminderTemplateForInvoice] no rules, falling back to code"
    );
    return fallbackTemplateByCode(workspaceId, daysFromDue);
  }

  // ---- 2) Collect template_ids from rules
  const templateIds = Array.from(
    new Set(
      rules
        .map((r) => r.template_id)
        .filter((id): id is string => !!id)
    )
  );

  if (templateIds.length === 0) {
    console.warn(
      "[resolveReminderTemplateForInvoice] rules have no template_ids, falling back to code"
    );
    return fallbackTemplateByCode(workspaceId, daysFromDue);
  }

  // ---- 3) Load templates by id (for this workspace)
  const { data: templates, error: templatesError } = await supabase
    .from("reminder_templates")
    .select("id, code, name, subject, body, is_enabled")
    .eq("workspace_id", workspaceId)
    .in("id", templateIds);

  if (templatesError) {
    console.error("[resolveReminderTemplateForInvoice] templates error", {
      message: templatesError instanceof Error ? templatesError.message : String(templatesError),
      code: typeof templatesError === "object" && templatesError !== null && "code" in templatesError ? String(templatesError.code) : undefined,
    });
    return fallbackTemplateByCode(workspaceId, daysFromDue);
  }

  if (!templates || templates.length === 0) {
    console.warn(
      "[resolveReminderTemplateForInvoice] no templates for rule template_ids, falling back to code"
    );
    return fallbackTemplateByCode(workspaceId, daysFromDue);
  }

  const templatesClean: TemplateForResolve[] = (templates ?? []) as unknown as TemplateForResolve[];
  const templateMap = new Map<string, TemplateForResolve>();
  for (const tpl of templatesClean) {
    templateMap.set(tpl.id, tpl);
  }

  // ---- 4) Filter rules to enabled + enabled templates + matching status
  const enabledRules = (rules as ReminderRuleRow[]).filter((rule) => {
    if (!rule.is_enabled) return false;

    const tpl = templateMap.get(rule.template_id);
    if (!tpl) return false;
    if (tpl.is_enabled === false) return false;

    if (rule.for_status && rule.for_status !== "any") {
      if (invoice.status && invoice.status !== rule.for_status) return false;
    }

    return true;
  });

  if (enabledRules.length === 0) {
    console.warn(
      "[resolveReminderTemplateForInvoice] no enabled rules/templates after filter, falling back to code"
    );
    return fallbackTemplateByCode(workspaceId, daysFromDue);
  }

  // ---- 5) Choose best rule based on daysFromDue
  let matched: ReminderRuleRow | null =
    enabledRules.find((r) => r.offset_days === daysFromDue) ?? null;

  if (!matched) {
    const sameSide = enabledRules.filter((r) => {
      if (daysFromDue > 0) return r.offset_days >= 0;
      if (daysFromDue < 0) return r.offset_days <= 0;
      return r.offset_days === 0;
    });

    if (sameSide.length > 0) {
      sameSide.sort(
        (a, b) =>
          Math.abs(daysFromDue - a.offset_days) -
          Math.abs(daysFromDue - b.offset_days)
      );
      matched = sameSide[0];
    }
  }

  if (!matched) {
    matched = enabledRules[0];
  }

  const tpl = matched.template_id ? templateMap.get(matched.template_id) : null;
  if (!tpl) {
    console.warn(
      "[resolveReminderTemplateForInvoice] matched rule has no template in map, falling back to code"
    );
    return fallbackTemplateByCode(workspaceId, daysFromDue);
  }

  return {
    template: {
      id: tpl.id,
      code: tpl.code,
      name: tpl.name,
      subject: tpl.subject,
      body: tpl.body,
    },
    ruleId: matched.id,
  };
}
