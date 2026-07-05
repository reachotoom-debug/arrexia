import type { Metadata } from "next";
import { buildPageMetadata, buildPublicPageMetadata } from "@/lib/seo/metadata";
import { buildBlogPostingSchema } from "@/lib/seo/structured-data";

export type BlogPost = {
  slug: string;
  title: string;
  description: string;
  publishedAt: string;
  updatedAt?: string;
  changeFrequency?: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
  priority?: number;
};

/** Future blog posts can be registered here without a CMS. */
export const BLOG_POSTS: BlogPost[] = [];

export function getBlogPost(slug: string): BlogPost | undefined {
  return BLOG_POSTS.find((post) => post.slug === slug);
}

export function getAllBlogPosts(): BlogPost[] {
  return [...BLOG_POSTS].sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
  );
}

export function buildBlogPostMetadata(slug: string): Metadata {
  const post = getBlogPost(slug);
  if (!post) {
    return {
      title: { absolute: "Post Not Found | Arrexia Blog" },
      robots: { index: false, follow: false },
    };
  }

  return buildPublicPageMetadata({
    title: `${post.title} | Arrexia Blog`,
    description: post.description,
    path: `/blog/${post.slug}`,
  });
}

export function buildBlogPostStructuredData(slug: string) {
  const post = getBlogPost(slug);
  if (!post) return null;

  return buildBlogPostingSchema({
    title: post.title,
    description: post.description,
    slug: post.slug,
    publishedAt: post.publishedAt,
    modifiedAt: post.updatedAt,
  });
}

/** Shared blog index metadata for listing pages. */
export const blogIndexMetadata = buildPageMetadata("blog");
