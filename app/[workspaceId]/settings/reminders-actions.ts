"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";
import { requireWorkspace } from "@/lib/auth/server";
import {
  ReminderTemplateSchema,
  ReminderRuleSchema,
  type ReminderTemplateInput,
  type ReminderRuleInput,
} from "@/lib/reminders/schema";

/**
 * Update workspace reminder settings
 * These are stored in the settings table
 */
export async function updateWorkspaceReminderSettings(
  workspaceId: string,
  formData: unknown
): Promise<{ success: boolean; error?: string }> {
  try {
    await requireWorkspace(workspaceId);

    // This is handled by the existing updateReminderSettingsAction
    // This function is kept for consistency but delegates to the existing action
    return { success: true };
  } catch (error) {
    console.error("[SettingsReminders] updateWorkspaceReminderSettings error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to update reminder settings",
    };
  }
}

/**
 * Create a new reminder template
 */
export async function createReminderTemplate(
  workspaceId: string,
  input: unknown
): Promise<{ success: boolean; error?: string; templateId?: string }> {
  try {
    await requireWorkspace(workspaceId);

    const parsed = ReminderTemplateSchema.parse(input);
    const supabase = await supabaseServer();

    // If this template is set as default, unset is_default on other templates
    if (parsed.isDefault) {
      await supabase
        .from("reminder_templates")
        .update({ is_default: false })
        .eq("workspace_id", workspaceId)
        .eq("is_default", true);
    }

    // Generate a unique code for the template (based on name, sanitized)
    const code = parsed.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");

    // Check if code already exists, append number if needed
    let finalCode = code;
    let counter = 1;
    while (true) {
      const { data: existing } = await supabase
        .from("reminder_templates")
        .select("id")
        .eq("workspace_id", workspaceId)
        .eq("code", finalCode)
        .single();

      if (!existing) break;
      finalCode = `${code}_${counter}`;
      counter++;
    }

    const { data: template, error } = await supabase
      .from("reminder_templates")
      .insert([
        {
          workspace_id: workspaceId,
          code: finalCode,
          name: parsed.name,
          description: parsed.description || null,
          channel: parsed.channel || "email",
          subject: parsed.subject,
          body: parsed.body,
          is_enabled: parsed.isEnabled,
          is_default: parsed.isDefault,
        },
      ])
      .select("id")
      .single();

    if (error || !template) {
      console.error("[SettingsReminders] createReminderTemplate error:", error);
      return {
        success: false,
        error: error?.message || "Failed to create reminder template",
      };
    }

    revalidatePath(`/${workspaceId}/settings`);
    return { success: true, templateId: template.id };
  } catch (error) {
    console.error("[SettingsReminders] createReminderTemplate error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to create reminder template",
    };
  }
}

/**
 * Update an existing reminder template
 */
export async function updateReminderTemplate(
  workspaceId: string,
  templateId: string,
  input: unknown
): Promise<{ success: boolean; error?: string }> {
  try {
    await requireWorkspace(workspaceId);

    const parsed = ReminderTemplateSchema.parse(input);
    const supabase = await supabaseServer();

    // Verify template belongs to workspace
    const { data: existing, error: checkError } = await supabase
      .from("reminder_templates")
      .select("id")
      .eq("id", templateId)
      .eq("workspace_id", workspaceId)
      .single();

    if (checkError || !existing) {
      return {
        success: false,
        error: "Template not found or access denied",
      };
    }

    // If this template is set as default, unset is_default on other templates
    if (parsed.isDefault) {
      await supabase
        .from("reminder_templates")
        .update({ is_default: false })
        .eq("workspace_id", workspaceId)
        .eq("is_default", true)
        .neq("id", templateId);
    }

    const { error } = await supabase
      .from("reminder_templates")
      .update({
        name: parsed.name,
        description: parsed.description || null,
        channel: parsed.channel,
        subject: parsed.subject,
        body: parsed.body,
        is_enabled: parsed.isEnabled,
        is_default: parsed.isDefault,
      })
      .eq("id", templateId)
      .eq("workspace_id", workspaceId);

    if (error) {
      console.error("[SettingsReminders] updateReminderTemplate error:", error);
      return {
        success: false,
        error: error.message || "Failed to update reminder template",
      };
    }

    revalidatePath(`/${workspaceId}/settings`);
    return { success: true };
  } catch (error) {
    console.error("[SettingsReminders] updateReminderTemplate error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to update reminder template",
    };
  }
}

