import type { BlogPost } from "@/lib/blog/types";
import { BLOG_IMAGES } from "@/lib/blog/assets";

export const howToReduceOverdueInvoices: BlogPost = {
  slug: "how-to-reduce-overdue-invoices",
  title: "How to Reduce Overdue Invoices Without Damaging Client Relationships",
  excerpt:
    "A practical framework for overdue invoice management: visibility, timing, escalation, and follow-up workflows that protect cash flow and client trust.",
  category: "Collections",
  categoryLabel: "Collections",
  author: "Mohammed Otoom",
  authorRole: "Founder of Arrexia",
  publishedAt: "2026-06-10",
  readTimeMinutes: 8,
  coverImage: BLOG_IMAGES.overdueInvoices.cover,
  coverImageAlt: "Dashboard view of overdue invoices and aging balances for collections follow-up",
  inArticleImage: BLOG_IMAGES.overdueInvoices.inline,
  inArticleImageAlt: "Finance team reviewing overdue invoice list and payment reminder schedule",
  seoTitle: "How to Reduce Overdue Invoices | Overdue Invoice Management Guide",
  seoDescription:
    "Learn practical overdue invoice management tactics—tracking, reminder timing, escalation paths, and cash flow visibility—to get paid faster.",
  relatedSlugs: ["invoice-reminder-email-best-practices", "what-is-accounts-receivable-automation"],
  sections: [
    {
      type: "paragraph",
      text: "Late payments are rarely a surprise when you look at the data—they are usually the result of unclear follow-up, missing visibility, or inconsistent collections habits. Overdue invoice management is less about pressure and more about building a repeatable process your team can trust.",
    },
    {
      type: "heading",
      level: 2,
      text: "Start with invoice tracking you can act on",
    },
    {
      type: "paragraph",
      text: "You cannot reduce overdue balances if you do not know what is outstanding. Invoice tracking should answer four questions at a glance: who owes you, how much, how long it has been overdue, and what follow-up has already happened. Spreadsheets break down quickly once volume grows. Accounts receivable software like Arrexia helps teams keep clients, invoices, payments, and reminder history in one workspace instead of scattered files.",
    },
    {
      type: "heading",
      level: 2,
      text: "Define reminder timing before invoices go overdue",
    },
    {
      type: "callout",
      title: "Quick win",
      text: "Teams that define reminder timing upfront typically see fewer awkward conversations later—because follow-up feels expected, not personal.",
    },
    {
      type: "paragraph",
      text: "The best collections process starts before a due date passes. Send a friendly pre-due reminder, a clear due-date notice, and a structured overdue sequence. Invoice reminder software works best when messages are predictable—not random check-ins sent when someone finally notices an aging balance.",
    },
    {
      type: "list",
      items: [
        "3–5 days before due date: confirm amount, due date, and payment method.",
        "On due date: short, professional nudge with invoice reference.",
        "7, 14, and 30 days overdue: escalate tone gradually while staying factual.",
        "60+ days overdue: move to a direct conversation or formal collections path.",
      ],
    },
    {
      type: "heading",
      level: 2,
      text: "Segment clients by risk, not just age",
    },
    {
      type: "paragraph",
      text: "Not every overdue invoice deserves the same treatment. A first-time late payer with a strong history needs a different message than a chronic slow payer. Use payment history, invoice size, and prior reminder responses to prioritize outreach. Cash flow management improves when you focus effort on the balances that matter most this week.",
    },
    {
      type: "heading",
      level: 2,
      text: "Make payment easy in every reminder",
    },
    {
      type: "paragraph",
      text: "Friction causes delays. Every reminder should include the invoice number, amount due, due date, accepted payment methods, and a direct contact for questions. If clients have to hunt for details, you will wait longer—even when they intend to pay.",
    },
    {
      type: "heading",
      level: 2,
      text: "Document every touchpoint",
    },
    {
      type: "paragraph",
      text: "Collections breaks down when follow-up lives in individual inboxes. Log calls, emails, and internal notes against the invoice. Reminder history creates accountability across the team and prevents duplicate or conflicting messages.",
    },
    {
      type: "heading",
      level: 2,
      text: "Review aging weekly",
    },
    {
      type: "paragraph",
      text: "Block 30 minutes each week to review overdue buckets: 1–30, 31–60, and 60+ days. Assign owners, confirm next actions, and escalate stalled accounts. Weekly rhythm beats monthly panic when you are protecting cash flow.",
    },
    {
      type: "heading",
      level: 2,
      text: "When to consider accounts receivable automation",
    },
    {
      type: "paragraph",
      text: "Manual follow-up works at small scale. As client count grows, accounts receivable automation helps you send consistent reminders, track outcomes, and surface overdue balances without rebuilding the process in email every month. Tools like Arrexia are built for that operational layer—not to replace relationships, but to make follow-up reliable.",
    },
  ],
};
