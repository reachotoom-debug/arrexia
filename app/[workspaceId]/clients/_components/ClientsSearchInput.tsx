"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

interface ClientsSearchInputProps {
  workspaceId: string;
  initialSearch?: string;
}

/**
 * Live search input that updates URL params as user types
 * Matches Payments page behavior for live filtering
 */
export function ClientsSearchInput({
  workspaceId,
  initialSearch = "",
}: ClientsSearchInputProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [searchTerm, setSearchTerm] = useState(initialSearch);

  // Sync with URL params when they change externally
  // Support both "q" (new) and "search" (legacy) for backward compatibility
  useEffect(() => {
    const urlSearch = searchParams.get("q") || searchParams.get("search") || "";
    setSearchTerm(urlSearch);
  }, [searchParams]);

  const updateSearch = useCallback(
    (value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      
      if (value.trim()) {
        params.set("q", value.trim());
      } else {
        params.delete("q");
      }
      
      // Remove legacy "search" param if present
      params.delete("search");
      
      // Reset to page 1 when searching
      params.delete("page");
      
      const query = params.toString();
      router.push(`/${workspaceId}/clients${query ? `?${query}` : ""}`);
    },
    [router, workspaceId, searchParams]
  );

  // Debounce search updates
  useEffect(() => {
    const currentSearch = searchParams.get("q") || searchParams.get("search") || "";
    if (searchTerm === currentSearch) {
      return; // Already in sync with URL
    }

    const timer = setTimeout(() => {
      updateSearch(searchTerm);
    }, 300); // 300ms debounce

    return () => clearTimeout(timer);
  }, [searchTerm, searchParams, updateSearch]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
  };

  return (
    <input
      type="text"
      value={searchTerm}
      onChange={handleChange}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          updateSearch(searchTerm);
        }
      }}
      placeholder="Search name, email, company..."
      className="h-9 min-w-[260px] rounded-lg border border-slate-200 px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-0"
    />
  );
}

