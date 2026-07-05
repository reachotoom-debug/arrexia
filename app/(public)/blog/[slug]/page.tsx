import { notFound } from "next/navigation";
import Link from "next/link";
import { JsonLd } from "@/components/seo/JsonLd";
import { PublicPageShell } from "@/components/public/PublicPageShell";
import {
  buildBlogPostMetadata,
  buildBlogPostStructuredData,
  getBlogPost,
} from "@/lib/seo/blog";

type BlogPostPageProps = {
  params: Promise<{ slug: string }>;
};

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
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
            {post.title}
          </h1>
          <p className="mt-4 text-lg leading-relaxed text-slate-600">{post.description}</p>
          <p className="mt-8 text-sm text-slate-500">
            Full article content will appear here when blog publishing is enabled.
          </p>
        </article>
      </main>
    </PublicPageShell>
  );
}
