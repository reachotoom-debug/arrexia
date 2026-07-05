import { notFound } from "next/navigation";
import Link from "next/link";
import { BlogArticleContent } from "@/components/blog/BlogArticleContent";
import { BlogCta } from "@/components/blog/BlogCta";
import { RelatedPosts } from "@/components/blog/RelatedPosts";
import { formatPublishedDate } from "@/components/blog/BlogPostCard";
import { JsonLd } from "@/components/seo/JsonLd";
import { PublicPageShell } from "@/components/public/PublicPageShell";
import { getAllBlogPosts, getBlogPost, getRelatedPosts } from "@/lib/blog";
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
      <main className="mx-auto max-w-3xl px-4 py-16 sm:px-6 sm:py-20">
        <p className="text-sm font-medium text-blue-600">
          <Link href="/blog" className="hover:text-blue-700">
            ← Back to blog
          </Link>
        </p>

        <article className="mt-6">
          <div className="flex flex-wrap items-center gap-2 text-xs font-medium uppercase tracking-wide text-slate-500">
            <span className="rounded-full bg-blue-50 px-2.5 py-1 text-blue-700">{post.category}</span>
            <span>{formatPublishedDate(post.publishedAt)}</span>
            <span>By {post.author}</span>
          </div>

          <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
            {post.title}
          </h1>
          <p className="mt-4 text-lg leading-relaxed text-slate-600">{post.excerpt}</p>

          <BlogArticleContent sections={post.sections} />
          <BlogCta />
          <RelatedPosts posts={relatedPosts} />
        </article>
      </main>
    </PublicPageShell>
  );
}
