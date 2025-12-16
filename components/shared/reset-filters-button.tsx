"use client";

import { useRouter } from "next/navigation";

interface ResetFiltersButtonProps {
  basePath: string; // e.g. `/${workspaceId}/invoices` or `/${workspaceId}/clients`
}

/**
 * Unified "Reset filters" button that clears all search/filter/sort params
 * and navigates to the canonical URL with all defaults explicitly set
 * For clients: status=all&view=default&sort=client_name&dir=asc&page=1&pageSize=10
 * For invoices: status=all&view=default&sort=issue_date&dir=desc&page=1&pageSize=10
 */
export function ResetFiltersButton({ basePath }: ResetFiltersButtonProps) {
  const router = useRouter();

  const handleReset = () => {
    // Build canonical URL with all defaults explicitly set
    if (basePath.includes("/clients")) {
      // Extract workspaceId from basePath
      const workspaceId = basePath.split("/")[1];
      const params = new URLSearchParams();
      params.set("status", "all");
      params.set("view", "default");
      params.set("sort", "client_name");
      params.set("dir", "asc");
      params.set("page", "1");
      params.set("pageSize", "10");
      router.push(`${basePath}?${params.toString()}`);
    } else {
      // For other pages (invoices, payments), navigate to base path
      // They will redirect to canonical URL if needed
      router.push(basePath);
    }
  };

  return (
    <button
      type="button"
      onClick={handleReset}
      className="h-9 rounded-lg border border-slate-200 px-3 text-xs text-slate-600 hover:bg-slate-50"
    >
      Reset filters
    </button>
  );
}

