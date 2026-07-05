import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { BlogThumbnailImage } from "@/components/blog/BlogImage";
import { BlogAuthorBlock } from "@/components/blog/BlogAuthor";
import { BlogPostMeta } from "@/components/blog/BlogPostMeta";
import type { BlogPost } from "@/lib/blog/types";

type BlogPostCardProps = {
  post: BlogPost;
  compact?: boolean;
};

export function BlogPostCard({ post, compact = false }: BlogPostCardProps) {
  return (
    <article
      className={`group flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md ${
        compact ? "" : ""
      }`}
    >
      <Link
        href={`/blog/${post.slug}`}
        className="block"
        aria-label={`Read article: ${post.title}`}
      >
        <BlogThumbnailImage
          src={post.coverImage}
          alt={post.coverImageAlt}
          className={`w-full ${compact ? "aspect-[16/9]" : "aspect-[16/10]"}`}
        />
      </Link>

      <div className={`flex flex-1 flex-col ${compact ? "p-5" : "p-6"}`}>
        <BlogPostMeta post={post} />
        <h2
          className={`mt-4 font-semibold tracking-tight text-slate-900 ${
            compact ? "text-lg" : "text-xl"
          }`}
        >
          <Link href={`/blog/${post.slug}`} className="hover:text-blue-700">
            {post.title}
          </Link>
        </h2>
        <p
          className={`mt-3 flex-1 leading-relaxed text-slate-600 ${
            compact ? "line-clamp-3 text-sm" : "text-sm"
          }`}
        >
          {post.excerpt}
        </p>
        <BlogAuthorBlock post={post} className="mt-5" />
        <Link
          href={`/blog/${post.slug}`}
          className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-blue-600 hover:text-blue-700"
        >
          Read article
          <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
    </article>
  );
}

export { formatPublishedDate, formatReadTime } from "@/components/blog/BlogPostMeta";
