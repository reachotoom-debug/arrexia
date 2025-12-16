"use client";

import { useRouter, usePathname } from "next/navigation";
import { useSearchParams } from "next/navigation";

interface PaymentsPaginationProps {
  currentPage: number;
  totalPages: number;
  totalItems: number;
}

export function PaymentsPagination({
  currentPage,
  totalPages,
  totalItems,
}: PaymentsPaginationProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const handlePageChange = (newPage: number) => {
    const sp = new URLSearchParams(searchParams.toString());
    if (newPage === 1) {
      sp.delete("page");
    } else {
      sp.set("page", String(newPage));
    }
    const queryString = sp.toString();
    router.push(`${pathname}${queryString ? `?${queryString}` : ""}`);
  };

  if (totalPages <= 1) {
    return null;
  }

  return (
    <div className="mt-4 flex items-center justify-between text-xs text-slate-600">
      <div>
        Page {currentPage} of {totalPages} · {totalItems} payment{totalItems !== 1 ? "s" : ""}
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={currentPage <= 1}
          onClick={() => handlePageChange(currentPage - 1)}
          className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Previous
        </button>
        <button
          type="button"
          disabled={currentPage >= totalPages}
          onClick={() => handlePageChange(currentPage + 1)}
          className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Next
        </button>
      </div>
    </div>
  );
}

