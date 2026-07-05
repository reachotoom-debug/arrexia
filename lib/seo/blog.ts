import type { Metadata } from "next";
import { getAllBlogPosts, getBlogPost } from "@/lib/blog";
import { buildPublicPageMetadata } from "@/lib/seo/metadata";
import { buildBlogPostingSchema } from "@/lib/seo/structured-data";

export function buildBlogPostMetadata(slug: string): Metadata {
  const post = getBlogPost(slug);
  if (!post) {
    return {
      title: { absolute: "Post Not Found | Arrexia Blog" },
      robots: { index: false, follow: false },
    };
  }

  return buildPublicPageMetadata({
    title: post.seoTitle,
    description: post.seoDescription,
    path: `/blog/${post.slug}`,
  });
}

export function buildBlogPostStructuredData(slug: string) {
  const post = getBlogPost(slug);
  if (!post) return null;

  return buildBlogPostingSchema({
    title: post.title,
    description: post.excerpt,
    slug: post.slug,
    publishedAt: post.publishedAt,
    modifiedAt: post.updatedAt,
  });
}

export { getAllBlogPosts, getBlogPost };
