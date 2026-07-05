import Image from "next/image";
import Link from "next/link";
import { Linkedin } from "lucide-react";
import { BLOG_AUTHOR, AUTHOR_AVATAR_SIZES } from "@/lib/blog/author";
import type { BlogPost } from "@/lib/blog/types";
import { getAuthorRole } from "@/lib/blog/format";

type AuthorAvatarProps = {
  size?: keyof typeof AUTHOR_AVATAR_SIZES;
  className?: string;
};

export function AuthorAvatar({ size = "card", className = "" }: AuthorAvatarProps) {
  const pixelSize = AUTHOR_AVATAR_SIZES[size];

  return (
    <Image
      src={BLOG_AUTHOR.avatar}
      alt={`${BLOG_AUTHOR.name}, ${BLOG_AUTHOR.role}`}
      width={pixelSize}
      height={pixelSize}
      className={`rounded-full border-2 border-white object-cover shadow-md ${className}`.trim()}
      style={{ width: pixelSize, height: pixelSize }}
    />
  );
}

type BlogAuthorBlockProps = {
  post?: BlogPost;
  size?: keyof typeof AUTHOR_AVATAR_SIZES;
  className?: string;
};

export function BlogAuthorBlock({
  post,
  size = "card",
  className = "",
}: BlogAuthorBlockProps) {
  const name = post?.author ?? BLOG_AUTHOR.name;
  const role = post ? getAuthorRole(post) : BLOG_AUTHOR.role;

  return (
    <div className={`flex items-center gap-3 ${className}`.trim()}>
      <AuthorAvatar size={size} />
      <div>
        <p className="text-sm font-semibold text-slate-900">{name}</p>
        <p className="text-sm text-slate-500">{role}</p>
      </div>
    </div>
  );
}

export function BlogAboutAuthor() {
  return (
    <section className="mt-14 rounded-3xl border border-slate-200 bg-slate-50 p-6 sm:p-8">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
        <AuthorAvatar size="about" className="shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            About the author
          </p>
          <h2 className="mt-2 text-xl font-semibold text-slate-900">{BLOG_AUTHOR.name}</h2>
          <p className="mt-1 text-sm font-medium text-slate-600">{BLOG_AUTHOR.role}</p>
          <p className="mt-4 text-sm leading-relaxed text-slate-600">{BLOG_AUTHOR.aboutBio}</p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <a
              href={BLOG_AUTHOR.linkedIn}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:border-slate-300 hover:text-slate-900"
            >
              <Linkedin className="h-4 w-4" aria-hidden="true" />
              LinkedIn
            </a>
            <Link
              href="/blog"
              className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:border-slate-300 hover:text-slate-900"
            >
              View all articles
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

export { formatPublishedDate, formatReadTime } from "@/lib/blog/format";
