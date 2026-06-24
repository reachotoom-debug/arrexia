"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";
import { requireWorkspace, requireUser } from "@/lib/auth/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { ZodError } from "zod";
import {
  workspaceProfileSchema,
  emailSettingsSchema,
  reminderSettingsSchema,
  paymentSettingsSchema,
} from "@/lib/schemas/settings";
import {
  ReminderTemplateSchema,
  ReminderRuleSchema,
} from "@/lib/reminders/schema";
import { MAX_AVATAR_FILE_SIZE_BYTES, ALLOWED_AVATAR_MIME_TYPES, DEFAULT_AVATAR_URL } from "@/lib/constants";
import {
  getPlanStorageLimits,
  isWorkspacePlan,
  type WorkspacePlan,
} from "@/lib/billing/plans";
import { sendEmail } from "@/lib/email/sendEmail";

/**
 * Save workspace profile settings
 */
export async function saveWorkspaceProfile(
  workspaceId: string,
  values: unknown
): Promise<{ success: boolean; error?: string }> {
  try {
    await requireWorkspace(workspaceId);

    const parsed = workspaceProfileSchema.parse(values);
    const supabase = await supabaseServer();

    // Normalize logoUrl to string; ignore any non-string.
    // The client-side upload component already handles file uploads and passes only URL strings.
    const logoUrlValue = typeof parsed.logoUrl === "string" 
      ? (parsed.logoUrl.trim() === "" ? null : parsed.logoUrl)
      : null;

    // Build update payload for settings table with workspace profile fields
    const settingsUpdate: Record<string, unknown> = {
      workspace_id: workspaceId,
      workspace_display_name: parsed.name || null,
      workspace_logo_url: logoUrlValue,
      business_email: parsed.email || null,
      business_phone: parsed.phone || null,
      business_website: parsed.website || null,
      business_country: parsed.country || null,
      business_tax_number: parsed.taxNumber || null,
      business_address_line1: parsed.addressLine1 || null,
      business_address_line2: parsed.addressLine2 || null,
      business_city: parsed.city || null,
      business_state: parsed.state || null,
      business_postal_code: parsed.postalCode || null,
      timezone: parsed.timezone || null,
      // Keep logo_url for backward compatibility
      logo_url: logoUrlValue,
    };

    // Update settings table
    const { error: settingsError } = await supabase
      .from("settings")
      .upsert(settingsUpdate, {
        onConflict: "workspace_id",
      });

    if (settingsError) {
      console.error("[Settings] saveWorkspaceProfile settings error", settingsError);
      return { success: false, error: settingsError.message || "Failed to update workspace profile" };
    }

    // Also update workspaces table name for consistency (if it exists)
    const { error: workspaceError } = await supabase
      .from("workspaces")
      .update({
        name: parsed.name,
        profile_image_url: logoUrlValue,
      })
      .eq("id", workspaceId);

    if (workspaceError) {
      // Log but don't fail - workspace table might not have all fields
      console.warn("[Settings] saveWorkspaceProfile workspace update warning", workspaceError);
    }

    revalidatePath(`/${workspaceId}/settings`);
    return { success: true };
  } catch (error) {
    console.error("[Settings] saveWorkspaceProfile error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to save workspace profile",
    };
  }
}

/**
 * Save email & sending settings
 */
function normalizeEmailSettingsInput(values: unknown): unknown {
  if (!values || typeof values !== "object") {
    return values;
  }

  const input = values as Record<string, unknown>;
  const smtpPort = input.smtpPort;

  return {
    ...input,
    smtpPort:
      smtpPort === null || smtpPort === undefined || smtpPort === ""
        ? ""
        : smtpPort,
  };
}

function formatEmailSettingsError(error: unknown): string {
  if (error instanceof ZodError) {
    const messages = error.issues.map((issue) => issue.message).filter(Boolean);
    return messages.join(". ") || "Invalid email settings";
  }

  return error instanceof Error ? error.message : "Failed to save email settings";
}

