"use server";

import { supabaseServer } from "@/lib/supabase/server";
import { getWorkspaceEmailSettings } from "@/lib/settings/email";
import { resolveReminderTemplateForInvoice } from "@/lib/reminders/resolve-template";
import { renderReminderTemplate } from "@/lib/reminders/render";
import { revalidatePath } from "next/cache";
import { Resend } from "resend";
import { Database } from "@/types/supabase";

type Db = Database["public"]["Tables"];
type InvoiceRow = Db["invoices"]["Row"];

// Simple date helpers (no date-fns dependency)
function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function differenceInCalendarDays(dateLeft: Date, dateRight: Date): number {
  const msPerDay = 1000 * 60 * 60 * 24;
  const left = startOfDay(dateLeft);
  const right = startOfDay(dateRight);
  return Math.round((left.getTime() - right.getTime()) / msPerDay);
}

const resend = new Resend(process.env.RESEND_API_KEY);

type SendReminderInput = {
  workspaceId: string;
  invoiceId: string;
  explicitTemplateId?: string | null;
};

export async function sendReminderAction(input: SendReminderInput) {
  const { workspaceId, invoiceId } = input;

  if (!process.env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY is not configured");
  }

  const supabase = await supabaseServer();

  // 1) Load invoice + client
  const { data: invoice, error: invoiceError } = await supabase
    .from("invoices")
    .select(
      `
      *,
      client:clients (
        id,
        name,
        email
      )
      `
    )
    .eq("workspace_id", workspaceId)
    .eq("id", invoiceId)
    .maybeSingle();

  if (invoiceError || !invoice) {
    console.error("[sendReminderAction] invoice error", {
      message: (invoiceError as any)?.message,
      code: (invoiceError as any)?.code,
    });
    throw new Error("Failed to load invoice");
  }

  const client = invoice.client;
  if (!client?.email) {
    throw new Error("Client email is missing; cannot send reminder.");
  }

  if (!invoice.due_date) {
    throw new Error("Invoice has no due date; cannot determine reminder rule.");
  }

  // 2) Compute daysFromDue
  const today = startOfDay(new Date());
  const due = startOfDay(new Date(invoice.due_date as any));
  const daysFromDue = differenceInCalendarDays(today, due);

  // 3) Workspace email settings (from_name / from_email)
  const settings = await getWorkspaceEmailSettings(workspaceId);

  // 4) Resolve template + render
  const { template } = await resolveReminderTemplateForInvoice(
    workspaceId,
    invoice as InvoiceRow,
    daysFromDue
  );

  const rendered = renderReminderTemplate({
    template,
    invoice,
    client,
  });

  // 5) Determine recipient (sandbox override)
  //const sandboxTo = process.env.RESEND_SANDBOX_TO;
  //const toAddress = sandboxTo && sandboxTo.length > 0
  //  ? sandboxTo
   // : client.email;

//added in sand box by mohammed
// 5) Always route emails to your inbox while in sandbox mode
// Resend will reject ANY non-verified email.
const SANDBOX_EMAIL = process.env.RESEND_SANDBOX_TO ?? "reachotoom@gmail.com"; // fallback safety
const toAddress = SANDBOX_EMAIL; // <-- FORCE OVERRIDE, ignore client.email completely


  // 6) Use a safe "from" for Resend when no domain is configured.
  // Resend allows onboarding@resend.dev as a test sender.
  const baseFrom = "onboarding@resend.dev";
  const fromHeader = settings?.from_name
    ? `${settings.from_name} <${baseFrom}>`
    : baseFrom;

  const { data, error } = await resend.emails.send({
    from: fromHeader,
    to: toAddress,
    subject: rendered.subject,
    html: rendered.html,
  });

  if (error) {
    console.error("[sendReminderAction] Resend error", error);

    // Resend sandbox limitation:
    if (
      error.statusCode === 403 &&
      error.name === "validation_error" &&
      typeof error.message === "string" &&
      error.message.includes("You can only send testing emails")
    ) {
      return {
        ok: false,
        code: "resend_sandbox_limit",
        message:
          "Resend sandbox limitation:\n\nYou can only send test emails to your own email address (reachotoom@gmail.com).",
      };
    }

    return {
      ok: false,
      code: "resend_error",
      message: error.message ?? "Failed to send reminder email.",
    };
  }

  // On success, write a row into reminder_history
  try {
    await supabase.from("reminder_history").insert({
      workspace_id: workspaceId,
      invoice_id: invoice.id,
      client_id: client.id,
      template_id: template.id,
      channel: "email",
      status: "sent",
      error_message: null,
      sent_at: new Date().toISOString(),
    } as any);
  } catch (historyError: any) {
    console.error("[sendReminderAction] history insert error", {
      message: historyError?.message,
      code: historyError?.code,
    });
  }

  revalidatePath(`/${workspaceId}/reminders`);

  // success
  return {
    ok: true,
    message: "Reminder sent successfully.",
  };
}
