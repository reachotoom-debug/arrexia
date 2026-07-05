import { notFound } from "next/navigation";
import { BlogAboutAuthor, BlogAuthorBlock } from "@/components/blog/BlogAuthor";
import { BlogArticleContent, BlogTableOfContents } from "@/components/blog/BlogArticleContent";
import { BlogPostMeta } from "@/components/blog/BlogPostMeta";
import { BlogCoverImage } from "@/components/blog/BlogImage";
import { BlogCta } from "@/components/blog/BlogCta";
import { BlogShareLinks } from "@/components/blog/BlogShareLinks";
import { RelatedPosts } from "@/components/blog/RelatedPosts";
import { PageBreadcrumb } from "@/components/public/PageBreadcrumb";
import { JsonLd } from "@/components/seo/JsonLd";
import { PublicPageShell } from "@/components/public/PublicPageShell";
import { getAllBlogPosts, getBlogPost, getRelatedPosts } from "@/lib/blog";
import { getCategoryLabel } from "@/lib/blog/format";
import { buildBlogPostMetadata, buildBlogPostStructuredData } from "@/lib/seo/blog";
import { buildBreadcrumbSchema } from "@/lib/seo/structured-data";

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

  const blogSchema = buildBlogPostStructuredData(slug);
  const breadcrumbSchema = buildBreadcrumbSchema([
    { name: "Home", path: "/" },
    { name: "Blog", path: "/blog" },
    { name: post.title, path: `/blog/${post.slug}` },
  ]);
  const structuredData = [blogSchema, breadcrumbSchema].filter(
    (item) => item !== null,
  ) as Record<string, unknown>[];

  const relatedPosts = getRelatedPosts(slug);

  return (
    <PublicPageShell>
      {structuredData.length > 0 ? <JsonLd data={structuredData} /> : null}
      <main className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16">
        <div className="mx-auto max-w-3xl">
          <PageBreadcrumb
            items={[
              { label: "Home", href: "/" },
              { label: "Blog", href: "/blog" },
              { label: post.title },
            ]}
          />

          <header className="mt-8">
            <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-blue-700">
              {getCategoryLabel(post)}
            </span>
            <h1 className="mt-5 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl lg:text-5xl lg:leading-tight">
              {post.title}
            </h1>
            <p className="mt-5 text-lg leading-relaxed text-slate-600 sm:text-xl">{post.excerpt}</p>

            <div className="mt-8 flex flex-col gap-5 border-y border-slate-200 py-5 lg:flex-row lg:items-center lg:justify-between">
              <BlogAuthorBlock post={post} size="article" />
              <div className="flex flex-col gap-4 sm:items-end">
                <BlogPostMeta post={post} />
                <BlogShareLinks title={post.title} slug={post.slug} />
              </div>
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
            <BlogAboutAuthor />
            <BlogCta />
            <RelatedPosts posts={relatedPosts} />
          </article>

          <BlogTableOfContents post={post} />
        </div>
      </main>
    </PublicPageShell>
  );
}