export async function saveEmailSettings(
  workspaceId: string,
  values: unknown
): Promise<{ success: boolean; error?: string }> {
  try {
    await requireWorkspace(workspaceId);

    const parsed = emailSettingsSchema.parse(normalizeEmailSettingsInput(values));
    const supabase = await supabaseServer();

    // Update settings table with email_provider and from_name/from_email
    const settingsUpdate: any = {
      workspace_id: workspaceId,
      email_provider: parsed.provider,
      from_name: parsed.fromName || null,
      from_email: parsed.fromEmail || null,
    };

    const { error: settingsError } = await supabase
      .from("settings")
      .upsert(settingsUpdate, {
        onConflict: "workspace_id",
      });

    if (settingsError) {
      console.error("[Settings] saveEmailSettings settings error", settingsError);
      return { success: false, error: "Failed to update email settings" };
    }

    const { data: existing } = await supabase
      .from("workspace_email_settings")
      .select("smtp_password, smtp_host, smtp_port, smtp_username, use_tls")
      .eq("workspace_id", workspaceId)
      .maybeSingle();

    const emailSettingsUpdate: Record<string, unknown> = {
      workspace_id: workspaceId,
      from_name: parsed.fromName || null,
      from_email: parsed.fromEmail || null,
    };

    if (parsed.provider === "smtp") {
      emailSettingsUpdate.smtp_host = parsed.smtpHost || null;
      emailSettingsUpdate.smtp_port = parsed.smtpPort || null;
      emailSettingsUpdate.smtp_username = parsed.smtpUser || null;
      emailSettingsUpdate.use_tls = parsed.smtpUseTls ?? true;
      if (parsed.smtpPassword) {
        emailSettingsUpdate.smtp_password = parsed.smtpPassword;
      } else if (existing?.smtp_password) {
        emailSettingsUpdate.smtp_password = existing.smtp_password;
      }
    } else if (existing) {
      if (existing.smtp_host) emailSettingsUpdate.smtp_host = existing.smtp_host;
      if (existing.smtp_port) emailSettingsUpdate.smtp_port = existing.smtp_port;
      if (existing.smtp_username) emailSettingsUpdate.smtp_username = existing.smtp_username;
      if (existing.smtp_password) emailSettingsUpdate.smtp_password = existing.smtp_password;
      if (existing.use_tls !== null && existing.use_tls !== undefined) {
        emailSettingsUpdate.use_tls = existing.use_tls;
      }
    }

    const { error: emailSettingsError } = await supabase
      .from("workspace_email_settings")
      .upsert(emailSettingsUpdate, {
        onConflict: "workspace_id",
      });

    if (emailSettingsError) {
      console.error("[Settings] saveEmailSettings emailSettings error", emailSettingsError);
      return { success: false, error: "Failed to update email settings" };
    }

    revalidatePath(`/${workspaceId}/settings`);
    return { success: true };
  } catch (error) {
    console.error("[Settings] saveEmailSettings error:", error);
    return {
      success: false,
      error: formatEmailSettingsError(error),
    };
  }
}

/**
 * Send a test email using the workspace email settings
 */
export async function testEmailSettings(
  workspaceId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { user } = await requireWorkspace(workspaceId);

    if (!user.email) {
      return {
        success: false,
        error: "Your account has no email address.",
      };
    }

    const supabase = await supabaseServer();

    const { data: settings } = await supabase
      .from("settings")
      .select("from_name, from_email")
      .eq("workspace_id", workspaceId)
      .maybeSingle();

    const { data: emailSettings } = await supabase
      .from("workspace_email_settings")
      .select("from_name, from_email")
      .eq("workspace_id", workspaceId)
      .maybeSingle();

    const fromName =
      emailSettings?.from_name || settings?.from_name || "FlowCollect";
    const fromEmail = emailSettings?.from_email || settings?.from_email || null;

    const result = await sendEmail({
      to: user.email,
      subject: "FlowCollect email test",
      text: "Email delivery is configured for this workspace.",
      html: "<p>Email delivery is configured for this workspace.</p>",
      fromName,
      fromEmail,
    });

    if (!result.success) {
      return {
        success: false,
        error: result.error || "Failed to send test email",
      };
    }

    return { success: true };
  } catch (error) {
    console.error("[Settings] testEmailSettings error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to send test email",
    };
  }
}

