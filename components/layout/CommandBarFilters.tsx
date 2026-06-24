"use client";

import * as React from "react";
import Link from "next/link";
import { SlidersHorizontal, X } from "lucide-react";

export function CommandBarFilters({
  summary,
  activeCount = 0,
  clearAllHref,
  panelTitle = "Filters",
  children,
}: {
  summary?: React.ReactNode;
  activeCount?: number;
  clearAllHref?: string;
  panelTitle?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  const showBadge = activeCount > 0;

  React.useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <>
      <div className="flex min-w-0 flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
        >
          <SlidersHorizontal className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />
          <span>Filters</span>
          {showBadge ? (
            <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-blue-600 px-1.5 py-0.5 text-[11px] font-semibold text-white">
              {activeCount}
            </span>
          ) : null}
        </button>
        {summary ? (
          <span className="hidden min-w-0 truncate text-xs text-slate-500 md:inline">
            {summary}
          </span>
        ) : null}
      </div>

      {open ? (
        <>
          <div
            className="fixed inset-0 z-50 bg-black/40"
            aria-hidden
            onClick={() => setOpen(false)}
          />
          <div
            className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-slate-200 bg-white shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="command-bar-filters-title"
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <h2
                id="command-bar-filters-title"
                className="text-lg font-semibold text-slate-900"
              >
                {panelTitle}
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
                aria-label="Close filters"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <div className="space-y-4">{children}</div>
            </div>
            <div className="sticky bottom-0 border-t border-slate-200 bg-white/95 p-4 backdrop-blur">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="inline-flex h-10 flex-1 items-center justify-center rounded-lg bg-blue-600 px-4 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700"
                >
                  Apply Filters
                </button>
                {clearAllHref ? (
                  <Link
                    href={clearAllHref}
                    onClick={() => setOpen(false)}
                    className="inline-flex h-10 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
                  >
                    Clear All
                  </Link>
                ) : (
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="inline-flex h-10 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
                  >
                    Clear All
                  </button>
                )}
              </div>
            </div>
          </div>
        </>
      ) : null}
    </>
  );
}
