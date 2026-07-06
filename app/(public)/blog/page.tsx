import Link from "next/link";
import { BlogListing } from "@/components/blog/BlogListing";
import { NewsletterSignup } from "@/components/newsletter/NewsletterSignup";
import { PublicPageShell } from "@/components/public/PublicPageShell";
import { getAllBlogPosts } from "@/lib/blog";
import { toBlogListPost } from "@/lib/blog/search";
import { buildPageMetadata } from "@/lib/seo/metadata";

export const metadata = buildPageMetadata("blog");

export default function BlogPage() {
  const posts = getAllBlogPosts().map(toBlogListPost);

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

        <BlogListing posts={posts} />

        <NewsletterSignup source="blog" className="mt-16" />
      </main>
    </PublicPageShell>
  );
}
