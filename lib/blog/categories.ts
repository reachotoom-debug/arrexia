export const BLOG_CATEGORY_SLUGS = [
  "accounts-receivable",
  "invoices",
  "payment-reminders",
  "collections",
  "cash-flow",
  "automation",
] as const;

export type BlogCategorySlug = (typeof BLOG_CATEGORY_SLUGS)[number];

export type BlogCategory = {
  slug: BlogCategorySlug;
  label: string;
  /** Short hero introduction shown on the category page. */
  intro: string;
  /** Meta description for SEO and Open Graph. */
  seoDescription: string;
};

export const BLOG_CATEGORIES: BlogCategory[] = [
  {
    slug: "accounts-receivable",
    label: "Accounts Receivable",
    intro:
      "Guides on accounts receivable workflows, visibility, and building a receivables process that gets you paid faster.",
    seoDescription:
      "Learn about accounts receivable, invoice collections, payment reminders, and cash flow best practices.",
  },
  {
    slug: "invoices",
    label: "Invoices",
    intro:
      "Practical advice on receivables documentation, billing clarity, and reducing friction from issue to payment.",
    seoDescription:
      "Explore receivables and billing clarity tips, payment follow-up practices, and strategies to improve on-time collections.",
  },
  {
    slug: "payment-reminders",
    label: "Payment Reminders",
    intro:
      "Templates, timing, and tone for payment reminder emails that protect relationships and improve response rates.",
    seoDescription:
      "Learn invoice reminder email best practices, follow-up timing, and professional payment reminder strategies.",
  },
  {
    slug: "collections",
    label: "Collections",
    intro:
      "Frameworks for overdue invoice management, escalation, and collections without damaging client trust.",
    seoDescription:
      "Discover overdue invoice management tactics, collections workflows, and relationship-first follow-up strategies.",
  },
  {
    slug: "cash-flow",
    label: "Cash Flow",
    intro:
      "Insights on cash flow visibility, forecasting, and the receivables habits that keep your business healthy.",
    seoDescription:
      "Read about cash flow management, receivables visibility, and strategies to improve working capital.",
  },
  {
    slug: "automation",
    label: "Automation",
    intro:
      "How to automate accounts receivable workflows—from reminders to tracking—without adding unnecessary complexity.",
    seoDescription:
      "Learn what accounts receivable automation means, which workflows to automate first, and how to get started.",
  },
];

const categoryBySlug = new Map(BLOG_CATEGORIES.map((category) => [category.slug, category]));

export function isBlogCategorySlug(slug: string): slug is BlogCategorySlug {
  return BLOG_CATEGORY_SLUGS.includes(slug as BlogCategorySlug);
}

export function getBlogCategory(slug: string): BlogCategory | undefined {
  return categoryBySlug.get(slug as BlogCategorySlug);
}

export function getBlogCategoryPath(slug: BlogCategorySlug): string {
  return `/blog/category/${slug}`;
}

export function getBlogCategoryLabel(slug: BlogCategorySlug): string {
  return categoryBySlug.get(slug)?.label ?? slug;
}

export function getBlogCategoryTitle(slug: BlogCategorySlug): string {
  return `${getBlogCategoryLabel(slug)} Articles | Arrexia Blog`;
}
