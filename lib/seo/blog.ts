import type { Metadata } from "next";
import { getAllBlogPosts, getBlogPost } from "@/lib/blog";
import { BLOG_COVER_HEIGHT, BLOG_COVER_WIDTH } from "@/lib/blog/assets";
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
    image: {
      url: post.coverImage,
      alt: post.coverImageAlt,
      width: BLOG_COVER_WIDTH,
      height: BLOG_COVER_HEIGHT,
    },
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
    image: post.coverImage,
  });
}

export { getAllBlogPosts, getBlogPost };
