"use client";

import { useRouter } from "next/navigation";
import { getPrefsStorageKey, type ListType } from "@/lib/preferences";

interface ResetSortButtonProps {
  basePath: string; // e.g. `/${workspaceId}/invoices`
  searchParams: Record<string, string | string[] | undefined>;
  workspaceId?: string;
  listType?: ListType; // "invoices", "clients", "payments", etc.
  onReset?: () => void; // Optional callback for additional reset logic (e.g., layout state)
}

export function ResetSortButton({
  basePath,
  searchParams,
  workspaceId,
  listType,
  onReset,
}: ResetSortButtonProps) {
  const router = useRouter();

  function handleReset() {
    // Call optional reset callback first (e.g., to reset layout state)
    if (onReset) {
      onReset();
    }
    // Clear localStorage preferences if workspaceId and listType are provided
    if (typeof window !== "undefined" && workspaceId && listType) {
      const key = getPrefsStorageKey(workspaceId, listType);
      window.localStorage.removeItem(key);
    }

    const params = new URLSearchParams();

    // For invoices, set default sort/view/status but preserve clientId filter
    if (listType === "invoices") {
      params.set("sortBy", "issue_date");
      params.set("sortDir", "desc");
      params.set("status", "all");
      params.set("page", "1");
      // Preserve clientId if present
      const clientId = Array.isArray(searchParams.clientId)
        ? searchParams.clientId[0]
        : searchParams.clientId;
      if (clientId) {
        params.set("clientId", clientId);
      }
    } else if (listType === "clients") {
      // For clients, reset EVERYTHING to defaults: no view, no sort, status=all, no search
      // Navigate to completely clean URL (no params) to ensure no re-application of filters
      router.push(basePath);
      return;
    } else {
      // For other list types, preserve filters/search but RESET sort, view, and page
      Object.entries(searchParams).forEach(([key, value]) => {
        if (key === "sortBy" || key === "sortDir" || key === "view" || key === "page") return;
        if (value && value !== "" && value !== "all") {
          if (Array.isArray(value)) {
            value.forEach((v) => params.append(key, v));
          } else {
            params.set(key, value);
          }
        }
      });

      // Reset page to 1
      params.set("page", "1");
    }

    const query = params.toString();
    router.push(query ? `${basePath}?${query}` : basePath);
  }

  return (
    <button
      type="button"
      onClick={handleReset}
      className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-3 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50 transition-colors"
    >
      <span className="text-[12px]">⟲</span>
      <span>Reset sort</span>
    </button>
  );
}