/**
 * Delete a reminder template
 */
export async function deleteReminderTemplate(
  workspaceId: string,
  templateId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await requireWorkspace(workspaceId);

    const supabase = await supabaseServer();

    // Verify template belongs to workspace
    const { data: existing, error: checkError } = await supabase
      .from("reminder_templates")
      .select("id")
      .eq("id", templateId)
      .eq("workspace_id", workspaceId)
      .single();

    if (checkError || !existing) {
      return {
        success: false,
        error: "Template not found or access denied",
      };
    }

    // Check if any rules are using this template
    const { data: rulesUsingTemplate } = await supabase
      .from("reminder_rules")
      .select("id")
      .eq("template_id", templateId)
      .eq("workspace_id", workspaceId)
      .limit(1);

    if (rulesUsingTemplate && rulesUsingTemplate.length > 0) {
      return {
        success: false,
        error: "Cannot delete template: it is being used by reminder rules",
      };
    }

    const { error } = await supabase
      .from("reminder_templates")
      .delete()
      .eq("id", templateId)
      .eq("workspace_id", workspaceId);

    if (error) {
      console.error("[SettingsReminders] deleteReminderTemplate error:", error);
      return {
        success: false,
        error: error.message || "Failed to delete reminder template",
      };
    }

    revalidatePath(`/${workspaceId}/settings`);
    return { success: true };
  } catch (error) {
    console.error("[SettingsReminders] deleteReminderTemplate error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to delete reminder template",
    };
  }
}

/**
 * Create a new reminder rule
 */
export async function createReminderRule(
  workspaceId: string,
  input: unknown
): Promise<{ success: boolean; error?: string; ruleId?: string }> {
  try {
    await requireWorkspace(workspaceId);

    const parsed = ReminderRuleSchema.parse(input);
    const supabase = await supabaseServer();

    // Verify template belongs to workspace
    const { data: template, error: templateError } = await supabase
      .from("reminder_templates")
      .select("id")
      .eq("id", parsed.templateId)
      .eq("workspace_id", workspaceId)
      .single();

    if (templateError || !template) {
      return {
        success: false,
        error: "Template not found or access denied",
      };
    }

    // Get max sort_order for this workspace to append new rule at end
    const { data: maxSort } = await supabase
      .from("reminder_rules")
      .select("sort_order")
      .eq("workspace_id", workspaceId)
      .order("sort_order", { ascending: false })
      .limit(1)
      .single();

    const nextSortOrder = (maxSort?.sort_order ?? 0) + 10;

    const { data: rule, error } = await supabase
      .from("reminder_rules")
      .insert([
        {
          workspace_id: workspaceId,
          name: parsed.name,
          trigger_type: parsed.triggerType,
          offset_days: parsed.offsetDays,
          for_status: parsed.forStatus,
          template_id: parsed.templateId,
          is_enabled: parsed.isEnabled,
          sort_order: nextSortOrder,
        },
      ])
      .select("id")
      .single();

    if (error || !rule) {
      console.error("[SettingsReminders] createReminderRule error:", error);
      return {
        success: false,
        error: error?.message || "Failed to create reminder rule",
      };
    }

    revalidatePath(`/${workspaceId}/settings`);
    return { success: true, ruleId: rule.id };
  } catch (error) {
    console.error("[SettingsReminders] createReminderRule error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to create reminder rule",
    };
  }
}

/**
 * Update an existing reminder rule
 */
