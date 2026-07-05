import type { BlogPost } from "@/lib/blog/types";
import { howToReduceOverdueInvoices } from "@/lib/blog/posts/how-to-reduce-overdue-invoices";
import { invoiceReminderEmailBestPractices } from "@/lib/blog/posts/invoice-reminder-email-best-practices";
import { whatIsAccountsReceivableAutomation } from "@/lib/blog/posts/what-is-accounts-receivable-automation";

export const BLOG_POSTS: BlogPost[] = [
  whatIsAccountsReceivableAutomation,
  invoiceReminderEmailBestPractices,
  howToReduceOverdueInvoices,
];

export function getBlogPost(slug: string): BlogPost | undefined {
  return BLOG_POSTS.find((post) => post.slug === slug);
}

export function getAllBlogPosts(): BlogPost[] {
  return [...BLOG_POSTS].sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
  );
}

export function getRelatedPosts(slug: string, limit = 2): BlogPost[] {
  const post = getBlogPost(slug);
  if (!post) return [];

  return post.relatedSlugs
    .map((relatedSlug) => getBlogPost(relatedSlug))
    .filter((item): item is BlogPost => Boolean(item))
    .slice(0, limit);
}
