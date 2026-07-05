import type { BlogPost } from "@/lib/blog/types";
import {
  formatPublishedDate,
  formatReadTime,
  getAuthorRole,
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

type BlogAuthorBlockProps = {
  post: BlogPost;
  className?: string;
};

export function BlogAuthorBlock({ post, className = "" }: BlogAuthorBlockProps) {
  return (
    <div className={`flex items-center gap-3 ${className}`.trim()}>
      {post.authorAvatar ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={post.authorAvatar}
          alt=""
          aria-hidden="true"
          className="h-11 w-11 rounded-full border border-slate-200 object-cover"
        />
      ) : (
        <div
          aria-hidden="true"
          className="flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-gradient-to-br from-blue-50 to-indigo-50 text-sm font-semibold text-blue-700"
        >
          {post.author
            .split(" ")
            .map((part) => part[0])
            .join("")
            .slice(0, 2)}
        </div>
      )}
      <div>
        <p className="text-sm font-semibold text-slate-900">{post.author}</p>
        <p className="text-sm text-slate-500">{getAuthorRole(post)}</p>
      </div>
    </div>
  );
}

export { formatPublishedDate, formatReadTime };
