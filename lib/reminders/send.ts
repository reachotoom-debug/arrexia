/**
 * Shared helper for sending reminder emails
 * Used by both manual send API and automated reminder runner
 */

import { supabaseServer } from "@/lib/supabase/server";
import {
  buildReminderTemplateContext,
  renderReminderTemplateFromContext,
} from "@/lib/reminders/render";
import { logAuditEvent } from "@/lib/audit/log";
import { resolveEmailProvider, sendEmail } from "@/lib/email/sendEmail";
import { renderReminderEmail } from "@/lib/email/templates";
import { formatCurrency } from "@/lib/format/currency";
import { getWorkspaceOrganizationId } from "@/lib/workspaces/getWorkspaceOrganizationId";
import type { Database } from "@/types/supabase/index";

// Dynamic import for nodemailer
let nodemailer: typeof import("nodemailer");

type InvoiceRow = Database["public"]["Tables"]["invoices"]["Row"];
type ClientRow = Database["public"]["Tables"]["clients"]["Row"];
type ClientForReminder = Pick<
  Database["public"]["Tables"]["clients"]["Row"],
  "id" | "name" | "email" | "archived_at" | "is_active"
>;
type MessageTemplateRow = Database["public"]["Tables"]["message_templates"]["Row"];
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
  status: "sent" | "failed" | "skipped"; // Status of the reminder attempt
  message?: string;
  errorMessage?: string;
  reminderId?: string;
  reminderLogId?: string; // backward compatibility (prefer reminderId)
  skipReason?: string; // reason for skipping (e.g., "client_archived", "client_inactive")
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

  const sourceLabel: "manual" | "auto" = source === "auto_cron" ? "auto" : "manual";

  let cachedWorkspaceOrganizationId: string | undefined;
  const resolveOrganizationId = async (
    organizationId?: string | null
  ): Promise<string> => {
    if (organizationId) {
      return organizationId;
    }
    if (!cachedWorkspaceOrganizationId) {
      cachedWorkspaceOrganizationId = await getWorkspaceOrganizationId(workspaceId);
    }
    return cachedWorkspaceOrganizationId;
  };

  const recordReminderOutcome = async (params: {
    status: "sent" | "failed" | "skipped";
    invoiceId: string;
    clientId: string | null;
    ruleId: string | null;
    templateId: string | null;
    subject: string;
    body: string;
    sentAt: string;
    errorMessage?: string;
    skipReason?: string | null;
    organizationId?: string | null;
    recipientEmail?: string | null;
  }): Promise<{ reminderId?: string; persistError?: string }> => {
    const {
      status,
      invoiceId: invId,
      clientId,
      ruleId: rId,
      templateId: tId,
      subject,
      body,
      sentAt,
      errorMessage,
      skipReason,
      organizationId,
      recipientEmail,
    } = params;

    let reminderId: string | undefined;
    let persistError: string | undefined;
    try {
      const resolvedOrganizationId = await resolveOrganizationId(organizationId);
      const { data: reminderLog, error: insertError } = await supabase
        .from("reminders")
        .insert({
          workspace_id: workspaceId,
          invoice_id: invId,
          client_id: clientId,
          rule_id: rId,
          template_id: tId,
          channel: "email",
          subject,
          body,
          status,
          sent_at: sentAt,
          last_error: errorMessage ? errorMessage.substring(0, 500) : null,
          error_message: errorMessage ? errorMessage.substring(0, 500) : null,
          type: "reminder",
          organization_id: resolvedOrganizationId,
        })
        .select("id")
        .single();

      if (!insertError && reminderLog) {
        reminderId = reminderLog.id;
      } else if (insertError) {
        persistError = insertError.message;
        console.error("[sendReminderForInvoice] Failed to insert reminders row:", {
          message: insertError.message,
          code: insertError.code,
          workspaceId,
          invoiceId: invId,
          status,
        });
      }
    } catch (logError) {
      persistError =
        logError instanceof Error ? logError.message : String(logError);
      console.error("[sendReminderForInvoice] Unexpected error inserting reminders row:", logError);
    }

    // Activity log (non-blocking). `logAuditEvent` writes to `activity_logs`.
    try {
      await logAuditEvent({
        workspaceId,
        userId,
        entityType: "reminder",
        entityId: reminderId || invId,
        action:
          status === "sent"
            ? "reminder.sent"
            : status === "skipped"
              ? "reminder.skipped"
              : "reminder.failed",
        metadata: {
          invoice_id: invId,
          client_id: clientId,
          recipient_email: recipientEmail ?? null,
          rule_id: rId,
          template_id: tId,
          source: sourceLabel,
          skip_reason: status === "skipped" ? skipReason ?? null : null,
        },
      });
    } catch (auditError) {
      console.error("[sendReminderForInvoice] Activity log error:", auditError);
    }

    return { reminderId, persistError };
  };

  // 1) Load invoice from invoices_view + client from clients table
  // NOTE: Use invoices_view for outstanding field (outstanding_amount was dropped from invoices table)
  const invoiceViewSelect =
    "id, workspace_id, client_id, invoice_number, base_status, display_status, issue_date, due_date, currency, total, paid, outstanding, archived_at";

  // Reminders eligibility: only invoices with outstanding > 0 and not archived
  // This uses invoices_view as the single source of truth.
  const { data: eligibleInvoiceView, error: eligibleInvoiceError } = await supabase
    .from("invoices_view")
    .select(invoiceViewSelect)
    .eq("id", invoiceId)
    .eq("workspace_id", workspaceId)
    .is("archived_at", null)
    .gt("outstanding", 0)
    .maybeSingle();

  if (eligibleInvoiceError) {
    const errorMsg = "Failed to load invoice";
    console.debug(
      `[sendReminderForInvoice] { workspaceId: "${workspaceId}", invoiceId: "${invoiceId}", outcome: "failed", reminderId: undefined }`
    );
    const { reminderId } = await recordReminderOutcome({
      status: "failed",
      invoiceId,
      clientId: null,
      ruleId: ruleId ?? null,
      templateId: templateId ?? null,
      subject: "Payment Reminder",
      body: `Reminder failed: ${errorMsg}`,
      sentAt: new Date().toISOString(),
      errorMessage: errorMsg,
      skipReason: null,
      organizationId: null,
    });
    return {
      success: false,
      status: "failed",
      errorMessage: errorMsg,
      reminderId,
      reminderLogId: reminderId,
    };
  }

  let invoiceView = eligibleInvoiceView;

  // If the eligible-invoice lookup didn't return a row, do a fallback fetch so we can
  // produce the correct skip reason (archived/paid) vs "not found".
  if (!invoiceView) {
    const { data: fallbackInvoiceView, error: fallbackInvoiceError } = await supabase
      .from("invoices_view")
      .select(invoiceViewSelect)
      .eq("id", invoiceId)
      .eq("workspace_id", workspaceId)
      .maybeSingle();

    if (fallbackInvoiceError || !fallbackInvoiceView) {
      const errorMsg = "Invoice not found";
      console.debug(
        `[sendReminderForInvoice] { workspaceId: "${workspaceId}", invoiceId: "${invoiceId}", outcome: "failed", reminderId: undefined }`
      );
      const { reminderId } = await recordReminderOutcome({
        status: "failed",
        invoiceId,
        clientId: null,
        ruleId: ruleId ?? null,
        templateId: templateId ?? null,
        subject: "Payment Reminder",
        body: `Reminder failed: ${errorMsg}`,
        sentAt: new Date().toISOString(),
        errorMessage: errorMsg,
        skipReason: null,
        organizationId: null,
      });
      return {
        success: false,
        status: "failed",
        errorMessage: errorMsg,
        reminderId,
        reminderLogId: reminderId,
      };
    }

    // Invoice exists, but is not eligible for reminders.
    let skipReason: string | null = null;
    if (fallbackInvoiceView.archived_at) {
      skipReason = "invoice_archived";
    } else {
      const outstanding = Number(fallbackInvoiceView.outstanding ?? 0);
      if (!(outstanding > 0)) {
        skipReason = "invoice_no_outstanding";
      }
    }

    if (skipReason) {
      const errorMessage =
        skipReason === "invoice_archived"
          ? "Cannot send reminder: invoice is archived."
          : "Cannot send reminder: invoice has no outstanding balance.";

      const { reminderId } = await recordReminderOutcome({
        status: "skipped",
        invoiceId: fallbackInvoiceView.id,
        clientId: fallbackInvoiceView.client_id,
        ruleId: ruleId ?? null,
        templateId: templateId ?? null,
        subject: "Payment Reminder",
        body: `Reminder skipped: ${errorMessage}`,
        sentAt: new Date().toISOString(),
        errorMessage,
        skipReason,
        organizationId: null,
      });

      console.debug(
        `[sendReminderForInvoice] { workspaceId: "${workspaceId}", invoiceId: "${invoiceId}", outcome: "skipped", reminderId: "${reminderId || "undefined"}" }`
      );
      return {
        success: false,
        status: "skipped",
        errorMessage,
        reminderId,
        reminderLogId: reminderId,
        skipReason,
      };
    }

    invoiceView = fallbackInvoiceView;
  }

  // Load client separately
  let client: ClientForReminder | null = null;
  {
    const { data: eligibleClientData, error: eligibleClientError } = await supabase
      .from("clients")
      .select("id, name, email, archived_at, is_active")
      // Reminders eligibility: clients must be active AND not archived
      // This rule must match all reminders queries globally.
      .eq("id", invoiceView.client_id)
      .eq("workspace_id", workspaceId)
      .eq("is_active", true)
      .is("archived_at", null)
      .maybeSingle();

    if (eligibleClientError) {
      const errorMsg = "Failed to load client for this invoice";
      console.debug(
        `[sendReminderForInvoice] { workspaceId: "${workspaceId}", invoiceId: "${invoiceId}", outcome: "failed", reminderId: undefined }`
      );
      const { reminderId } = await recordReminderOutcome({
        status: "failed",
        invoiceId: invoiceView.id,
        clientId: invoiceView.client_id,
        ruleId: ruleId ?? null,
        templateId: templateId ?? null,
        subject: "Payment Reminder",
        body: `Reminder failed: ${errorMsg}`,
        sentAt: new Date().toISOString(),
        errorMessage: errorMsg,
        skipReason: null,
        organizationId: null,
      });
      return {
        success: false,
        status: "failed",
        errorMessage: errorMsg,
        reminderId,
        reminderLogId: reminderId,
      };
    }

    client = eligibleClientData ?? null;
  }

  // If the eligible-client lookup didn't return a row, do a fallback fetch so we can
  // produce the correct skip reason (archived/inactive) vs "not found".
  if (!client) {
    const { data: fallbackClientData, error: fallbackClientError } = await supabase
      .from("clients")
      .select("id, name, email, archived_at, is_active")
      .eq("id", invoiceView.client_id)
      .eq("workspace_id", workspaceId)
      .maybeSingle();

    if (fallbackClientError || !fallbackClientData) {
      const errorMsg = "Client not found for this invoice";
      console.debug(
        `[sendReminderForInvoice] { workspaceId: "${workspaceId}", invoiceId: "${invoiceId}", outcome: "failed", reminderId: undefined }`
      );
      const { reminderId } = await recordReminderOutcome({
        status: "failed",
        invoiceId: invoiceView.id,
        clientId: invoiceView.client_id,
        ruleId: ruleId ?? null,
        templateId: templateId ?? null,
        subject: "Payment Reminder",
        body: `Reminder failed: ${errorMsg}`,
        sentAt: new Date().toISOString(),
        errorMessage: errorMsg,
        skipReason: null,
        organizationId: null,
      });
      return {
        success: false,
        status: "failed",
        errorMessage: errorMsg,
        reminderId,
        reminderLogId: reminderId,
      };
    }

    client = fallbackClientData;
  }

  // Map invoices_view data to expected format
  const invoice = {
    id: invoiceView.id,
    workspace_id: invoiceView.workspace_id,
    client_id: invoiceView.client_id,
    invoice_number: invoiceView.invoice_number,
    status: invoiceView.base_status,
    issue_date: invoiceView.issue_date,
    due_date: invoiceView.due_date,
    currency: invoiceView.currency,
    amount: invoiceView.total,
    total_paid: invoiceView.paid,
    outstanding: invoiceView.outstanding,
    organization_id: null, // invoices_view doesn't have organization_id
  };
  // `client` is guaranteed non-null due to fallback fetch above.

  // 2) Validate client - if inactive or missing email, log as skipped
  let skipReason: string | null = null;
  if (client.archived_at) {
    skipReason = "client_archived";
  } else if (client.is_active !== true) {
    skipReason = "client_inactive";
  } else if (!client.email) {
    skipReason = "client_email_missing";
  }

  // If skipped, log history and return early
  if (skipReason) {
    const errorMessage = 
      skipReason === "client_archived" ? "Cannot send reminder: client is archived." :
      skipReason === "client_inactive" ? "Cannot send reminder: client is inactive." :
      "Cannot send reminder: client email is missing.";

    const { reminderId } = await recordReminderOutcome({
      status: "skipped",
      invoiceId: invoice.id,
      clientId: client.id,
      ruleId: ruleId ?? null,
      templateId: templateId ?? null,
      subject: "Payment Reminder",
      body: `Reminder skipped: ${errorMessage}`,
      sentAt: new Date().toISOString(),
      errorMessage,
      skipReason,
      organizationId: invoice.organization_id || null,
    });

    console.debug(
      `[sendReminderForInvoice] { workspaceId: "${workspaceId}", invoiceId: "${invoiceId}", outcome: "skipped", reminderId: "${reminderId || "undefined"}" }`
    );
    return {
      success: false,
      status: "skipped",
      errorMessage,
      reminderId,
      reminderLogId: reminderId,
      skipReason,
    };
  }

  // 3) Resolve template_id safely (from message_templates table)
  let resolvedTemplateId: string | null = null;

  // If templateId is provided by caller, use it
  if (templateId) {
    // Verify it exists in message_templates
    const { data: existingTemplate } = await supabase
      .from("message_templates")
      .select("id")
      .eq("id", templateId)
      .eq("workspace_id", workspaceId)
      .maybeSingle();

    if (existingTemplate) {
      resolvedTemplateId = templateId;
    }
  }

  // If no template yet, query message_templates for the workspace
  if (!resolvedTemplateId) {
    // Query message_templates - try to filter by is_active/archived_at if columns exist
    // Since we can't check column existence at runtime, we query all and filter in JS if needed
    // Or use a SQL approach that handles missing columns gracefully
    // For simplicity, we'll query and get the most recent template
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

  // If still no template, create a minimal default template
  if (!resolvedTemplateId) {
    try {
      const defaultSubject = "Payment Reminder";
      const defaultBody = `Dear {{client_name}},\n\nThis is a reminder that invoice {{invoice_number}} is due.\n\nPlease make payment at your earliest convenience.\n\nThank you.`;

      const { data: newTemplate, error: insertError } = await supabase
        .from("message_templates")
        .insert({
          workspace_id: workspaceId,
          name: "Default Reminder Template",
          subject: defaultSubject,
          body: defaultBody,
        })
        .select("id")
        .single();

      if (!insertError && newTemplate) {
        resolvedTemplateId = newTemplate.id;
      }
    } catch (createError) {
      console.error("[sendReminderForInvoice] Failed to create default template:", createError);
      // Continue with resolvedTemplateId = null
    }
  }

  // 4) Load template data if we have a template_id
  let templateData: { subject: string; body: string } | null = null;
  if (resolvedTemplateId) {
    const { data: template } = await supabase
      .from("message_templates")
      .select("subject, body")
      .eq("id", resolvedTemplateId)
      .single();

    if (template) {
      templateData = { subject: template.subject, body: template.body };
    }
  }

  // Prepare subject and main message (plain text; HTML shell applied below)
  const invoiceNumberLabel = invoice.invoice_number || invoice.id;
  let subject = `Payment reminder: Invoice #${invoiceNumberLabel}`;
  let mainMessagePlain = `This is a friendly reminder that invoice #${invoiceNumberLabel} is due.`;

  // If we have template data, try to render it
  if (templateData && resolvedTemplateId) {
    try {
      const { data: workspace } = await supabase
        .from("workspaces")
        .select("name")
        .eq("id", workspaceId)
        .maybeSingle();

      const context = buildReminderTemplateContext({
        invoiceView: {
          invoice_number: invoiceView.invoice_number,
          due_date: invoiceView.due_date,
          outstanding: invoiceView.outstanding,
          currency: invoiceView.currency,
          workspace_name: workspace?.name || "",
        },
        client: {
          name: client.name,
          email: client.email || "",
        },
      });

      const rendered = renderReminderTemplateFromContext({
        template: {
          id: resolvedTemplateId,
          subject: templateData.subject,
          body: templateData.body,
        },
        context,
      });
      subject = rendered.subject;
      mainMessagePlain = rendered.html;
    } catch (renderError) {
      console.error("[sendReminderForInvoice] template render error:", renderError);
      // Continue with fallback subject/body
    }
  }

  // 5) Load email settings and determine provider
  const { data: settings } = await supabase
    .from("settings")
    .select("email_provider, from_name, from_email")
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  const emailProvider = resolveEmailProvider(settings?.email_provider);

  const { data: emailSettings } = await supabase
    .from("workspace_email_settings")
    .select("*")
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  const { data: workspaceRow } = await supabase
    .from("workspaces")
    .select("name")
    .eq("id", workspaceId)
    .maybeSingle();

  const businessName =
    emailSettings?.from_name ||
    settings?.from_name ||
    workspaceRow?.name ||
    "FlowCollect";

  const currency = invoiceView.currency || "USD";
  const totalAmountFormatted = formatCurrency(Number(invoiceView.total ?? invoice.amount ?? 0), {
    currency,
  });
  const outstandingFormatted = formatCurrency(Number(invoiceView.outstanding ?? 0), {
    currency,
  });

  const daysOverdue = (() => {
    if (!invoiceView.due_date) return 0;
    const msPerDay = 1000 * 60 * 60 * 24;
    const due = new Date(invoiceView.due_date);
    const startOfDue = new Date(due.getFullYear(), due.getMonth(), due.getDate());
    const now = new Date();
    const startOfNow = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const diffDays = Math.floor((startOfNow.getTime() - startOfDue.getTime()) / msPerDay);
    return diffDays > 0 ? diffDays : 0;
  })();

  const emailContent = renderReminderEmail({
    businessName,
    clientName: client.name || "Client",
    invoiceNumber: invoiceNumberLabel,
    dueDate: invoiceView.due_date,
    totalAmount: totalAmountFormatted,
    outstandingAmount: outstandingFormatted,
    daysOverdue,
    mainMessage: mainMessagePlain,
  });

  const emailHtml = emailContent.html;
  const emailText = emailContent.text;

  if (!templateData?.subject) {
    subject = emailContent.subject;
  }

  if (emailProvider === "smtp" && (!emailSettings || !emailSettings.smtp_host || !emailSettings.smtp_port)) {
    const errorMsg =
      "SMTP settings not configured. Please configure SMTP host and port in Settings > Email & SMTP.";
    const { reminderId } = await recordReminderOutcome({
      status: "failed",
      invoiceId: invoice.id,
      clientId: client.id,
      ruleId: ruleId ?? null,
      templateId: resolvedTemplateId,
      subject,
      body: emailText,
      sentAt: new Date().toISOString(),
      errorMessage: errorMsg,
      skipReason: null,
      organizationId: invoice.organization_id || null,
    });

    console.debug(
      `[sendReminderForInvoice] { workspaceId: "${workspaceId}", invoiceId: "${invoiceId}", outcome: "failed", reminderId: "${reminderId || "undefined"}" }`
    );
    return {
      success: false,
      status: "failed",
      errorMessage: errorMsg,
      reminderId,
      reminderLogId: reminderId,
    };
  }

  // 6) Attempt email send with timeout (8-10 seconds)
  let sendError: Error | null = null;
  let sendSuccess = false;
  const EMAIL_TIMEOUT_MS = 9000; // 9 seconds

  const fromEmail = emailSettings?.from_email || settings?.from_email || null;
  const fromName = emailSettings?.from_name || settings?.from_name || "FlowCollect";
  const toEmail = client.email!;

  try {
    if (emailProvider === "resend") {
      const sendResult = await sendEmail({
        to: toEmail,
        subject,
        html: emailHtml,
        text: emailText,
        fromName,
        fromEmail,
      });

      if (!sendResult.success) {
        throw new Error(sendResult.error || "Failed to send email");
      }

      sendSuccess = true;
    } else {
      // Use SMTP (nodemailer)
      try {
        nodemailer = await import("nodemailer");
      } catch {
        throw new Error(
          "nodemailer package is not installed. Please install it with: npm install nodemailer @types/nodemailer"
        );
      }

      const transporter = nodemailer.createTransport({
        host: emailSettings!.smtp_host,
        port: emailSettings!.smtp_port,
        secure: emailSettings!.use_tls ?? true,
        auth: emailSettings!.smtp_username && emailSettings!.smtp_password
          ? {
              user: emailSettings!.smtp_username,
              pass: emailSettings!.smtp_password,
            }
          : undefined,
      });

      // Wrap SMTP send in a timeout
      const sendPromise = transporter.sendMail({
        from: fromEmail
          ? fromName
            ? `${fromName} <${fromEmail}>`
            : fromEmail
          : undefined,
        to: toEmail,
        subject,
        html: emailHtml,
        text: emailText,
      });

      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("Email send timeout (9s)")), EMAIL_TIMEOUT_MS);
      });

      await Promise.race([sendPromise, timeoutPromise]);
      sendSuccess = true;
    }
  } catch (err) {
    sendError = err instanceof Error ? err : new Error(String(err));
    console.error("[sendReminderForInvoice] email send error:", {
      message: sendError.message,
      stack: sendError.stack,
      provider: emailProvider,
      workspaceId,
      invoiceId,
    });
  }

  // 7) ALWAYS record reminder attempt (non-negotiable): reminders row + activity log
  const finalStatus: "sent" | "failed" = sendSuccess ? "sent" : "failed";
  const finalErrorMessage =
    finalStatus === "failed" ? (sendError?.message || "Failed to send email") : undefined;

  const { reminderId, persistError } = await recordReminderOutcome({
    status: finalStatus,
    invoiceId: invoice.id,
    clientId: client.id,
    ruleId: ruleId ?? null,
    templateId: resolvedTemplateId,
    subject,
    body: emailText,
    sentAt: new Date().toISOString(),
    errorMessage: finalErrorMessage,
    skipReason: null,
    organizationId: invoice.organization_id || null,
    recipientEmail: client.email,
  });

  // 8) Return result
  console.debug(
    `[sendReminderForInvoice] { workspaceId: "${workspaceId}", invoiceId: "${invoiceId}", outcome: "${finalStatus}", reminderId: "${reminderId || "undefined"}" }`
  );

  if (sendSuccess) {
    if (!reminderId) {
      const historyError =
        persistError ??
        "Reminder email sent, but history could not be saved.";
      return {
        success: false,
        status: "failed",
        errorMessage: historyError,
        message: historyError,
        reminderId,
        reminderLogId: reminderId,
      };
    }

    return {
      success: true,
      status: "sent",
      message: "Reminder sent successfully",
      reminderId,
      reminderLogId: reminderId,
    };
  }

  return {
    success: false,
    status: "failed",
    errorMessage: finalErrorMessage,
    reminderId,
    reminderLogId: reminderId,
  };
}
