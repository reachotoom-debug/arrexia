import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { BlogThumbnailImage } from "@/components/blog/BlogImage";
import { BlogAuthorBlock } from "@/components/blog/BlogAuthor";
import { BlogPostMeta } from "@/components/blog/BlogPostMeta";
import type { BlogListPost } from "@/lib/blog/search";

type BlogPostCardProps = {
  post: BlogListPost;
};

export function BlogPostCard({ post }: BlogPostCardProps) {
  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md">
      <Link
        href={`/blog/${post.slug}`}
        className="block shrink-0"
        aria-label={`Read article: ${post.title}`}
      >
        <BlogThumbnailImage
          src={post.coverImage}
          alt={post.coverImageAlt}
          className="aspect-[16/10] w-full"
        />
      </Link>

      <div className="flex min-h-0 flex-1 flex-col p-6">
        <BlogPostMeta post={post} />
        <h2 className="mt-4 line-clamp-2 text-xl font-semibold tracking-tight text-slate-900">
          <Link href={`/blog/${post.slug}`} className="hover:text-blue-700">
            {post.title}
          </Link>
        </h2>
        <p className="mt-3 line-clamp-3 flex-1 text-sm leading-relaxed text-slate-600">
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
