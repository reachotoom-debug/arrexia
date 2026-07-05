import Link from "next/link";
import type { BlogPost } from "@/lib/blog/types";

type RelatedPostsProps = {
  posts: BlogPost[];
};

export function RelatedPosts({ posts }: RelatedPostsProps) {
  if (posts.length === 0) return null;

  return (
    <section className="mt-12 border-t border-slate-200 pt-10">
      <h2 className="text-lg font-semibold text-slate-900">Related articles</h2>
      <ul className="mt-4 space-y-3">
        {posts.map((post) => (
          <li key={post.slug}>
            <Link
              href={`/blog/${post.slug}`}
              className="text-sm font-medium text-blue-600 hover:text-blue-700"
            >
              {post.title}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
