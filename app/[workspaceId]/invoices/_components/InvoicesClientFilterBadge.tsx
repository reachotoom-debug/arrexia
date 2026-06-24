"use client";

import { useRouter, usePathname } from "next/navigation";

interface InvoicesClientFilterBadgeProps {
  clientName?: string | null;
}

export function InvoicesClientFilterBadge({
  clientName,
}: InvoicesClientFilterBadgeProps) {
  const router = useRouter();
  const pathname = usePathname();

  const handleClear = () => {
    // Get current search params
    const params = new URLSearchParams(window.location.search);
    params.delete("clientId");
    
    // Build new URL
    const query = params.toString();
    const newUrl = query ? `${pathname}?${query}` : pathname;
    
    // Navigate without clientId
    router.replace(newUrl);
  };

  return (
    <div className="flex items-center gap-2 text-xs text-slate-600">
      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1">
        <span className="text-slate-500">Filtered by:</span>
        <span className="font-medium text-slate-900">
          {clientName ?? "This client"}
        </span>
      </span>
      <button
        type="button"
        onClick={handleClear}
        className="text-blue-600 hover:underline"
      >
        Clear
      </button>
    </div>
  );
}

