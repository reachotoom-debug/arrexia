import { BlogPostCard } from "@/components/blog/BlogPostCard";
import type { BlogListPost } from "@/lib/blog/search";

type BlogPostGridProps = {
  posts: BlogListPost[];
  className?: string;
};

/** Responsive blog listing grid: 1 col mobile, 2 tablet, 3 desktop. */
export const BLOG_POST_GRID_CLASS =
  "grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3";

export function BlogPostGrid({ posts, className = "" }: BlogPostGridProps) {
  return (
    <div className={`${BLOG_POST_GRID_CLASS} ${className}`.trim()}>
      {posts.map((post) => (
        <BlogPostCard key={post.slug} post={post} />
      ))}
    </div>
  );
}
