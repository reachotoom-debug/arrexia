import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";

type InvoiceRow = Database["public"]["Tables"]["invoices"]["Row"];
type ClientRow = Database["public"]["Tables"]["clients"]["Row"];
type ReminderRuleRow = Database["public"]["Tables"]["reminder_rules"]["Row"];
type MessageTemplateRow = Database["public"]["Tables"]["message_templates"]["Row"];

export interface SuggestedReminder {
  invoice: InvoiceRow;
  client: ClientRow;
  daysOverdue: number;
  rule: ReminderRuleRow;
  template: MessageTemplateRow | null;
}

export interface TemplateContext {
  client_name: string;
  invoice_number: string;
  amount_due: string;
  due_date: string;
  days_overdue: string;
  payment_link: string;
}

/**
 * Calculate days overdue for an invoice based on due_date
 */
function calculateDaysOverdue(dueDate: string | null): number {
  if (!dueDate) return 0;
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const due = new Date(dueDate);
  due.setHours(0, 0, 0, 0);
  
  const diffMs = today.getTime() - due.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  
  return Math.max(0, diffDays);
}

/**
 * Check if a rule matches the days overdue criteria
 */
function ruleMatchesDaysOverdue(
  rule: ReminderRuleRow,
  daysOverdue: number
): boolean {
  const from = rule.days_overdue_from ?? 0;
  const to = rule.days_overdue_to;
  
  if (to === null) {
    // No upper bound, just check lower bound
    return daysOverdue >= from;
  }
  
  return daysOverdue >= from && daysOverdue <= to;
}

/**
 * Get suggested reminders for a workspace based on active reminder rules and overdue invoices
 */
