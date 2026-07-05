import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { BlogThumbnailImage } from "@/components/blog/BlogImage";
import { BlogPostMeta } from "@/components/blog/BlogPostMeta";
import type { BlogPost } from "@/lib/blog/types";

type RelatedPostsProps = {
  posts: BlogPost[];
};

export function RelatedPosts({ posts }: RelatedPostsProps) {
  if (posts.length === 0) return null;

  return (
    <section className="mt-14 border-t border-slate-200 pt-10">
      <h2 className="text-xl font-semibold tracking-tight text-slate-900">Related articles</h2>
      <div className="mt-6 grid gap-5 sm:grid-cols-2">
        {posts.map((post) => (
          <article
            key={post.slug}
            className="group overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-all hover:border-slate-300 hover:shadow-md"
          >
            <Link href={`/blog/${post.slug}`} aria-label={`Read related article: ${post.title}`}>
              <BlogThumbnailImage
                src={post.coverImage}
                alt={post.coverImageAlt}
                className="aspect-[16/10] w-full"
              />
            </Link>
            <div className="p-5">
              <BlogPostMeta post={post} />
              <h3 className="mt-3 text-base font-semibold text-slate-900">
                <Link href={`/blog/${post.slug}`} className="hover:text-blue-700">
                  {post.title}
                </Link>
              </h3>
              <Link
                href={`/blog/${post.slug}`}
                className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-blue-600 hover:text-blue-700"
              >
                Read article
                <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
