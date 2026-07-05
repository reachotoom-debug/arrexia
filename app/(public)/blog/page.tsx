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
            Explore free calculators on our{" "}
            <Link href="/tools" className="font-medium text-blue-600 hover:text-blue-700">
              tools hub
            </Link>
            .
          </p>
        </section>

        {featuredPost ? (
          <section className="mt-14">
            <div className="grid gap-8 xl:grid-cols-12 xl:items-start">
              <div className="xl:col-span-7">
                <BlogFeaturedPost post={featuredPost} />
              </div>
              <div className="hidden xl:block xl:col-span-5">
                <div className="mb-5">
                  <h2 className="text-xl font-semibold tracking-tight text-slate-900">
                    Recent articles
                  </h2>
                  <p className="mt-2 text-sm text-slate-600">
                    More on invoice tracking, reminders, and cash flow.
                  </p>
                </div>
                <div className="grid gap-6">
                  {recentPosts.map((post) => (
                    <BlogPostCard key={post.slug} post={post} compact />
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-10 xl:hidden">
              <h2 className="text-2xl font-semibold tracking-tight text-slate-900">
                Recent articles
              </h2>
              <div className="mt-6 grid gap-6 md:grid-cols-2">
                {recentPosts.map((post) => (
                  <BlogPostCard key={post.slug} post={post} />
                ))}
              </div>
            </div>
          </section>
        ) : (
          <section className="mt-14">
            <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
              {recentPosts.map((post) => (
                <BlogPostCard key={post.slug} post={post} />
              ))}
            </div>
          </section>
        )}
      </main>
    </PublicPageShell>
  );
}