export async function setWorkspacePlanAction(formData: FormData) {
  const workspaceId = String(formData.get("workspaceId") || "");
  const plan = String(formData.get("plan") || "");

  if (!workspaceId) {
    return { ok: false, error: "Missing workspaceId" };
  }
  if (!isWorkspacePlan(plan)) {
    return { ok: false, error: "Invalid plan" };
  }

  try {
    const { user } = await requireUser();

    const admin = supabaseAdmin();
    const limits = getPlanStorageLimits(plan);

    const { error } = await admin
      .from("workspace_plans")
      .upsert(
        {
          workspace_id: workspaceId,
          plan: plan as WorkspacePlan,
          ...limits,
        },
        { onConflict: "workspace_id" }
      );

    if (error) {
      console.error("[setWorkspacePlanAction] Supabase error:", error);
      return { ok: false, error: error.message };
    }

    revalidatePath(`/${workspaceId}/settings`);
    return { ok: true };
  } catch (error: any) {
    const digest = String(error?.digest || "");
    if (digest.includes("NEXT_REDIRECT")) throw error;
    console.error("[setWorkspacePlanAction] Unexpected error:", error);
    return { ok: false, error: error?.message || "Failed to update plan" };
  }
}

/**
 * Save reminder settings
 */
export async function saveReminderSettings(
  workspaceId: string,
  values: unknown
): Promise<{ success: boolean; error?: string }> {
  try {
    await requireWorkspace(workspaceId);

    const parsed = reminderSettingsSchema.parse(values);
    const supabase = await supabaseServer();

    // Normalize channel
    const normalizedChannel = parsed.defaultChannel === "whatsapp" ? "whatsapp" : "email";

    const updateData: any = {
      workspace_id: workspaceId,
      auto_send_reminders: parsed.enableAutomatic,
      reminder_after_days: parsed.afterDueDays,
      reminder_before_days: parsed.beforeDueDays,
      reminder_channel: normalizedChannel,
    };

    const { error } = await supabase.from("settings").upsert(updateData, {
      onConflict: "workspace_id",
    });

    if (error) {
      console.error("[Settings] saveReminderSettings error", error);
      return { success: false, error: "Failed to update reminder settings" };
    }

    revalidatePath(`/${workspaceId}/settings`);
    return { success: true };
  } catch (error) {
    console.error("[Settings] saveReminderSettings error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to save reminder settings",
    };
  }
}

/**
 * Save payment & defaults settings
 */
