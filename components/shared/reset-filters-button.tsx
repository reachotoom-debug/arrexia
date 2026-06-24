"use client";

import { useRouter } from "next/navigation";
import { secondaryGhostToolbarClass } from "@/components/ui/cta-styles";

interface ResetFiltersButtonProps {
  basePath: string; // e.g. `/${workspaceId}/invoices` or `/${workspaceId}/clients`
}

/**
 * Unified "Reset filters" button that clears all search/filter/sort params
 * and navigates to the canonical URL with all defaults explicitly set
 * For clients: status=active&view=default&sort=created_at&dir=desc&page=1&pageSize=10 (matches list defaults + badge logic)
 * For invoices: status=all&view=default&sort=issue_date&dir=desc&page=1&pageSize=10
 */
export function ResetFiltersButton({ basePath }: ResetFiltersButtonProps) {
  const router = useRouter();

  const handleReset = () => {
    // Build canonical URL with all defaults explicitly set
    if (basePath.includes("/clients")) {
      // Match clients list defaults (see clients page redirect): active + default view, no search/displayView in URL.
      const params = new URLSearchParams();
      params.set("status", "active");
      params.set("view", "default");
      params.set("sort", "created_at");
      params.set("dir", "desc");
      params.set("page", "1");
      params.set("pageSize", "10");
      router.push(`${basePath}?${params.toString()}`);
    } else if (basePath.includes("/reminders")) {
      // For reminders page: explicitly set view=default&status=all&page=1
      const params = new URLSearchParams();
      params.set("view", "default");
      params.set("status", "all");
      params.set("page", "1");
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
      className={secondaryGhostToolbarClass}
    >
      Reset filters
    </button>
  );
}

