/**
 * Send invoice reminder email and log to reminders table
 * 
 * A simpler, focused function that:
 * - Sends email using workspace SMTP settings
 * - Logs success/failure to reminders table
 * - Never throws unhandled errors
 */

import { supabaseServer } from "@/lib/supabase/server";
import { buildReminderTemplateContext, renderReminderTemplateFromContext } from "./render";

// Dynamic import for nodemailer
let nodemailer: typeof import("nodemailer");

export interface InvoiceForReminder {
  id: string;
  workspace_id: string;
  invoice_number: string | null;
  due_date: string | null;
  currency: string | null;
  client_id: string | null;
  organization_id?: string | null;
  client?: {
    name: string | null;
    email: string | null;
  } | null;
}

export interface TemplateForReminder {
  id: string;
  subject: string;
  body: string;
}

export interface SendInvoiceReminderResult {
  success: boolean;
  reminderLogId?: string;
  errorMessage?: string;
}

/**
 * Send invoice reminder email and log result to reminders table
 * 
 * @param invoice - Invoice object with id, workspace_id, and client info
 * @param template - Template object with id, subject, and body
 * @returns Result with success status and optional reminder log ID or error message
 */
export async function sendInvoiceReminder(
  invoice: InvoiceForReminder,
  template: TemplateForReminder
): Promise<SendInvoiceReminderResult> {
  try {
    const supabase = await supabaseServer();

    // Validate required fields
    if (!invoice.id || !invoice.workspace_id) {
      return {
        success: false,
        errorMessage: "Invoice must have id and workspace_id",
      };
    }

    if (!template.id || !template.subject || !template.body) {
      return {
        success: false,
        errorMessage: "Template must have id, subject, and body",
      };
    }

    if (!invoice.client?.email) {
      return {
        success: false,
        errorMessage: "Client email is required to send reminder",
      };
    }

    // Load workspace SMTP settings
    const { data: emailSettings, error: emailSettingsError } = await supabase
      .from("workspace_email_settings")
      .select("*")
      .eq("workspace_id", invoice.workspace_id)
      .single();

    if (emailSettingsError || !emailSettings) {
      // Log as failed reminder
      const { data: failedLog } = await supabase
        .from("reminders")
        .insert({
          workspace_id: invoice.workspace_id,
          invoice_id: invoice.id,
          client_id: invoice.client_id || null,
          template_id: template.id,
          channel: "email",
          subject: template.subject,
          body: template.body,
          status: "failed",
          sent_at: null,
          error_message: "Email settings not configured",
          last_error: "Email settings not configured",
          type: "reminder",
          organization_id: invoice.organization_id || null,
        })
        .select("id")
        .single();

      return {
        success: false,
        reminderLogId: failedLog?.id,
        errorMessage: "Email settings not configured",
      };
    }

    if (!emailSettings.smtp_host || !emailSettings.smtp_port) {
      // Log as failed reminder
      const { data: failedLog } = await supabase
        .from("reminders")
        .insert({
          workspace_id: invoice.workspace_id,
          invoice_id: invoice.id,
          client_id: invoice.client_id || null,
          template_id: template.id,
          channel: "email",
          subject: template.subject,
          body: template.body,
          status: "failed",
          sent_at: null,
          error_message: "SMTP host and port are required",
          last_error: "SMTP host and port are required",
          type: "reminder",
          organization_id: invoice.organization_id || null,
        })
        .select("id")
        .single();

      return {
        success: false,
        reminderLogId: failedLog?.id,
        errorMessage: "SMTP host and port are required",
      };
    }

    // Render template with invoice/client data (single source of truth for placeholders)
    const context = buildReminderTemplateContext({
      invoiceView: {
        invoice_number: invoice.invoice_number || null,
        due_date: invoice.due_date || null,
        outstanding: null, // Not available in minimal invoice object
        currency: invoice.currency || null,
        workspace_name: null, // Not available in minimal invoice object
      },
      client: invoice.client || null,
      workspaceId: invoice.workspace_id,
      invoiceId: invoice.id,
    });

    const rendered = renderReminderTemplateFromContext({
      template: {
        id: template.id,
        subject: template.subject,
        body: template.body,
      },
      context,
    });

    const subject = rendered.subject;
    const emailBody = rendered.html; // renderReminderTemplate returns html

    // Dynamically import nodemailer
    try {
      nodemailer = await import("nodemailer");
    } catch (importError) {
      // Log as failed reminder
      const { data: failedLog } = await supabase
        .from("reminders")
        .insert({
          workspace_id: invoice.workspace_id,
          invoice_id: invoice.id,
          client_id: invoice.client_id || null,
          template_id: template.id,
          channel: "email",
          subject,
          body: emailBody,
          status: "failed",
          sent_at: null,
          error_message: "nodemailer package is not installed",
          last_error: "nodemailer package is not installed",
          type: "reminder",
          organization_id: invoice.organization_id || null,
        })
        .select("id")
        .single();

      return {
        success: false,
        reminderLogId: failedLog?.id,
        errorMessage: "nodemailer package is not installed",
      };
    }

    // Create nodemailer transport
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

    // Send email
    let sendError: Error | null = null;
    let sendSuccess = false;

    try {
      await transporter.sendMail({
        from: emailSettings.from_email
          ? emailSettings.from_name
            ? `${emailSettings.from_name} <${emailSettings.from_email}>`
            : emailSettings.from_email
          : undefined,
        to: invoice.client.email,
        subject,
        text: emailBody,
      });
      sendSuccess = true;
    } catch (err) {
      sendError = err instanceof Error ? err : new Error(String(err));
      console.error("[sendInvoiceReminder] email send error", err);
    }

    // Log reminder to reminders table (always log, regardless of success/failure)
    const { data: reminderLog, error: insertError } = await supabase
      .from("reminders")
      .insert({
        workspace_id: invoice.workspace_id,
        invoice_id: invoice.id,
        client_id: invoice.client_id || null,
        template_id: template.id,
        channel: "email",
        subject,
        body: emailBody,
        status: sendSuccess ? "sent" : "failed",
        sent_at: sendSuccess ? new Date().toISOString() : null,
        last_error: sendError ? sendError.message : null,
        error_message: sendError ? sendError.message : null,
        type: "reminder",
        organization_id: invoice.organization_id || null,
      })
      .select("id")
      .single();

    if (insertError) {
      console.error("[sendInvoiceReminder] Failed to log reminder:", insertError);
      // Return error but don't throw - email may have been sent but logging failed
      return {
        success: sendSuccess,
        errorMessage: sendSuccess
          ? "Email sent but failed to log reminder"
          : sendError?.message || "Failed to send email and failed to log reminder",
      };
    }

    if (!sendSuccess) {
      return {
        success: false,
        reminderLogId: reminderLog?.id,
        errorMessage: sendError?.message || "Failed to send email",
      };
    }

    return {
      success: true,
      reminderLogId: reminderLog?.id,
    };
  } catch (error) {
    // Catch any unhandled errors and log to reminders table if possible
    console.error("[sendInvoiceReminder] Unhandled error:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);

    try {
      const supabase = await supabaseServer();
      const { data: failedLog } = await supabase
        .from("reminders")
        .insert({
          workspace_id: invoice.workspace_id,
          invoice_id: invoice.id,
          client_id: invoice.client_id || null,
          template_id: template.id,
          channel: "email",
          subject: template.subject,
          body: template.body,
          status: "failed",
          sent_at: null,
          error_message: errorMessage,
          last_error: errorMessage,
          type: "reminder",
          organization_id: invoice.organization_id || null,
        })
        .select("id")
        .single();

      return {
        success: false,
        reminderLogId: failedLog?.id,
        errorMessage,
      };
    } catch (logError) {
      // Even logging failed - return error but don't throw
      console.error("[sendInvoiceReminder] Failed to log error reminder:", logError);
      return {
        success: false,
        errorMessage,
      };
    }
  }
}

