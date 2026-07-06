import type { BlogPost } from "@/lib/blog/types";
import { getBlogCategoryLabel } from "@/lib/blog/categories";

/** Serializable blog post for listing/search (no article body sections). */
export type BlogListPost = Omit<BlogPost, "sections" | "relatedSlugs">;

export function toBlogListPost(post: BlogPost): BlogListPost {
  const { sections: _sections, relatedSlugs: _relatedSlugs, ...listPost } = post;
  return listPost;
}

function buildSearchHaystack(post: BlogListPost): string {
  return [
    post.title,
    post.excerpt,
    post.category,
    post.categoryLabel,
    getBlogCategoryLabel(post.categorySlug),
    post.slug,
    post.seoTitle,
    post.seoDescription,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function filterBlogPosts(posts: BlogListPost[], query: string): BlogListPost[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return posts;

  const terms = normalized.split(/\s+/).filter(Boolean);

  return posts.filter((post) => {
    const haystack = buildSearchHaystack(post);
    return terms.every((term) => haystack.includes(term));
  });
}
