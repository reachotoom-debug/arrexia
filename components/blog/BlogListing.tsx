"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { BlogCategoryNav } from "@/components/blog/BlogCategoryNav";
import { BlogFeaturedPost } from "@/components/blog/BlogFeaturedPost";
import { BlogPostCard } from "@/components/blog/BlogPostCard";
import { trackBlogSearch } from "@/lib/analytics/google";
import { filterBlogPosts, type BlogListPost } from "@/lib/blog/search";

type BlogListingProps = {
  posts: BlogListPost[];
  featuredSlug: string | null;
};

export function BlogListing({ posts, featuredSlug }: BlogListingProps) {
  const [query, setQuery] = useState("");
  const trimmedQuery = query.trim();
  const isSearching = trimmedQuery.length > 0;

  const filteredPosts = useMemo(
    () => filterBlogPosts(posts, query),
    [posts, query],
  );

  const featuredPost = featuredSlug
    ? posts.find((post) => post.slug === featuredSlug)
    : undefined;

  const recentPosts = featuredPost
    ? posts.filter((post) => post.slug !== featuredPost.slug)
    : posts;

  const lastTrackedQueryRef = useRef("");

  useEffect(() => {
    if (!trimmedQuery) {
      lastTrackedQueryRef.current = "";
      return;
    }

    const timer = window.setTimeout(() => {
      if (lastTrackedQueryRef.current === trimmedQuery) return;
      lastTrackedQueryRef.current = trimmedQuery;
      trackBlogSearch({
        query_length: trimmedQuery.length,
        result_count: filteredPosts.length,
      });
    }, 600);

    return () => window.clearTimeout(timer);
  }, [trimmedQuery, filteredPosts.length]);

  function clearSearch() {
    setQuery("");
  }

  return (
    <>
      <div className="mx-auto mt-10 max-w-3xl">
        <label htmlFor="blog-search" className="sr-only">
          Search blog articles
        </label>
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
            aria-hidden="true"
          />
          <input
            id="blog-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search articles..."
            className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-11 pr-12 text-sm text-slate-900 shadow-sm outline-none ring-blue-600 transition-shadow placeholder:text-slate-400 focus:border-blue-600 focus:ring-2"
          />
          {isSearching ? (
            <button
              type="button"
              onClick={clearSearch}
              className="absolute right-3 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          ) : null}
        </div>
      </div>

      <BlogCategoryNav className="mt-6" />

      {isSearching ? (
        <section className="mt-10" aria-live="polite">
          {filteredPosts.length > 0 ? (
            <>
              <p className="text-sm text-slate-600">
                {filteredPosts.length} article{filteredPosts.length === 1 ? "" : "s"} found
              </p>
              <div className="mt-6 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
                {filteredPosts.map((post) => (
                  <BlogPostCard key={post.slug} post={post} />
                ))}
              </div>
            </>
          ) : (
            <div className="mx-auto max-w-lg rounded-2xl border border-slate-200 bg-slate-50 px-6 py-10 text-center">
              <h2 className="text-lg font-semibold text-slate-900">No articles found</h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                Try searching for invoices, reminders, collections, or cash flow.
              </p>
              <button
                type="button"
                onClick={clearSearch}
                className="mt-5 inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:border-slate-300 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
              >
                Clear search
              </button>
            </div>
          )}
        </section>
      ) : featuredPost ? (
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
            <h2 className="text-2xl font-semibold tracking-tight text-slate-900">Recent articles</h2>
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
    </>
  );
}