export async function getSuggestedReminders(
  supabase: SupabaseClient<Database>,
  workspaceId: string
): Promise<SuggestedReminder[]> {
  try {
    // Step 1: Load active reminder rules for workspace, ordered by sort_order
    const { data: rules, error: rulesError } = await supabase
      .from("reminder_rules")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("is_active", true)
      .order("sort_order", { ascending: true });

    if (rulesError) {
      console.error("[getSuggestedReminders] failed to load reminder rules:", {
        error: rulesError,
        message: rulesError.message,
        code: rulesError.code,
      });
      throw new Error(`Failed to load reminder rules: ${rulesError.message}`);
    }

    if (!rules || rules.length === 0) {
      return [];
    }

    // DEBUG: Log loaded rules
    console.log("[Reminders][rules]", { workspaceId, count: rules?.length });

    // MVP: Use the first active rule for all overdue invoices
    const defaultRule = rules[0];
    if (!defaultRule) {
      console.log("[Reminders] No active rules for workspace", { workspaceId });
      return [];
    }

    // Step 2: Load templates referenced by rules
    const templateIds = rules
      .map((r) => r.template_id)
      .filter((id): id is string => id !== null);
    
    let templatesMap: Record<string, MessageTemplateRow> = {};
    
    if (templateIds.length > 0) {
      const { data: templates, error: templatesError } = await supabase
        .from("message_templates")
        .select("*")
        .in("id", templateIds);

      if (templatesError) {
        console.error("[getSuggestedReminders] failed to load templates:", {
          error: templatesError,
          message: templatesError.message,
          code: templatesError.code,
        });
        throw new Error(`Failed to load templates: ${templatesError.message}`);
      }

      if (templates) {
        templatesMap = templates.reduce((acc, template) => {
          acc[template.id] = template;
          return acc;
        }, {} as Record<string, MessageTemplateRow>);
      }
    }

    // Step 3: Load overdue invoices for workspace
    const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD format
    
    const { data: invoices, error: invoicesError } = await supabase
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
        outstanding_amount
      `)
      .eq("workspace_id", workspaceId)
      .gt("outstanding_amount", 0)
      .lt("due_date", today)
      .neq("status", "Void")
      .neq("status", "Draft");

    if (invoicesError) {
      console.error("[getSuggestedReminders] failed to load invoices:", {
        error: invoicesError,
        message: invoicesError.message,
        code: invoicesError.code,
      });
      throw new Error(`Failed to load invoices: ${invoicesError.message}`);
    }

    if (!invoices || invoices.length === 0) {
      return [];
    }

    // DEBUG: Log loaded invoices
    console.log("[Reminders][invoices]", { workspaceId, count: invoices?.length });

    // Step 4: Load clients for those invoices
    const clientIds = [...new Set(invoices.map((inv) => inv.client_id).filter(Boolean))];
    
    let clientsMap: Record<string, ClientRow> = {};
    
    if (clientIds.length > 0) {
      const { data: clients, error: clientsError } = await supabase
        .from("clients")
        .select("*")
        .in("id", clientIds);

      if (clientsError) {
        console.error("[getSuggestedReminders] failed to load clients:", {
          error: clientsError,
          message: clientsError.message,
          code: clientsError.code,
        });
        throw new Error(`Failed to load clients: ${clientsError.message}`);
      }

      if (clients) {
        clientsMap = clients.reduce((acc, client) => {
          acc[client.id] = client;
          return acc;
        }, {} as Record<string, ClientRow>);
      }
    }

    // Step 5: Build suggestions - MVP: use first rule for all overdue invoices
    const suggestions: SuggestedReminder[] = [];

    for (const invoice of invoices) {
      const client = clientsMap[invoice.client_id];
      if (!client) continue;

      const daysOverdue = calculateDaysOverdue(invoice.due_date);
      if (daysOverdue <= 0) continue;

      // DEBUG: Log each invoice with daysOverdue
      console.log("[Reminders][invoice]", {
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoice_number,
        daysOverdue,
        status: invoice.status,
      });

      // MVP: Use the first active rule for all overdue invoices
      // (Removed complex rule matching based on days_overdue_from/to ranges)
      const matchingRule = defaultRule;

      // Get template for this rule
      const template = matchingRule.template_id
        ? templatesMap[matchingRule.template_id] ?? null
        : null;

      // Always push a suggestion for this overdue invoice
      suggestions.push({
        invoice,
        client,
        daysOverdue,
        rule: matchingRule,
        template,
      });
    }

    // DEBUG: Log final suggestions count
    console.log("[Reminders] suggested built", {
      workspaceId,
      count: suggestions.length,
    });

    return suggestions;
  } catch (error) {
    console.error("[getSuggestedReminders] unexpected error:", error);
    throw error;
  }
}

/**
 * Render template body by replacing placeholders with context values
 */
export function renderTemplateBody(
  templateBody: string,
  context: TemplateContext
): string {
  let rendered = templateBody;

  // Replace all placeholders
  rendered = rendered.replace(/\{\{client_name\}\}/g, context.client_name);
  rendered = rendered.replace(/\{\{invoice_number\}\}/g, context.invoice_number);
  rendered = rendered.replace(/\{\{amount_due\}\}/g, context.amount_due);
  rendered = rendered.replace(/\{\{due_date\}\}/g, context.due_date);
  rendered = rendered.replace(/\{\{days_overdue\}\}/g, context.days_overdue);
  rendered = rendered.replace(/\{\{payment_link\}\}/g, context.payment_link);

  return rendered;
}

/**
 * Format invoice date using en-GB locale
 */
export function formatInvoiceDate(dateStr: string | null): string {
  if (!dateStr) return "";

  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-GB", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch (error) {
    console.error("[formatInvoiceDate] failed to format date:", dateStr, error);
    return dateStr;
  }
}

export type ReminderStage =
  | "before_due"
  | "overdue_soft"
  | "overdue_medium"
  | "overdue_hard"
  | "thank_you";

export type ReminderEmailContext = {
  clientName: string;
  invoiceNumber: string;
  amountDue: number | string | null;
  dueDateFormatted: string;
  daysOverdue: number | null;
};

export function getReminderStage(daysDiff: number | null): ReminderStage {
  // daysDiff = today - dueDate in days
  if (daysDiff === null) {
    return "overdue_soft";
  }
  if (daysDiff < 0) {
    return "before_due";
  }
  if (daysDiff <= 7) {
    return "overdue_soft";
  }
  if (daysDiff <= 20) {
    return "overdue_medium";
  }
  return "overdue_hard";
}

/**
 * Build subject + body for the given stage.
 * This is code-based, not DB-based, so MVP is robust even if templates table is empty.
 */
export function buildReminderEmail(
  stage: ReminderStage,
  ctx: ReminderEmailContext
): { subject: string; body: string } {
  const {
    clientName,
    invoiceNumber,
    amountDue,
    dueDateFormatted,
    daysOverdue,
  } = ctx;

  const safeClient = clientName || "Customer";
  const safeInvoice = invoiceNumber || "";
  const safeAmount = amountDue ?? "";
  const overduePart =
    daysOverdue !== null ? ` and is now ${daysOverdue} days overdue` : "";

  switch (stage) {
    case "before_due":
      return {
        subject: `Upcoming payment for invoice ${safeInvoice}`,
        body:
          `Dear ${safeClient},\n\n` +
          `Just a friendly reminder that invoice ${safeInvoice} for ${safeAmount} is due on ${dueDateFormatted}.\n\n` +
          `If you have already scheduled the payment, thank you and please ignore this message.\n\n` +
          `Best regards,\nFlowCollect`,
      };

    case "overdue_soft":
      return {
        subject: `Payment reminder for invoice ${safeInvoice}`,
        body:
          `Dear ${safeClient},\n\n` +
          `We hope you are well. This is a friendly reminder that invoice ${safeInvoice} for ${safeAmount} was due on ${dueDateFormatted}${overduePart}.\n\n` +
          `We would appreciate your prompt attention.\n\n` +
          `Thank you,\nFlowCollect`,
      };

    case "overdue_medium":
      return {
        subject: `Second reminder – invoice ${safeInvoice}`,
        body:
          `Dear ${safeClient},\n\n` +
          `This is a follow-up regarding invoice ${safeInvoice} for ${safeAmount}, which was due on ${dueDateFormatted}${overduePart}.\n\n` +
          `Please let us know if there is any issue with this payment or if you need an updated copy of the invoice.\n\n` +
          `Kind regards,\nFlowCollect`,
      };

    case "overdue_hard":
      return {
        subject: `Final notice – invoice ${safeInvoice}`,
        body:
          `Dear ${safeClient},\n\n` +
          `This is a final reminder regarding invoice ${safeInvoice} for ${safeAmount}, which was due on ${dueDateFormatted}${overduePart}.\n\n` +
          `To avoid any service interruptions or additional actions, please arrange payment as soon as possible or contact us to discuss.\n\n` +
          `Sincerely,\nFlowCollect`,
      };

    case "thank_you":
      return {
        subject: `Payment received – invoice ${safeInvoice}`,
        body:
          `Dear ${safeClient},\n\n` +
          `Thank you for your payment for invoice ${safeInvoice}. We appreciate your prompt response.\n\n` +
          `Best regards,\nFlowCollect`,
      };
  }
}

