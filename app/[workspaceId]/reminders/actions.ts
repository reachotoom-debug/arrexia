"use server";

import { revalidatePath } from "next/cache";
import { sendReminderForInvoice } from "@/lib/reminders/send";

type SendReminderInput = {
  workspaceId: string;
  invoiceId: string;
  explicitTemplateId?: string | null;
  /** Matched reminder rule when sending from Suggested Reminders (preserves occurrence). */
  ruleId?: string | null;
};

export async function sendReminderAction(input: SendReminderInput) {
  const { workspaceId, invoiceId, explicitTemplateId, ruleId = null } = input;

  try {
    // Use the shared sendReminderForInvoice function which handles:
    // - Loading invoice and client
    // - Validating client email and email settings
    // - Sending email via SMTP or Resend
    // - Always logging to reminders table
    const result = await sendReminderForInvoice({
      workspaceId,
      invoiceId,
      templateId: explicitTemplateId ?? null,
      ruleId,
      source: "manual",
      userId: null, // TODO: Add user ID when auth is available
    });

    revalidatePath(`/${workspaceId}/reminders`);

    return {
      ok: result.success,
      status: result.status,
      message: result.errorMessage || result.message || (result.success ? "Reminder sent successfully." : "Failed to send reminder"),
      reminderId: result.reminderLogId,
      error: result.errorMessage || undefined,
    };
  } catch (error) {
    console.error("[sendReminderAction] unexpected error:", {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      workspaceId,
      invoiceId,
    });

    return {
      ok: false,
      status: "failed",
      message: error instanceof Error ? error.message : "An unexpected error occurred",
      error: error instanceof Error ? error.message : "An unexpected error occurred",
    };
  }
}
