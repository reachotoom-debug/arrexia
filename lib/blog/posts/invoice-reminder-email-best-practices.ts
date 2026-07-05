import type { BlogPost } from "@/lib/blog/types";

export const invoiceReminderEmailBestPractices: BlogPost = {
  slug: "invoice-reminder-email-best-practices",
  title: "Invoice Reminder Email Best Practices That Actually Get Responses",
  excerpt:
    "Write invoice reminder emails that are clear, professional, and effective—without sounding aggressive or damaging long-term client relationships.",
  category: "Reminders",
  author: "Mohammed Otoom",
  publishedAt: "2026-06-18",
  seoTitle: "Invoice Reminder Email Best Practices | Payment Reminder Templates",
  seoDescription:
    "Improve invoice reminder emails with proven structure, timing, tone, and follow-up practices for overdue invoice management and faster collections.",
  relatedSlugs: ["how-to-reduce-overdue-invoices", "what-is-accounts-receivable-automation"],
  sections: [
    {
      type: "paragraph",
      text: "Most unpaid invoices are not disputes—they are distractions. Your client forgot, misplaced the invoice, or deprioritized payment behind other work. Invoice reminder software helps you send the right message at the right time, but the content still matters. A good reminder email is short, specific, and easy to act on.",
    },
    {
      type: "heading",
      level: 2,
      text: "Use a subject line that gets opened",
    },
    {
      type: "paragraph",
      text: "Avoid vague subjects like \"Following up\" or \"Quick question.\" Lead with the invoice reference and due context so accounts payable can route it quickly.",
    },
    {
      type: "list",
      items: [
        "Invoice #1042 — payment due June 15",
        "Reminder: Invoice #1042 ($4,200) — 7 days overdue",
        "Action needed: outstanding balance on Invoice #1042",
      ],
    },
    {
      type: "heading",
      level: 2,
      text: "Open with context, not confrontation",
    },
    {
      type: "paragraph",
      text: "Start with a neutral greeting and one sentence of context. Assume good intent. A professional tone preserves the relationship while making payment the obvious next step.",
    },
    {
      type: "paragraph",
      text: "Example: \"Hi Sarah, I hope your week is going well. This is a friendly reminder that Invoice #1042 for $4,200 was due on June 15 and is currently outstanding.\"",
    },
    {
      type: "heading",
      level: 2,
      text: "Include a payment summary block",
    },
    {
      type: "paragraph",
      text: "Make key details scannable. A summary table or bullet list reduces back-and-forth and speeds up approval.",
    },
    {
      type: "list",
      items: [
        "Invoice number and issue date",
        "Amount due (and currency)",
        "Original due date and days overdue",
        "Accepted payment methods",
        "Billing contact or AP email if different from the recipient",
      ],
    },
    {
      type: "heading",
      level: 2,
      text: "Match tone to overdue stage",
    },
    {
      type: "paragraph",
      text: "Early reminders should sound helpful. Later reminders should be direct but still professional. Escalation is about clarity, not aggression.",
    },
    {
      type: "list",
      items: [
        "Before due date: confirm details and offer help.",
        "1–14 days overdue: polite reminder with invoice attached or linked.",
        "15–30 days overdue: request confirmation of payment status and timeline.",
        "30+ days overdue: state next steps if payment is not received by a specific date.",
      ],
    },
    {
      type: "heading",
      level: 2,
      text: "Attach the invoice every time",
    },
    {
      type: "paragraph",
      text: "Do not assume the original invoice is easy to find. Reattach the PDF or include a secure link. Missing attachments are one of the most common reasons reminder emails stall in AP queues.",
    },
    {
      type: "heading",
      level: 2,
      text: "Send from a recognizable sender",
    },
    {
      type: "paragraph",
      text: "Use a consistent from-name and reply-to address your clients recognize—your company name or finance team, not a no-reply address that blocks questions. If you use accounts receivable software, keep branding consistent across invoice and reminder emails.",
    },
    {
      type: "heading",
      level: 2,
      text: "Automate the sequence, personalize when needed",
    },
    {
      type: "paragraph",
      text: "Automated reminder sequences improve consistency. Personalize only when context requires it—a disputed line item, a known delay, or a strategic account. Arrexia supports reminder workflows and history so your team can automate routine follow-up and intervene manually when relationships need a human touch.",
    },
    {
      type: "heading",
      level: 2,
      text: "Track what was sent and what happened next",
    },
    {
      type: "paragraph",
      text: "Invoice tracking is incomplete without reminder history. Record sends, replies, and promised payment dates. That visibility improves cash flow management and prevents your team from sending duplicate reminders that frustrate clients.",
    },
  ],
};
