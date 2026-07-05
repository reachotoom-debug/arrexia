import { notFound } from "next/navigation";
import { BlogArticleContent, BlogTableOfContents } from "@/components/blog/BlogArticleContent";
import { BlogAuthorBlock, BlogPostMeta } from "@/components/blog/BlogPostMeta";
import { BlogBreadcrumb } from "@/components/blog/BlogBreadcrumb";
import { BlogCoverImage } from "@/components/blog/BlogImage";
import { BlogCta } from "@/components/blog/BlogCta";
import { RelatedPosts } from "@/components/blog/RelatedPosts";
import { JsonLd } from "@/components/seo/JsonLd";
import { PublicPageShell } from "@/components/public/PublicPageShell";
import { getAllBlogPosts, getBlogPost, getRelatedPosts } from "@/lib/blog";
import { getCategoryLabel } from "@/lib/blog/format";
import { buildBlogPostMetadata, buildBlogPostStructuredData } from "@/lib/seo/blog";

type BlogPostPageProps = {
  params: Promise<{ slug: string }>;
};

export function generateStaticParams() {
  return getAllBlogPosts().map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({ params }: BlogPostPageProps) {
  const { slug } = await params;
  return buildBlogPostMetadata(slug);
}

export default async function BlogPostPage({ params }: BlogPostPageProps) {
  const { slug } = await params;
  const post = getBlogPost(slug);

  if (!post) {
    notFound();
  }

  const structuredData = buildBlogPostStructuredData(slug);
  const relatedPosts = getRelatedPosts(slug);

  return (
    <PublicPageShell>
      {structuredData ? <JsonLd data={structuredData} /> : null}
      <main className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16">
        <div className="mx-auto max-w-3xl">
          <BlogBreadcrumb postTitle={post.title} />

          <header className="mt-8">
            <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-blue-700">
              {getCategoryLabel(post)}
            </span>
            <h1 className="mt-5 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl lg:text-5xl lg:leading-tight">
              {post.title}
            </h1>
            <p className="mt-5 text-lg leading-relaxed text-slate-600 sm:text-xl">{post.excerpt}</p>

            <div className="mt-8 flex flex-col gap-5 border-y border-slate-200 py-5 sm:flex-row sm:items-center sm:justify-between">
              <BlogAuthorBlock post={post} />
              <BlogPostMeta post={post} />
            </div>
          </header>

          <BlogCoverImage
            src={post.coverImage}
            alt={post.coverImageAlt}
            priority
            className="mt-8 aspect-[16/9] w-full"
          />
        </div>

        <div className="mx-auto mt-12 grid max-w-6xl gap-10 xl:grid-cols-[minmax(0,1fr)_240px] xl:gap-14">
          <article className="min-w-0 max-w-3xl xl:max-w-none">
            <BlogArticleContent post={post} />
            <BlogCta />
            <RelatedPosts posts={relatedPosts} />
          </article>

          <BlogTableOfContents post={post} />
        </div>
      </main>
    </PublicPageShell>
  );
}
