import type { BlogPost } from "@/lib/blog/types";
import {
  formatPublishedDate,
  formatReadTime,
  getCategoryLabel,
} from "@/lib/blog/format";

type BlogPostMetaProps = {
  post: BlogPost;
  className?: string;
};

export function BlogPostMeta({ post, className = "" }: BlogPostMetaProps) {
  return (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-slate-500 ${className}`.trim()}>
      <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-blue-700">
        {getCategoryLabel(post)}
      </span>
      <time dateTime={post.publishedAt}>{formatPublishedDate(post.publishedAt)}</time>
      <span aria-hidden="true">·</span>
      <span>{formatReadTime(post.readTimeMinutes)}</span>
    </div>
  );
}

export { formatPublishedDate, formatReadTime };
