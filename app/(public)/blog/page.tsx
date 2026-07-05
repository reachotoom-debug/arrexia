import Link from "next/link";
import { BlogFeaturedPost } from "@/components/blog/BlogFeaturedPost";
import { BlogPostCard } from "@/components/blog/BlogPostCard";
import { PublicPageShell } from "@/components/public/PublicPageShell";
import { getAllBlogPosts, getFeaturedBlogPost } from "@/lib/blog";
import { buildPageMetadata } from "@/lib/seo/metadata";

export const metadata = buildPageMetadata("blog");

export default function BlogPage() {
  const posts = getAllBlogPosts();
  const featuredPost = getFeaturedBlogPost();
  const recentPosts = featuredPost
    ? posts.filter((post) => post.slug !== featuredPost.slug)
    : posts;

  return (
    <PublicPageShell>
      <main className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20">
        <section className="mx-auto max-w-3xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-blue-600">Blog</p>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl lg:text-5xl lg:leading-tight">
            Insights to help you improve cash flow and get paid faster
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-slate-600">
            Practical guides, best practices, and strategies for managing invoices, simplifying
            collections, and growing your business.
          </p>
          <p className="mt-4 text-sm text-slate-600">
            Need a quick metric? Try our{" "}
            <Link href="/tools/dso-calculator" className="font-medium text-blue-600 hover:text-blue-700">
              free DSO calculator
            </Link>
            .
          </p>
        </section>

        {featuredPost ? (
          <section className="mt-14">
            <BlogFeaturedPost post={featuredPost} />
          </section>
        ) : null}

        <section className="mt-16">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight text-slate-900">
                Recent articles
              </h2>
              <p className="mt-2 text-sm text-slate-600">
                Accounts receivable, reminders, and cash flow management.
              </p>
            </div>
          </div>

          <div className="mt-8 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {recentPosts.map((post) => (
              <BlogPostCard key={post.slug} post={post} />
            ))}
          </div>
        </section>
      </main>
    </PublicPageShell>
  );
}
