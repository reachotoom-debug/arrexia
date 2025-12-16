/**
 * Shared helper for sending reminder emails
 * Used by both manual send API and automated reminder runner
 */

import { supabaseServer } from "@/lib/supabase/server";
import { renderReminderTemplate } from "@/lib/reminders/render";
import { computeInvoiceMetrics } from "@/lib/invoices/metrics";
import { logAuditEvent } from "@/lib/audit/log";
import type { Database } from "@/types/supabase";

// Dynamic import for nodemailer
let nodemailer: typeof import("nodemailer");

type InvoiceRow = Database["public"]["Tables"]["invoices"]["Row"];
type ClientRow = Database["public"]["Tables"]["clients"]["Row"];
type ReminderTemplateRow = Database["public"]["Tables"]["reminder_templates"]["Row"];
type ReminderRuleRow = Database["public"]["Tables"]["reminder_rules"]["Row"];
type WorkspaceEmailSettingsRow = Database["public"]["Tables"]["workspace_email_settings"]["Row"];

export interface SendReminderOptions {
  workspaceId: string;
  invoiceId: string;
  ruleId?: string | null;
  templateId?: string | null;
  source?: "manual" | "auto_cron";
  userId?: string | null; // optional, for audit logging
}

export interface SendReminderResult {
  success: boolean;
  message?: string;
  errorMessage?: string;
  reminderLogId?: string;
}

/**
 * Send a reminder email for an invoice
 * This is the core sending logic extracted from the API route
 */
