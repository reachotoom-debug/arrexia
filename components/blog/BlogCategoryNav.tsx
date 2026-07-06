import Link from "next/link";
import {
  BLOG_CATEGORIES,
  getBlogCategoryPath,
  type BlogCategorySlug,
} from "@/lib/blog/categories";

type BlogCategoryNavProps = {
  activeSlug?: BlogCategorySlug | null;
  className?: string;
};

function categoryLinkClass(isActive: boolean): string {
  const base =
    "inline-flex shrink-0 items-center rounded-full border px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2";

  return isActive
    ? `${base} border-blue-600 bg-blue-600 text-white`
    : `${base} border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:text-slate-900`;
}

export function BlogCategoryNav({ activeSlug = null, className = "" }: BlogCategoryNavProps) {
  const isAllActive = !activeSlug;

  return (
    <nav
      aria-label="Blog categories"
      className={`mx-auto max-w-7xl ${className}`.trim()}
    >
      <div className="-mx-1 overflow-x-auto px-1 pb-1">
        <ul className="flex w-max min-w-full gap-2 sm:w-auto sm:flex-wrap">
          <li>
            <Link href="/blog" className={categoryLinkClass(isAllActive)} aria-current={isAllActive ? "page" : undefined}>
              All
            </Link>
          </li>
          {BLOG_CATEGORIES.map((category) => {
            const isActive = activeSlug === category.slug;

            return (
              <li key={category.slug}>
                <Link
                  href={getBlogCategoryPath(category.slug)}
                  className={categoryLinkClass(isActive)}
                  aria-current={isActive ? "page" : undefined}
                >
                  {category.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
