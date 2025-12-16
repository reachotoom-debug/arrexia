"use client";

import { useEffect, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import { getPrefsStorageKey } from "@/lib/preferences";

interface ClientsPreferencesGateProps {
  workspaceId: string;
  searchParams: Record<string, string | string[] | undefined>;
}

export function ClientsPreferencesGate({
  workspaceId,
  searchParams,
}: ClientsPreferencesGateProps) {
  const router = useRouter();
  const pathname = usePathname();
  const hasHydratedRef = useRef(false);
  const lastUrlParamsRef = useRef<string>("");

  useEffect(() => {
    if (typeof window === "undefined") return;

    const KEY = getPrefsStorageKey(workspaceId, "clients");

    const currentSortBy = Array.isArray(searchParams.sortBy)
      ? searchParams.sortBy[0]
      : searchParams.sortBy;
    const currentSortDir = Array.isArray(searchParams.sortDir)
      ? searchParams.sortDir[0]
      : searchParams.sortDir;
    const currentView = Array.isArray(searchParams.view)
      ? searchParams.view[0]
      : searchParams.view;
    const currentStatus = Array.isArray(searchParams.status)
      ? searchParams.status[0]
      : searchParams.status;
    const currentSearch = Array.isArray(searchParams.q)
      ? searchParams.q[0]
      : searchParams.q;

    // Build a string representation of current filter params to detect changes
    const currentParams = [
      currentSortBy,
      currentSortDir,
      currentView,
      currentStatus,
      currentSearch,
    ].filter(Boolean).join("|");

    // If there is explicit sort/view in URL -> save to localStorage
    if (
      currentSortBy ||
      currentSortDir ||
      currentView ||
      currentStatus ||
      currentSearch
    ) {
      const prefs = {
        sortBy: currentSortBy,
        sortDir: currentSortDir,
        view: currentView,
        status: currentStatus,
        q: currentSearch,
      };
      window.localStorage.setItem(KEY, JSON.stringify(prefs));
      hasHydratedRef.current = true;
      lastUrlParamsRef.current = currentParams;
      return;
    }

    // No explicit prefs in URL
    // If we had params before and now we don't, it means user reset - don't load from localStorage
    if (lastUrlParamsRef.current && !currentParams) {
      // URL was cleared (reset) - mark as hydrated and don't load from localStorage
      hasHydratedRef.current = true;
      lastUrlParamsRef.current = "";
      return;
    }

    // Only load from localStorage on initial mount (when hasHydratedRef is false)
    if (hasHydratedRef.current) {
      return;
    }

    const raw = window.localStorage.getItem(KEY);
    if (!raw) {
      hasHydratedRef.current = true;
      return;
    }

    try {
      const prefs = JSON.parse(raw) as {
        sortBy?: string;
        sortDir?: string;
        view?: string;
        status?: string;
        q?: string;
      };

      const params = new URLSearchParams();

      if (prefs.sortBy) params.set("sortBy", prefs.sortBy);
      if (prefs.sortDir) params.set("sortDir", prefs.sortDir);
      if (prefs.view) params.set("view", prefs.view);
      if (prefs.status && prefs.status !== "all") params.set("status", prefs.status);
      if (prefs.q) params.set("q", prefs.q);

      // start at page 1 when restoring prefs
      params.set("page", "1");

      const query = params.toString();
      if (query) {
        router.replace(`${pathname}?${query}`);
      }
      hasHydratedRef.current = true;
      lastUrlParamsRef.current = [
        prefs.sortBy,
        prefs.sortDir,
        prefs.view,
        prefs.status,
        prefs.q,
      ].filter(Boolean).join("|");
    } catch {
      // ignore parse errors and do nothing
      hasHydratedRef.current = true;
    }
  }, [workspaceId, searchParams, router, pathname]);

  return null;
}

