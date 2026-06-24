"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

type DisplayView = "list" | "cards";

interface ClientsViewToggleProps {
  workspaceId: string;
  currentView?: DisplayView;
}

export function ClientsViewToggle({ workspaceId, currentView }: ClientsViewToggleProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [displayView, setDisplayView] = useState<DisplayView>(currentView || "list");

  // Initialize from URL param or localStorage
  useEffect(() => {
    const urlView = searchParams.get("displayView") as DisplayView | null;
    if (urlView === "list" || urlView === "cards") {
      setDisplayView(urlView);
      // Persist to localStorage
      try {
        localStorage.setItem(`clients:view:${workspaceId}`, urlView);
      } catch {
        // ignore localStorage errors
      }
    } else {
      // Fall back to localStorage
      try {
        const stored = localStorage.getItem(`clients:view:${workspaceId}`);
        if (stored === "list" || stored === "cards") {
          setDisplayView(stored);
        }
      } catch {
        // ignore localStorage errors
      }
    }
  }, [workspaceId, searchParams]);

  const handleViewChange = (view: DisplayView) => {
    setDisplayView(view);
    
    // Update URL - preserve all existing params
    const params = new URLSearchParams(searchParams.toString());
    params.set("displayView", view);
    // Build full path with workspaceId
    router.push(`/${workspaceId}/clients?${params.toString()}`, { scroll: false });
    
    // Persist to localStorage
    try {
      localStorage.setItem(`clients:view:${workspaceId}`, view);
    } catch {
      // ignore localStorage errors
    }
  };

  return (
    <div className="flex items-center gap-1 rounded-full border border-slate-200 bg-white p-0.5">
      <button
        type="button"
        onClick={() => handleViewChange("list")}
        className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
          displayView === "list"
            ? "bg-slate-900 text-white"
            : "text-slate-600 hover:bg-slate-50"
        }`}
      >
        List
      </button>
      <button
        type="button"
        onClick={() => handleViewChange("cards")}
        className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
          displayView === "cards"
            ? "bg-slate-900 text-white"
            : "text-slate-600 hover:bg-slate-50"
        }`}
      >
        Cards
      </button>
    </div>
  );
}
