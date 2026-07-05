import Link from "next/link";
import { PublicPageShell } from "@/components/public/PublicPageShell";
import { buildPageMetadata } from "@/lib/seo/metadata";

export const metadata = buildPageMetadata("blog");

export default function BlogPage() {
  return (
    <PublicPageShell>
      <main className="mx-auto max-w-3xl px-4 py-16 text-center sm:px-6 sm:py-24">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">Blog</h1>
        <p className="mx-auto mt-4 max-w-xl text-lg text-slate-600">
          Product updates, accounts receivable tips, invoice reminder strategies, and cash flow
          insights are on the way.
        </p>
        <p className="mt-8 text-sm text-slate-600">
          <Link href="/contact" className="font-medium text-blue-600 hover:text-blue-700">
            Contact us
          </Link>
          <span className="text-slate-400"> · </span>
          <Link href="/about" className="font-medium text-blue-600 hover:text-blue-700">
            About Arrexia
          </Link>
          <span className="text-slate-400"> · </span>
          <Link href="/" className="font-medium text-blue-600 hover:text-blue-700">
            Home
          </Link>
        </p>
      </main>
    </PublicPageShell>
  );
}
