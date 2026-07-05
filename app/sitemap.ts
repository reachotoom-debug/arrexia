import type { MetadataRoute } from "next";
import { getAllBlogPosts } from "@/lib/blog";
import { PUBLIC_SITEMAP_PAGE_IDS, SEO_PAGES } from "@/lib/seo/pages";
import { SEO_SITE, absoluteUrl } from "@/lib/seo/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const staticPages = PUBLIC_SITEMAP_PAGE_IDS.map((pageId) => {
    const page = SEO_PAGES[pageId];

    return {
      url: absoluteUrl(page.path),
      lastModified: new Date(),
      changeFrequency: page.changeFrequency,
      priority: page.priority,
    };
  });

  const blogPosts = getAllBlogPosts().map((post) => ({
    url: absoluteUrl(`/blog/${post.slug}`),
    lastModified: new Date(post.updatedAt ?? post.publishedAt),
    changeFrequency: post.changeFrequency ?? "monthly",
    priority: post.priority ?? 0.6,
  }));

  return [...staticPages, ...blogPosts];
}
