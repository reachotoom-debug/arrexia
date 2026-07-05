import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { BlogCoverImage } from "@/components/blog/BlogImage";
import { BlogAuthorBlock } from "@/components/blog/BlogAuthor";
import { BlogPostMeta } from "@/components/blog/BlogPostMeta";
import type { BlogPost } from "@/lib/blog/types";

type BlogFeaturedPostProps = {
  post: BlogPost;
};

export function BlogFeaturedPost({ post }: BlogFeaturedPostProps) {
  return (
    <article className="group overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-lg">
      <div className="grid lg:grid-cols-2">
        <Link
          href={`/blog/${post.slug}`}
          className="relative block min-h-[240px] lg:min-h-full"
          aria-label={`Read featured article: ${post.title}`}
        >
          <BlogCoverImage
            src={post.coverImage}
            alt={post.coverImageAlt}
            priority
            className="h-full min-h-[240px] rounded-none lg:min-h-[420px]"
            sizes="(max-width: 1024px) 100vw, 50vw"
          />
        </Link>

        <div className="flex flex-col justify-center p-8 sm:p-10 lg:p-12">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-600">Featured</p>
          <BlogPostMeta post={post} className="mt-4" />
          <h2 className="mt-5 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
            <Link href={`/blog/${post.slug}`} className="hover:text-blue-700">
              {post.title}
            </Link>
          </h2>
          <p className="mt-4 text-base leading-relaxed text-slate-600">{post.excerpt}</p>
          <BlogAuthorBlock post={post} className="mt-6" />
          <Link
            href={`/blog/${post.slug}`}
            className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-blue-600 hover:text-blue-700"
          >
            Read article
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </article>
  );
}