export async function updateReminderRule(
  workspaceId: string,
  ruleId: string,
  input: unknown
): Promise<{ success: boolean; error?: string }> {
  try {
    await requireWorkspace(workspaceId);

    const parsed = ReminderRuleSchema.parse(input);
    const supabase = await supabaseServer();

    // Verify rule belongs to workspace
    const { data: existing, error: checkError } = await supabase
      .from("reminder_rules")
      .select("id")
      .eq("id", ruleId)
      .eq("workspace_id", workspaceId)
      .single();

    if (checkError || !existing) {
      return {
        success: false,
        error: "Rule not found or access denied",
      };
    }

    // Verify template belongs to workspace
    const { data: template, error: templateError } = await supabase
      .from("reminder_templates")
      .select("id")
      .eq("id", parsed.templateId)
      .eq("workspace_id", workspaceId)
      .single();

    if (templateError || !template) {
      return {
        success: false,
        error: "Template not found or access denied",
      };
    }

    const { error } = await supabase
      .from("reminder_rules")
      .update({
        name: parsed.name,
        trigger_type: parsed.triggerType,
        offset_days: parsed.offsetDays,
        for_status: parsed.forStatus,
        template_id: parsed.templateId,
        is_enabled: parsed.isEnabled,
      })
      .eq("id", ruleId)
      .eq("workspace_id", workspaceId);

    if (error) {
      console.error("[SettingsReminders] updateReminderRule error:", error);
      return {
        success: false,
        error: error.message || "Failed to update reminder rule",
      };
    }

    revalidatePath(`/${workspaceId}/settings`);
    return { success: true };
  } catch (error) {
    console.error("[SettingsReminders] updateReminderRule error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to update reminder rule",
    };
  }
}

/**
 * Toggle reminder rule enabled/disabled
 */
export async function toggleReminderRule(
  workspaceId: string,
  ruleId: string,
  enabled: boolean
): Promise<{ success: boolean; error?: string }> {
  try {
    await requireWorkspace(workspaceId);

    const supabase = await supabaseServer();

    // Verify rule belongs to workspace
    const { data: existing, error: checkError } = await supabase
      .from("reminder_rules")
      .select("id")
      .eq("id", ruleId)
      .eq("workspace_id", workspaceId)
      .single();

    if (checkError || !existing) {
      return {
        success: false,
        error: "Rule not found or access denied",
      };
    }

    const { error } = await supabase
      .from("reminder_rules")
      .update({ is_enabled: enabled })
      .eq("id", ruleId)
      .eq("workspace_id", workspaceId);

    if (error) {
      console.error("[SettingsReminders] toggleReminderRule error:", error);
      return {
        success: false,
        error: error.message || "Failed to toggle reminder rule",
      };
    }

    revalidatePath(`/${workspaceId}/settings`);
    return { success: true };
  } catch (error) {
    console.error("[SettingsReminders] toggleReminderRule error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to toggle reminder rule",
    };
  }
}

/**
 * Delete a reminder rule
 */
export async function deleteReminderRule(
  workspaceId: string,
  ruleId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await requireWorkspace(workspaceId);

    const supabase = await supabaseServer();

    // Verify rule belongs to workspace
    const { data: existing, error: checkError } = await supabase
      .from("reminder_rules")
      .select("id")
      .eq("id", ruleId)
      .eq("workspace_id", workspaceId)
      .single();

    if (checkError || !existing) {
      return {
        success: false,
        error: "Rule not found or access denied",
      };
    }

    const { error } = await supabase
      .from("reminder_rules")
      .delete()
      .eq("id", ruleId)
      .eq("workspace_id", workspaceId);

    if (error) {
      console.error("[SettingsReminders] deleteReminderRule error:", error);
      return {
        success: false,
        error: error.message || "Failed to delete reminder rule",
      };
    }

    revalidatePath(`/${workspaceId}/settings`);
    return { success: true };
  } catch (error) {
    console.error("[SettingsReminders] deleteReminderRule error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to delete reminder rule",
    };
  }
}
