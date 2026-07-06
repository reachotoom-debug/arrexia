import type { Metadata } from "next";
import { getAllBlogPosts, getBlogPost } from "@/lib/blog";
import {
  getBlogCategory,
  getBlogCategoryPath,
  getBlogCategoryTitle,
  isBlogCategorySlug,
  type BlogCategory,
} from "@/lib/blog/categories";
import type { BlogListPost } from "@/lib/blog/search";
import { BLOG_COVER_HEIGHT, BLOG_COVER_WIDTH } from "@/lib/blog/assets";
import { buildPublicPageMetadata } from "@/lib/seo/metadata";
import { buildBlogPostingSchema, buildBreadcrumbSchema } from "@/lib/seo/structured-data";
import { absoluteUrl } from "@/lib/seo/site";

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

export function buildBlogCategoryMetadata(slug: string): Metadata {
  if (!isBlogCategorySlug(slug)) {
    return {
      title: { absolute: "Category Not Found | Arrexia Blog" },
      robots: { index: false, follow: false },
    };
  }

  const category = getBlogCategory(slug);
  if (!category) {
    return {
      title: { absolute: "Category Not Found | Arrexia Blog" },
      robots: { index: false, follow: false },
    };
  }

  return buildPublicPageMetadata({
    title: getBlogCategoryTitle(category.slug),
    description: category.seoDescription,
    path: getBlogCategoryPath(category.slug),
  });
}

export function buildBlogCategoryStructuredData(
  category: BlogCategory,
  posts: BlogListPost[],
): Record<string, unknown>[] {
  const categoryPath = getBlogCategoryPath(category.slug);

  return [
    buildBreadcrumbSchema([
      { name: "Home", path: "/" },
      { name: "Blog", path: "/blog" },
      { name: category.label, path: categoryPath },
    ]),
    {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: `${category.label} Articles`,
      description: category.seoDescription,
      url: absoluteUrl(categoryPath),
      mainEntity: {
        "@type": "ItemList",
        numberOfItems: posts.length,
        itemListElement: posts.map((post, index) => ({
          "@type": "ListItem",
          position: index + 1,
          name: post.title,
          url: absoluteUrl(`/blog/${post.slug}`),
        })),
      },
    },
  ];
}

export { getAllBlogPosts, getBlogPost };
