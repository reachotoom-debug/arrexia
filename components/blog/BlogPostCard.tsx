import Link from "next/link";
import type { BlogPost } from "@/lib/blog/types";

type BlogPostCardProps = {
  post: BlogPost;
};

function formatPublishedDate(isoDate: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(isoDate));
}

export function BlogPostCard({ post }: BlogPostCardProps) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex flex-wrap items-center gap-2 text-xs font-medium uppercase tracking-wide text-slate-500">
        <span className="rounded-full bg-blue-50 px-2.5 py-1 text-blue-700">{post.category}</span>
        <span>{formatPublishedDate(post.publishedAt)}</span>
      </div>
      <h2 className="mt-4 text-xl font-semibold tracking-tight text-slate-900">
        <Link href={`/blog/${post.slug}`} className="hover:text-blue-700">
          {post.title}
        </Link>
      </h2>
      <p className="mt-3 text-sm leading-relaxed text-slate-600">{post.excerpt}</p>
      <p className="mt-4 text-sm text-slate-500">By {post.author}</p>
      <Link
        href={`/blog/${post.slug}`}
        className="mt-4 inline-block text-sm font-medium text-blue-600 hover:text-blue-700"
      >
        Read article →
      </Link>
    </article>
  );
}

export { formatPublishedDate };
