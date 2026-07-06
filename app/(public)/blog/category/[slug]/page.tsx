import Link from "next/link";
import { notFound } from "next/navigation";
import { BlogCategoryViewTracker } from "@/components/analytics/BlogCategoryViewTracker";
import { BlogCategoryNav } from "@/components/blog/BlogCategoryNav";
import { BlogPostCard } from "@/components/blog/BlogPostCard";
import { NewsletterSignup } from "@/components/newsletter/NewsletterSignup";
import { PageBreadcrumb } from "@/components/public/PageBreadcrumb";
import { JsonLd } from "@/components/seo/JsonLd";
import { PublicPageShell } from "@/components/public/PublicPageShell";
import {
  getBlogCategory,
  getPostsByCategorySlug,
  isBlogCategorySlug,
  BLOG_CATEGORIES,
} from "@/lib/blog";
import { toBlogListPost } from "@/lib/blog/search";
import {
  buildBlogCategoryMetadata,
  buildBlogCategoryStructuredData,
} from "@/lib/seo/blog";

type BlogCategoryPageProps = {
  params: Promise<{ slug: string }>;
};

export function generateStaticParams() {
  return BLOG_CATEGORIES.map((category) => ({ slug: category.slug }));
}

export async function generateMetadata({ params }: BlogCategoryPageProps) {
  const { slug } = await params;
  return buildBlogCategoryMetadata(slug);
}

export default async function BlogCategoryPage({ params }: BlogCategoryPageProps) {
  const { slug } = await params;

  if (!isBlogCategorySlug(slug)) {
    notFound();
  }

  const category = getBlogCategory(slug);
  if (!category) {
    notFound();
  }

  const posts = getPostsByCategorySlug(slug).map(toBlogListPost);
  const structuredData = buildBlogCategoryStructuredData(category, posts);

  return (
    <PublicPageShell>
      <BlogCategoryViewTracker categorySlug={slug} />
      {structuredData.length > 0 ? <JsonLd data={structuredData} /> : null}
      <main className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20">
        <PageBreadcrumb
          items={[
            { label: "Home", href: "/" },
            { label: "Blog", href: "/blog" },
            { label: category.label },
          ]}
        />

        <section className="mx-auto mt-8 max-w-3xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-blue-600">
            Category
          </p>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl lg:text-5xl lg:leading-tight">
            {category.label}
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-slate-600">
            {category.intro}
          </p>
          <p className="mt-4 text-sm text-slate-500">
            {posts.length} article{posts.length === 1 ? "" : "s"}
          </p>
        </section>

        <BlogCategoryNav activeSlug={category.slug} className="mt-8" />

        {posts.length > 0 ? (
          <section className="mt-10">
            <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
              {posts.map((post) => (
                <BlogPostCard key={post.slug} post={post} />
              ))}
            </div>
          </section>
        ) : (
          <section className="mt-10">
            <div className="mx-auto max-w-lg rounded-2xl border border-slate-200 bg-slate-50 px-6 py-10 text-center">
              <p className="text-lg font-semibold text-slate-900">No articles available yet.</p>
              <Link
                href="/blog"
                className="mt-5 inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:border-slate-300 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
              >
                Back to Blog
              </Link>
            </div>
          </section>
        )}

        <NewsletterSignup source={`blog-category-${slug}`} className="mt-16" />
      </main>
    </PublicPageShell>
  );
}