export async function savePaymentSettings(
  workspaceId: string,
  values: unknown
): Promise<{ success: boolean; error?: string }> {
  try {
    await requireWorkspace(workspaceId);

    const parsed = paymentSettingsSchema.parse(values);
    const supabase = await supabaseServer();

    // Helper to normalize empty strings to null for DB
    const toNullable = (value: string | null | undefined) =>
      value && value.trim().length > 0 ? value.trim() : null;

    const payload = {
      workspace_id: workspaceId,

      default_currency: parsed.defaultCurrency,

      // Logo – use the correct DB column
      workspace_logo_url: toNullable(parsed.brandingLogoUrl ?? null),

      // Branding section
      workspace_display_name: toNullable(parsed.workspaceDisplayName ?? null),
      branding_business_legal_name: toNullable(parsed.brandingBusinessLegalName ?? null),
      branding_business_address: toNullable(parsed.brandingBusinessAddress ?? null),
      branding_tax_id: toNullable(parsed.brandingTaxId ?? null),

      // Business contact – use existing DB columns (NOT branding_ prefixed)
      business_email: toNullable(parsed.businessEmail ?? null),
      business_phone: toNullable(parsed.brandingBusinessPhone ?? null),
      business_website: toNullable(parsed.brandingWebsite ?? null),

      // Payment details
      payment_bank_name: toNullable(parsed.paymentBankName ?? null),
      payment_bank_account_name: toNullable(parsed.paymentBankAccountName ?? null),
      payment_bank_account_number: toNullable(parsed.paymentBankAccountNumber ?? null),
      payment_bank_swift: toNullable(parsed.paymentBankSwift ?? null),
      payment_bank_iban: toNullable(parsed.paymentBankIban ?? null),
      payment_paypal_handle: toNullable(parsed.paymentPaypalHandle ?? null),
      payment_stripe_descriptor: toNullable(parsed.paymentStripeDescriptor ?? null),
      payment_other_instructions: toNullable(parsed.paymentOtherInstructions ?? null),

      // Invoice thank-you note
      invoice_thank_you_note: toNullable(parsed.invoiceThankYouNote ?? null),
    };

    // DEBUG: Log payload keys to verify no invalid columns are being sent
    console.log("[Settings] savePaymentSettings payload keys:", Object.keys(payload));

    const { error } = await supabase
      .from("settings")
      .upsert(payload, { onConflict: "workspace_id" });

    if (error) {
      console.error("[Settings] savePaymentSettings error", error);
      return { success: false, error: "Failed to update payment settings" };
    }

    revalidatePath(`/${workspaceId}/settings`);
    return { success: true };
  } catch (error) {
    // Handle Zod validation errors with a user-friendly message
    if (error instanceof ZodError) {
      const issues = error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
      console.error("[Settings] savePaymentSettings validation error", error.issues);
      return { success: false, error: `Validation failed: ${issues}` };
    }
    console.error("[Settings] savePaymentSettings error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to save payment settings",
    };
  }
}

/**
 * Create a new reminder template
 */
