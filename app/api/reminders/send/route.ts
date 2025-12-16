import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/server";
import {
  renderTemplateBody,
  formatInvoiceDate,
  buildReminderEmail,
  getReminderStage,
} from "@/lib/reminders";
import { formatMoney } from "@/lib/invoices/utils";
import type { Database } from "@/types/supabase";

type SendReminderPayload = {
  workspaceId: string;
  invoiceId: string;
};

type InvoiceRow = Database["public"]["Tables"]["invoices"]["Row"];
type ReminderRuleRow = Database["public"]["Tables"]["reminder_rules"]["Row"];
type MessageTemplateRow =
  Database["public"]["Tables"]["message_templates"]["Row"];

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Partial<SendReminderPayload>;

    if (!body.workspaceId || !body.invoiceId) {
      return NextResponse.json(
        { success: false, message: "Invalid payload" },
        { status: 400 }
      );
    }

    const workspaceId = body.workspaceId;
    const invoiceId = body.invoiceId;

    const { user } = await requireUser();
    const supabase = await supabaseServer();

    // 1) Load invoice + client
    const {
      data: invoice,
      error: invoiceError,
    } = await supabase
      .from("invoices")
      .select("*, clients(*)")
      .eq("workspace_id", workspaceId)
      .eq("id", invoiceId)
      .single();

    if (invoiceError || !invoice) {
      console.error("[RemindersAPI] invoiceError", invoiceError);
      return NextResponse.json(
        { success: false, message: "Invoice not found" },
        { status: 404 }
      );
    }

    // 2) Try to load first active rule
    const {
      data: rules,
      error: rulesError,
    } = await supabase
      .from("reminder_rules")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .limit(1);

    if (rulesError) {
      console.error("[RemindersAPI] rulesError", {
        message: rulesError.message,
        code: rulesError.code,
      });
    }

    const rule = (rules?.[0] as ReminderRuleRow | undefined) ?? null;

    console.log("[RemindersAPI] rule debug", {
      workspaceId,
      hasRule: !!rule,
      templateId: rule?.template_id ?? null,
    });

    let template: MessageTemplateRow | null = null;

    // 3) If we have a rule with template_id, load that template
    if (rule?.template_id) {
      const {
        data: t,
        error: templateError,
      } = await supabase
        .from("message_templates")
        .select("*")
        .eq("workspace_id", workspaceId)
        .eq("id", rule.template_id)
        .single();

      if (templateError) {
        console.error("[RemindersAPI] templateError", {
          message: templateError.message,
          code: templateError.code,
        });
      }

      template = (t as MessageTemplateRow) ?? null;
    }

    // 4) Fallback: if no rule or rule has no template or template not found,
    //    just use the first template for this workspace.
    if (!template) {
      const {
        data: fallbackTemplates,
        error: fallbackError,
      } = await supabase
        .from("message_templates")
        .select("*")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: true })
        .limit(1);

      if (fallbackError) {
        console.error("[RemindersAPI] fallbackError", {
          message: fallbackError.message,
          code: fallbackError.code,
        });
      }

      template = (fallbackTemplates?.[0] as MessageTemplateRow | undefined) ?? null;
    }

    // 5) Build subject/body using smart templates
    const today = new Date();
    const due = invoice.due_date ? new Date(invoice.due_date as string) : null;
    const daysDiff =
      due && !Number.isNaN(due.getTime())
        ? Math.floor((today.getTime() - due.getTime()) / (1000 * 60 * 60 * 24))
        : null;

    const clientName =
      (invoice.clients as Database["public"]["Tables"]["clients"]["Row"] | null)
        ?.name ?? "";
    const invoiceNumber = invoice.invoice_number ?? "";
    const amountDue = formatMoney(
      Number(invoice.outstanding_amount ?? invoice.amount ?? 0),
      invoice.currency ?? "USD"
    );
    const dueDateFormatted = formatInvoiceDate(
      invoice.due_date as string | null | undefined
    );

    // Use smart template system (code-based, always works)
    const stage = getReminderStage(daysDiff);
    const { subject: smartSubject, body: smartBody } = buildReminderEmail(stage, {
      clientName,
      invoiceNumber,
      amountDue,
      dueDateFormatted,
      daysOverdue: daysDiff,
    });

    // If DB template exists, use it as override (optional)
    let subject = smartSubject;
    let bodyRendered = smartBody;

    if (template) {
      console.log("[RemindersAPI] using DB template (overriding smart template)", {
        workspaceId,
        templateId: template.id,
        templateName: template.name,
      });

      const daysOverdueStr = daysDiff?.toString() ?? "0";
      const paymentLink = ""; // TODO: real payment link in future

      bodyRendered = renderTemplateBody(template.body ?? "", {
        client_name: clientName,
        invoice_number: invoiceNumber,
        amount_due: amountDue,
        due_date: dueDateFormatted,
        days_overdue: daysOverdueStr,
        payment_link: paymentLink,
      });

      // Use DB template subject if provided, otherwise keep smart template subject
      if (template.subject) {
        subject = template.subject;
      }
    } else {
      console.log("[RemindersAPI] using smart template (no DB template)", {
        workspaceId,
        stage,
      });
    }

    // TODO: integrate real email sending here later (SMTP).
    // For MVP we only log.

    const { error: insertError } = await supabase.from("reminders").insert({
      workspace_id: workspaceId,
      invoice_id: invoice.id,
      client_id: invoice.client_id,
      rule_id: rule?.id ?? null,
      template_id: template ? template.id : null,
      channel: "email",
      subject,
      body: bodyRendered,
      status: "sent",
      sent_at: new Date().toISOString(),
      // TODO: when we have real UUID auth users, store created_by = user.id
      created_by: null,
      organization_id: invoice.organization_id ?? null,
      type: "reminder",
    });

    if (insertError) {
      console.error("[RemindersAPI] insertError", {
        message: insertError.message,
        code: insertError.code,
      });
      return NextResponse.json(
        { success: false, message: "Failed to log reminder" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Reminder logged (email send simulated for MVP)",
    });
  } catch (err) {
    console.error("[RemindersAPI] unexpected error", err);
    return NextResponse.json(
      { success: false, message: "Unexpected error" },
      { status: 500 }
    );
  }
}
