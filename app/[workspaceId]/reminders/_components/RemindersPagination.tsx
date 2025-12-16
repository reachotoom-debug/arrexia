"use client";

import { useRouter, usePathname } from "next/navigation";
import { useSearchParams } from "next/navigation";

interface RemindersPaginationProps {
  workspaceId: string;
  page: number;
  pageCount: number;
  total: number;
  searchParams: Record<string, string | string[] | undefined>;
}

export function RemindersPagination({
  workspaceId,
  page,
  pageCount,
  total,
  searchParams,
}: RemindersPaginationProps) {
  const router = useRouter();
  const pathname = usePathname();
  const currentSearchParams = useSearchParams();

  const goToPage = (nextPage: number) => {
    const params = new URLSearchParams(currentSearchParams.toString());
    if (nextPage === 1) {
      params.delete("page");
    } else {
      params.set("page", String(nextPage));
    }
    router.replace(`${pathname}${params.toString() ? `?${params.toString()}` : ""}`);
  };

  if (pageCount <= 1) {
    return null;
  }

  const start = total === 0 ? 0 : (page - 1) * 10 + 1;
  const end = Math.min(page * 10, total);

  return (
    <div className="flex items-center justify-between pt-2 text-xs text-slate-600">
      <div>
        {total === 0
          ? "No reminders"
          : `Showing ${start}–${end} of ${total} reminder${total !== 1 ? "s" : ""}`}
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => goToPage(page - 1)}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Previous
        </button>
        <button
          type="button"
          disabled={page >= pageCount}
          onClick={() => goToPage(page + 1)}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Next
        </button>
      </div>
    </div>
  );
}

