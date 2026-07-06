import type { BlogCategorySlug } from "@/lib/blog/categories";

export type BlogPostSection =
  | { type: "heading"; level: 2 | 3; text: string }
  | { type: "paragraph"; text: string }
  | { type: "list"; items: string[] }
  | { type: "callout"; title: string; text: string };

export type BlogPost = {
  slug: string;
  title: string;
  excerpt: string;
  /** Primary launch category for routing, badges, and filtering. */
  categorySlug: BlogCategorySlug;
  category: string;
  /** Display label for category badges; falls back to `category`. */
  categoryLabel?: string;
  author: string;
  authorRole?: string;
  authorAvatar?: string;
  publishedAt: string;
  updatedAt?: string;
  readTimeMinutes: number;
  coverImage: string;
  coverImageAlt: string;
  inArticleImage?: string;
  inArticleImageAlt?: string;
  seoTitle: string;
  seoDescription: string;
  relatedSlugs: string[];
  sections: BlogPostSection[];
  featured?: boolean;
  changeFrequency?: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
  priority?: number;
};
