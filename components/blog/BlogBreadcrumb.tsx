import Link from "next/link";
import { ChevronRight } from "lucide-react";

type BlogBreadcrumbProps = {
  postTitle: string;
};

export function BlogBreadcrumb({ postTitle }: BlogBreadcrumbProps) {
  return (
    <nav aria-label="Breadcrumb" className="text-sm text-slate-500">
      <ol className="flex flex-wrap items-center gap-1.5">
        <li>
          <Link href="/" className="hover:text-slate-900">
            Home
          </Link>
        </li>
        <li aria-hidden="true">
          <ChevronRight className="h-4 w-4" />
        </li>
        <li>
          <Link href="/blog" className="hover:text-slate-900">
            Blog
          </Link>
        </li>
        <li aria-hidden="true">
          <ChevronRight className="h-4 w-4" />
        </li>
        <li className="line-clamp-1 font-medium text-slate-700" aria-current="page">
          {postTitle}
        </li>
      </ol>
    </nav>
  );
}
