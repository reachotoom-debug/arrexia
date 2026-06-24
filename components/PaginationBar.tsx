"use client";

import Link from "next/link";

type QueryParams = Record<string, string | string[] | undefined>;

interface PaginationBarProps {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  itemLabel: string;
  onPageChange?: (page: number) => void;
  basePath?: string;
  queryParams?: QueryParams;
  pageParamKey?: string;
}

type PageToken = number | "...";

function buildPageTokens(currentPage: number, totalPages: number): PageToken[] {
  if (totalPages <= 5) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  if (currentPage <= 3) {
    return [1, 2, 3, 4, "...", totalPages];
  }

  if (currentPage >= totalPages - 2) {
    return [1, "...", totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
  }

  return [1, "...", currentPage - 1, currentPage, currentPage + 1, "...", totalPages];
}

function buildHref(
  basePath: string,
  queryParams: QueryParams | undefined,
  page: number,
  pageParamKey: string
): string {
  const params = new URLSearchParams();

  if (queryParams) {
    for (const [key, value] of Object.entries(queryParams)) {
      if (value === undefined) continue;
      const resolved = Array.isArray(value) ? value[0] : value;
      if (!resolved) continue;
      params.set(key, resolved);
    }
  }

  if (page <= 1) {
    params.delete(pageParamKey);
  } else {
    params.set(pageParamKey, String(page));
  }

  const query = params.toString();
  return query ? `${basePath}?${query}` : basePath;
}

export function PaginationBar({
  currentPage,
  totalPages,
  totalItems,
  itemLabel,
  onPageChange,
  basePath,
  queryParams,
  pageParamKey = "page",
}: PaginationBarProps) {
  if (totalPages <= 1) return null;

  const safePage = Math.min(Math.max(currentPage, 1), totalPages);
  const tokens = buildPageTokens(safePage, totalPages);
  const canPrev = safePage > 1;
  const canNext = safePage < totalPages;

  const renderNavButton = (label: string, targetPage: number, disabled: boolean) => {
    const className =
      "rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium " +
      (disabled ? "cursor-not-allowed opacity-40" : "hover:bg-slate-50");

    if (disabled) {
      return (
        <span className={className} aria-disabled="true">
          {label}
        </span>
      );
    }

    if (onPageChange) {
      return (
        <button type="button" onClick={() => onPageChange(targetPage)} className={className}>
          {label}
        </button>
      );
    }

    if (!basePath) return null;
    return (
      <Link href={buildHref(basePath, queryParams, targetPage, pageParamKey)} className={className}>
        {label}
      </Link>
    );
  };

  return (
    <div className="flex items-center justify-between pt-2 text-xs text-slate-600">
      <div>
        Page {safePage} of {totalPages} · {totalItems} {itemLabel}
      </div>
      <div className="flex items-center gap-2">
        {renderNavButton("Previous", safePage - 1, !canPrev)}
        {tokens.map((token, idx) => {
          if (token === "...") {
            return (
              <span key={`ellipsis-${idx}`} className="px-1 text-slate-400">
                ...
              </span>
            );
          }

          const isActive = token === safePage;
          const pageClass =
            "min-w-8 rounded-lg border px-2 py-1.5 text-center text-xs font-medium " +
            (isActive
              ? "border-blue-600 bg-blue-50 text-blue-700"
              : "border-slate-200 text-slate-700 hover:bg-slate-50");

          if (onPageChange) {
            return (
              <button key={token} type="button" onClick={() => onPageChange(token)} className={pageClass}>
                {token}
              </button>
            );
          }

          if (!basePath) return null;
          return (
            <Link
              key={token}
              href={buildHref(basePath, queryParams, token, pageParamKey)}
              className={pageClass}
              aria-current={isActive ? "page" : undefined}
            >
              {token}
            </Link>
          );
        })}
        {renderNavButton("Next", safePage + 1, !canNext)}
      </div>
    </div>
  );
}