export async function createReminderTemplate(
  workspaceId: string,
  values: unknown
): Promise<{ success: boolean; error?: string }> {
  try {
    await requireWorkspace(workspaceId);

    const parsed = ReminderTemplateSchema.parse(values);
    const supabase = await supabaseServer();

    // If this template is set as default, unset is_default on other templates with same channel
    if (parsed.isDefault) {
      await supabase
        .from("reminder_templates")
        .update({ is_default: false })
        .eq("workspace_id", workspaceId)
        .eq("channel", parsed.channel || "email")
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
    return { success: true };
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
  id: string,
  values: unknown
): Promise<{ success: boolean; error?: string }> {
  try {
    await requireWorkspace(workspaceId);

    const parsed = ReminderTemplateSchema.parse(values);
    const supabase = await supabaseServer();

    // Verify template belongs to workspace
    const { data: existing, error: checkError } = await supabase
      .from("reminder_templates")
      .select("id, channel")
      .eq("id", id)
      .eq("workspace_id", workspaceId)
      .single();

    if (checkError || !existing) {
      return {
        success: false,
        error: "Template not found or access denied",
      };
    }

    // If this template is set as default, unset is_default on other templates with same channel
    if (parsed.isDefault) {
      await supabase
        .from("reminder_templates")
        .update({ is_default: false })
        .eq("workspace_id", workspaceId)
        .eq("channel", parsed.channel || "email")
        .eq("is_default", true)
        .neq("id", id);
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
      .eq("id", id)
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
  id: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await requireWorkspace(workspaceId);

    const supabase = await supabaseServer();

    // Verify template belongs to workspace
    const { data: existing, error: checkError } = await supabase
      .from("reminder_templates")
      .select("id")
      .eq("id", id)
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
      .eq("template_id", id)
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
      .eq("id", id)
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
  values: unknown
): Promise<{ success: boolean; error?: string }> {
  try {
    await requireWorkspace(workspaceId);

    const parsed = ReminderRuleSchema.parse(values);
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
    return { success: true };
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
  id: string,
  values: unknown
): Promise<{ success: boolean; error?: string }> {
  try {
    await requireWorkspace(workspaceId);

    const parsed = ReminderRuleSchema.parse(values);
    const supabase = await supabaseServer();

    // Verify rule belongs to workspace
    const { data: existing, error: checkError } = await supabase
      .from("reminder_rules")
      .select("id")
      .eq("id", id)
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
      .eq("id", id)
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
export async function toggleReminderRuleEnabled(
  workspaceId: string,
  id: string,
  enabled: boolean
): Promise<{ success: boolean; error?: string }> {
  try {
    await requireWorkspace(workspaceId);

    const supabase = await supabaseServer();

    // Verify rule belongs to workspace
    const { data: existing, error: checkError } = await supabase
      .from("reminder_rules")
      .select("id")
      .eq("id", id)
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
      .eq("id", id)
      .eq("workspace_id", workspaceId);

    if (error) {
      console.error("[SettingsReminders] toggleReminderRuleEnabled error:", error);
      return {
        success: false,
        error: error.message || "Failed to toggle reminder rule",
      };
    }

    revalidatePath(`/${workspaceId}/settings`);
    return { success: true };
  } catch (error) {
    console.error("[SettingsReminders] toggleReminderRuleEnabled error:", error);
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
  id: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await requireWorkspace(workspaceId);

    const supabase = await supabaseServer();

    // Verify rule belongs to workspace
    const { data: existing, error: checkError } = await supabase
      .from("reminder_rules")
      .select("id")
      .eq("id", id)
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
      .eq("id", id)
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

// Legacy FormData-based actions for backward compatibility
export async function updateWorkspaceProfileAction(formData: FormData) {
  const workspaceId = formData.get("workspaceId") as string;
  if (!workspaceId) {
    return { ok: false, error: "Workspace ID is required" };
  }

  const input = {
    name: formData.get("name") as string,
    logoUrl: (formData.get("logo_url") as string) || "",
    phone: (formData.get("phone") as string) || "",
    country: (formData.get("country") as string) || "",
    taxNumber: (formData.get("tax_number") as string) || "",
    timezone: (formData.get("timezone") as string) || "",
  };

  const result = await saveWorkspaceProfile(workspaceId, input);
  return { ok: result.success, error: result.error };
}

export async function updateEmailSettingsAction(formData: FormData) {
  const workspaceId = formData.get("workspaceId") as string;
  if (!workspaceId) {
    return { ok: false, error: "Workspace ID is required" };
  }

  const input = {
    provider: formData.get("email_provider") as "resend" | "smtp",
    fromName: formData.get("from_name") as string,
    fromEmail: formData.get("from_email") as string,
    smtpHost: (formData.get("smtp_host") as string) || "",
    smtpPort: (formData.get("smtp_port") as string) || "",
    smtpUser: (formData.get("smtp_username") as string) || "",
    smtpPassword: (formData.get("smtp_password") as string) || "",
    smtpUseTls: formData.get("use_tls") === "true",
  };

  const result = await saveEmailSettings(workspaceId, input);
  return { ok: result.success, error: result.error };
}

export async function updateReminderSettingsAction(formData: FormData) {
  const workspaceId = formData.get("workspaceId") as string;
  if (!workspaceId) {
    return { ok: false, error: "Workspace ID is required" };
  }

  const rawChannel = formData.get("reminder_channel") as string | null;
  const normalizedChannel = rawChannel === "whatsapp" ? "whatsapp" : "email";

  const input = {
    enableAutomatic: formData.get("auto_send_reminders") === "true",
    afterDueDays: formData.get("reminder_after_days")
      ? parseInt(formData.get("reminder_after_days") as string, 10)
      : 7,
    beforeDueDays: formData.get("reminder_before_days")
      ? parseInt(formData.get("reminder_before_days") as string, 10)
      : 3,
    defaultChannel: normalizedChannel,
  };

  const result = await saveReminderSettings(workspaceId, input);
  return { ok: result.success, error: result.error };
}

export async function updatePaymentSettingsAction(formData: FormData) {
  const workspaceId = formData.get("workspaceId") as string;
  if (!workspaceId) {
    return { ok: false, error: "Workspace ID is required" };
  }

  const input = {
    defaultCurrency: (formData.get("default_currency") as string) || "USD",
  };

  const result = await savePaymentSettings(workspaceId, input);
  return { ok: result.success, error: result.error };
}

// Legacy actions (keeping for backward compatibility)
export async function updateSettings(
  workspaceId: string,
  values: any
) {
  await requireWorkspace(workspaceId);
  // This is kept for backward compatibility but should use new actions
  return { ok: false, error: "Use updateWorkspaceProfileAction instead" };
}

// Storage bucket constants
const WORKSPACE_LOGO_BUCKET = "workspace-logos";
const AVATAR_BUCKET = "avatars";

export type UploadWorkspaceLogoResult = {
  success: boolean;
  url?: string;
  error?: string;
};

/**
 * Upload workspace logo
 */
export async function uploadWorkspaceLogo(
  workspaceId: string,
  file: File
): Promise<UploadWorkspaceLogoResult> {
  const supabase = await supabaseServer();

  // Basic validation
  if (!file) {
    return { success: false, error: "No file provided." };
  }

  const allowedTypes = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
  if (!allowedTypes.includes(file.type)) {
    return { success: false, error: "Please upload a PNG, JPG, or WEBP image." };
  }

  const MAX_SIZE_BYTES = 800 * 1024; // 800 KB
  if (file.size > MAX_SIZE_BYTES) {
    return { success: false, error: "Logo is too large. Max size is 800 KB." };
  }

  const fileExt = file.type.split("/")[1] ?? "png";
  const fileName = `${workspaceId}/${Date.now()}.${fileExt}`;

  const { data, error } = await supabase.storage
    .from(WORKSPACE_LOGO_BUCKET)
    .upload(fileName, file, {
      upsert: true,
      cacheControl: "3600",
    });

  if (error) {
    console.error("[uploadWorkspaceLogo] upload error:", error);
    return { success: false, error: "Failed to upload logo. Please try again." };
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(WORKSPACE_LOGO_BUCKET).getPublicUrl(data.path);

  return {
    success: true,
    url: publicUrl,
  };
}

export type UploadAvatarResult =
  | { success: true; url: string }
  | { success: false; error: string };

/**
 * Upload user avatar
 */
export async function uploadAvatar(formData: FormData): Promise<UploadAvatarResult> {
  try {
    const { user } = await requireUser();
    const supabase = await supabaseServer();

    const file = formData.get("avatar") as File | null;

    if (!file) {
      return { success: false, error: "No file uploaded." };
    }

    if (file.size > MAX_AVATAR_FILE_SIZE_BYTES) {
      return { success: false, error: "Avatar too large. Please upload an image under 1 MB." };
    }

    if (!ALLOWED_AVATAR_MIME_TYPES.includes(file.type as any)) {
      return { success: false, error: "Unsupported file type. Please upload PNG, JPG, or WEBP." };
    }

    // Optional: small safety guard against zero-byte files
    if (file.size === 0) {
      return { success: false, error: "File is empty. Please upload a valid image." };
    }

    const ext = file.name.split(".").pop() || "png";
    const filePath = `${user.id}/${Date.now()}-avatar.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from(AVATAR_BUCKET)
      .upload(filePath, file, {
        cacheControl: "3600",
        upsert: true,
        contentType: file.type,
      });

    if (uploadError) {
      console.error("[uploadAvatar] storage upload error:", uploadError);
      return { success: false, error: "Failed to upload avatar. Please try again." };
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(filePath);

    // Update profile with avatar URL
    const { upsertProfile } = await import("@/lib/profile/server");
    const { error: profileError } = await upsertProfile({
      avatar_url: publicUrl,
    });

    if (profileError) {
      console.error("[uploadAvatar] profile update error:", profileError);
      return { success: false, error: "Failed to update profile" };
    }

    // Revalidate settings page and layout
    revalidatePath("/[workspaceId]/settings", "page");
    revalidatePath("/[workspaceId]/settings", "layout");
    revalidatePath("/[workspaceId]/dashboard", "layout");

    return { success: true, url: publicUrl };
  } catch (err) {
    console.error("[uploadAvatar] unexpected error:", err);
    return {
      success: false,
      error: "Unexpected error while uploading avatar. Please try again.",
    };
  }
}

export type RemoveAvatarResult =
  | { success: true }
  | { success: false; error: string };

/**
 * Remove user avatar
 */
export async function removeAvatar(): Promise<RemoveAvatarResult> {
  try {
    const { user } = await requireUser();
    const supabase = await supabaseServer();

    // Update profiles table to set avatar_url to null
    const { error: updateError } = await supabase
      .from("profiles")
      .update({ avatar_url: null })
      .eq("id", user.id);

    if (updateError) {
      console.error("[removeAvatar] update error:", updateError);
      return { success: false, error: "Failed to remove avatar. Please try again." };
    }

    // Revalidate pages that show the avatar
    // Revalidate settings page and layout
    revalidatePath("/[workspaceId]/settings", "page");
    revalidatePath("/[workspaceId]/settings", "layout");
    revalidatePath("/[workspaceId]/dashboard", "layout");

    return { success: true };
  } catch (err) {
    console.error("[removeAvatar] unexpected error:", err);
    return {
      success: false,
      error: "Unexpected error while removing avatar. Please try again.",
    };
  }
}

export type ResetAvatarResult =
  | { success: true; url: string }
  | { success: false; error: string };

/**
 * Reset user avatar to default FlowCollect avatar
 */
export async function resetAvatarToDefault(): Promise<ResetAvatarResult> {
  try {
    const { user } = await requireUser();
    const supabase = await supabaseServer();

    // Update profiles table to set avatar_url to DEFAULT_AVATAR_URL
    const { error: updateError } = await supabase
      .from("profiles")
      .update({ avatar_url: DEFAULT_AVATAR_URL })
      .eq("id", user.id);

    if (updateError) {
      console.error("[resetAvatarToDefault] update error:", updateError);
      return {
        success: false,
        error: "Failed to reset avatar. Please try again.",
      };
    }

    // Revalidate pages that show the avatar
    revalidatePath("/[workspaceId]/settings", "page");
    revalidatePath("/[workspaceId]/settings", "layout");
    revalidatePath("/[workspaceId]/dashboard", "layout");

    return { success: true, url: DEFAULT_AVATAR_URL };
  } catch (err) {
    console.error("[resetAvatarToDefault] unexpected error:", err);
    return {
      success: false,
      error: "Unexpected error while resetting avatar. Please try again.",
    };
  }
}

export type SaveAccountProfileResult = {
  error?: string;
};

/**
 * Save account profile (full name)
 */
export async function saveAccountProfile(values: { fullName?: string }): Promise<SaveAccountProfileResult> {
  const { upsertProfile } = await import("@/lib/profile/server");
  const { error } = await upsertProfile({
    full_name: values.fullName,
  });

  if (error) {
    console.error("[saveAccountProfile] error:", error);
    return { error: "Failed to save profile" };
  }

  revalidatePath("/[workspaceId]/settings", "layout");
  return {};
}
