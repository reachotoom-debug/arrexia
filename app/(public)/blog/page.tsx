import Link from "next/link";
import { PublicPageShell } from "@/components/public/PublicPageShell";
import { buildPublicPageMetadata } from "@/lib/public/pageMetadata";

export const metadata = buildPublicPageMetadata({
  title: "Arrexia Blog | Product Updates & Insights",
  description: "Articles and updates from the Arrexia team on accounts receivable, cash flow, and getting paid faster.",
  path: "/blog",
});

export default function BlogPage() {
  return (
    <PublicPageShell>
      <main className="mx-auto max-w-3xl px-4 py-16 text-center sm:px-6 sm:py-24">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">Blog</h1>
        <p className="mx-auto mt-4 max-w-xl text-lg text-slate-600">
          Product updates, accounts receivable tips, and cash flow insights are on the way.
        </p>
        <p className="mt-8">
          <Link href="/contact" className="text-sm font-medium text-blue-600 hover:text-blue-700">
            Contact us
          </Link>
          <span className="text-slate-400"> · </span>
          <Link href="/" className="text-sm font-medium text-blue-600 hover:text-blue-700">
            Back to home
          </Link>
        </p>
      </main>
    </PublicPageShell>
  );
}
