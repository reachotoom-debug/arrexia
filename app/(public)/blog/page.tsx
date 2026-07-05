import Link from "next/link";
import { BlogPostCard } from "@/components/blog/BlogPostCard";
import { PublicPageShell } from "@/components/public/PublicPageShell";
import { getAllBlogPosts } from "@/lib/blog";
import { buildPageMetadata } from "@/lib/seo/metadata";

export const metadata = buildPageMetadata("blog");

export default function BlogPage() {
  const posts = getAllBlogPosts();

  return (
    <PublicPageShell>
      <main className="mx-auto max-w-5xl px-4 py-16 sm:px-6 sm:py-20">
        <div className="max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-wide text-blue-600">Arrexia Blog</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
            Accounts receivable, invoice reminders, and cash flow
          </h1>
          <p className="mt-4 text-lg leading-relaxed text-slate-600">
            Practical guides on invoice tracking, overdue invoice management, payment reminders, and
            accounts receivable automation for growing businesses.
          </p>
          <p className="mt-4 text-sm text-slate-600">
            Need a quick metric? Try our{" "}
            <Link href="/tools/dso-calculator" className="font-medium text-blue-600 hover:text-blue-700">
              free DSO calculator
            </Link>
            .
          </p>
        </div>

        <div className="mt-12 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {posts.map((post) => (
            <BlogPostCard key={post.slug} post={post} />
          ))}
        </div>
      </main>
    </PublicPageShell>
  );
}