export async function sendReminderForInvoice(
  options: SendReminderOptions
): Promise<SendReminderResult> {
  const { workspaceId, invoiceId, ruleId, templateId, source = "manual", userId = null } = options;
  const supabase = await supabaseServer();

  // Dynamically import nodemailer
  try {
    nodemailer = await import("nodemailer");
  } catch (importError) {
    return {
      success: false,
      errorMessage: "nodemailer package is not installed. Please install it with: npm install nodemailer @types/nodemailer",
    };
  }

  // 1) Load invoice + client
  const { data: invoice, error: invoiceError } = await supabase
    .from("invoices")
    .select(`
      id,
      workspace_id,
      client_id,
      invoice_number,
      status,
      issue_date,
      due_date,
      currency,
      amount,
      total_paid,
      outstanding_amount,
      organization_id,
      clients (
        id,
        name,
        email
      )
    `)
    .eq("id", invoiceId)
    .eq("workspace_id", workspaceId)
    .single();

  if (invoiceError || !invoice) {
    return {
      success: false,
      errorMessage: "Invoice not found",
    };
  }

  type InvoiceWithClient = InvoiceRow & {
    clients: ClientRow | ClientRow[] | null;
  };
  const invoiceWithClient = invoice as InvoiceWithClient;
  const client = Array.isArray(invoiceWithClient.clients)
    ? invoiceWithClient.clients[0]
    : invoiceWithClient.clients;

  if (!client) {
    return {
      success: false,
      errorMessage: "Client not found for this invoice",
    };
  }

  // 2) Check client email
  if (!client.email) {
    return {
      success: false,
      errorMessage: "Client email is missing. Cannot send reminder.",
    };
  }

  // 3) Compute metrics
  const { data: payments } = await supabase
    .from("payments")
    .select("*")
    .eq("invoice_id", invoice.id);

  const metrics = computeInvoiceMetrics({
    invoice: invoice as InvoiceRow,
    payments: payments || [],
  });

  const dueDate = invoice.due_date ? new Date(invoice.due_date) : null;
  const daysOverdue = metrics.daysOverdue;

  // 4) Load enabled templates (including channel field)
  const { data: enabledTemplates, error: templatesError } = await supabase
    .from("reminder_templates")
    .select("id, code, name, subject, body, is_enabled, workspace_id, channel")
    .eq("workspace_id", workspaceId)
    .eq("is_enabled", true);

  if (templatesError) {
    console.error("[sendReminderForInvoice] templatesError", templatesError);
    return {
      success: false,
      errorMessage: "Failed to load reminder templates.",
    };
  }

  if (!enabledTemplates || enabledTemplates.length === 0) {
    return {
      success: false,
      errorMessage: "All reminder templates are disabled. Please enable at least one template in Settings → Reminders.",
    };
  }

  // 5) Resolve template to use
  let templateToUse: ReminderTemplateRow | null = null;
  let finalRuleId: string | null = ruleId ?? null;

  // If ruleId is provided, try to resolve template from the rule
  if (ruleId) {
    const { data: rule } = await supabase
      .from("reminder_rules")
      .select("template_id, is_enabled")
      .eq("id", ruleId)
      .eq("workspace_id", workspaceId)
      .single();

    if (rule && rule.is_enabled) {
      const ruleTemplate = enabledTemplates.find((t) => t.id === rule.template_id);
      if (ruleTemplate) {
        templateToUse = ruleTemplate as ReminderTemplateRow;
        finalRuleId = ruleId;
      }
    }
  }

  // If templateId is provided and not already set, use it
  if (!templateToUse && templateId) {
    const selectedTemplate = enabledTemplates.find((t) => t.id === templateId);
    if (selectedTemplate) {
      templateToUse = selectedTemplate as ReminderTemplateRow;
    }
  }

  // If no template selected yet, choose deterministically
  if (!templateToUse) {
    templateToUse =
      enabledTemplates.find((t) => t.code === "final") ??
      enabledTemplates.find((t) => t.code === "plus_7") ??
      enabledTemplates[0];
  }

  if (!templateToUse) {
    return {
      success: false,
      errorMessage: "All reminder templates are disabled. Please enable at least one template in Settings → Reminders.",
    };
  }

  // 6) Determine channel: use template channel if available, otherwise fall back to workspace default
  // Load workspace settings for default channel
  const { data: workspaceSettings } = await supabase
    .from("settings")
    .select("reminder_channel")
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  type TemplateWithChannel = ReminderTemplateRow & {
    channel?: string | null;
  };
  const templateChannel = (templateToUse as TemplateWithChannel).channel;
  const workspaceDefaultChannel = workspaceSettings?.reminder_channel ?? "email";
  const resolvedChannel = templateChannel || workspaceDefaultChannel;
  const normalizedChannel = resolvedChannel === "whatsapp" ? "whatsapp" : "email";

  // For now, only send email reminders. WhatsApp is stored but not yet implemented.
  if (normalizedChannel !== "email") {
    // Skip non-email channels gracefully (for future WhatsApp support)
    return {
      success: true,
      message: `Reminder skipped: ${normalizedChannel} channel is not yet implemented. Only email reminders are sent at this time.`,
    };
  }

  // 7) Load workspace data (for name in template)
  const { data: workspace } = await supabase
    .from("workspaces")
    .select("name")
    .eq("id", workspaceId)
    .maybeSingle();

  // 8) Load workspace SMTP settings
  const { data: emailSettings, error: emailSettingsError } = await supabase
    .from("workspace_email_settings")
    .select("*")
    .eq("workspace_id", workspaceId)
    .single();

  if (emailSettingsError || !emailSettings) {
    return {
      success: false,
      errorMessage: "Email settings not configured. Please configure SMTP settings in Settings > Email & SMTP.",
    };
  }

  if (!emailSettings.smtp_host || !emailSettings.smtp_port) {
    return {
      success: false,
      errorMessage: "SMTP host and port are required",
    };
  }

  // 9) Render subject/body
  const rendered = renderReminderTemplate({
    template: {
      id: templateToUse.id,
      subject: templateToUse.subject,
      body: templateToUse.body,
    },
    invoice: {
      invoice_number: invoice.invoice_number || "",
      due_date: invoice.due_date,
      outstanding_amount: metrics.outstanding,
      currency: invoice.currency || "USD",
      workspace_name: "", // TODO: Load workspace name if needed
    },
    client: {
      name: client.name,
      email: client.email,
    },
  });

  const subject = rendered.subject;
  const emailBody = rendered.html; // renderReminderTemplate returns html, but we use it as text

  // 9) Create nodemailer transport
  const transporter = nodemailer.createTransport({
    host: emailSettings.smtp_host,
    port: emailSettings.smtp_port,
    secure: emailSettings.use_tls ?? true,
    auth: emailSettings.smtp_username && emailSettings.smtp_password
      ? {
          user: emailSettings.smtp_username,
          pass: emailSettings.smtp_password,
        }
      : undefined,
  });

  // 11) Send email
  let sendError: Error | null = null;
  let sendSuccess = false;

  try {
    await transporter.sendMail({
      from: emailSettings.from_email
        ? emailSettings.from_name
          ? `${emailSettings.from_name} <${emailSettings.from_email}>`
          : emailSettings.from_email
        : undefined,
      to: client.email,
      subject,
      text: emailBody,
    });
    sendSuccess = true;
  } catch (err) {
    sendError = err instanceof Error ? err : new Error(String(err));
    console.error("[sendReminderForInvoice] email send error", err);
  }

  // 12) Log reminder (only reached if channel is "email")
  const { data: reminderLog, error: insertError } = await supabase
    .from("reminders")
    .insert({
      workspace_id: workspaceId,
      invoice_id: invoice.id,
      client_id: client.id,
      rule_id: finalRuleId,
      template_id: templateToUse.id,
      channel: "email", // Always "email" since we skip non-email channels above
      subject,
      body: emailBody,
      status: sendSuccess ? "sent" : "failed",
      sent_at: sendSuccess ? new Date().toISOString() : null,
      last_error: sendError ? sendError.message : null,
      error_message: sendError ? sendError.message : null,
      type: "reminder",
      organization_id: invoice.organization_id || null,
      // TODO: Add source field to reminders table to track "manual" vs "auto_cron"
      // For now, we can infer from context (manual sends come from API route, auto from runner)
    })
    .select("id")
    .single();

  if (insertError) {
    console.error("[sendReminderForInvoice] insertError", insertError);
    return {
      success: false,
      errorMessage: "Failed to log reminder",
    };
  }

  if (!sendSuccess) {
    return {
      success: false,
      errorMessage: sendError?.message || "Failed to send email",
      reminderLogId: reminderLog?.id,
    };
  }

  // Log audit event for successful reminder send
  await logAuditEvent({
    workspaceId,
    userId,
    entityType: "reminder",
    entityId: reminderLog?.id || invoiceId, // Use reminder log ID if available, fallback to invoice ID
    action: "sent",
    metadata: {
      invoice_id: invoiceId,
      rule_id: finalRuleId,
      template_id: templateToUse.id,
      source: source, // "manual" or "auto_cron"
      automatic: source === "auto_cron",
    },
  });

  return {
    success: true,
    message: "Reminder sent successfully",
    reminderLogId: reminderLog?.id,
  };
}
