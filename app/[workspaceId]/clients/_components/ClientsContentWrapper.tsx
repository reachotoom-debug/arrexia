"use client";

import { useState, useEffect } from "react";
import { ClientsTable } from "./ClientsTable";
import { ClientsCards } from "./ClientsCards";
import { ResetSortButton } from "@/components/shared/reset-sort-button";

type ClientsLayout = "list" | "cards";

const DEFAULT_CLIENTS_LAYOUT: ClientsLayout = "list";
const LAYOUT_STORAGE_KEY = "flowcollect_clients_layout";

interface Client {
  id: string;
  name: string;
  company: string | null;
  email: string | null;
  whatsapp: string | null;
  country: string | null;
  payment_terms: number | null;
  status: string;
  invoicesCount?: number;
  outstanding?: number;
}

interface ClientsContentWrapperProps {
  clients: Client[];
  workspaceId: string;
  sortBy?: string;
  sortDir?: string;
  searchParams: Record<string, string | string[] | undefined>;
  view?: string;
  sortLabel: string;
  sortArrow: string;
}

export function ClientsContentWrapper({
  clients,
  workspaceId,
  sortBy,
  sortDir,
  searchParams,
  view,
  sortLabel,
  sortArrow,
}: ClientsContentWrapperProps) {
  const [layout, setLayout] = useState<ClientsLayout>(DEFAULT_CLIENTS_LAYOUT);

  // Load layout preference from localStorage on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        const stored = window.localStorage.getItem(LAYOUT_STORAGE_KEY);
        if (stored === "list" || stored === "cards") {
          setLayout(stored);
        }
      } catch {
        // ignore localStorage errors
      }
    }
  }, []);

  // Save layout preference to localStorage when it changes
  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(LAYOUT_STORAGE_KEY, layout);
      } catch {
        // ignore localStorage errors
      }
    }
  }, [layout]);

  const handleReset = () => {
    // Reset layout to default when reset is clicked
    setLayout(DEFAULT_CLIENTS_LAYOUT);
    try {
      if (typeof window !== "undefined") {
        window.localStorage.removeItem(LAYOUT_STORAGE_KEY);
      }
    } catch {
      // ignore localStorage errors
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 text-xs text-slate-500">
        <div className="flex items-center gap-2">
          {view ? (
            <>
              <span>View:</span>
              <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-[11px] font-medium text-slate-700">
                {view}
              </span>
            </>
          ) : (
            <>
              <span>Sorted by</span>
              <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-[11px] font-medium text-slate-700">
                {sortLabel} {sortArrow}
              </span>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Layout Toggle */}
          <div className="flex items-center gap-1 rounded-full border border-slate-200 bg-white p-0.5">
            <button
              type="button"
              onClick={() => setLayout("list")}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                layout === "list"
                  ? "bg-slate-900 text-white"
                  : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              List
            </button>
            <button
              type="button"
              onClick={() => setLayout("cards")}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                layout === "cards"
                  ? "bg-slate-900 text-white"
                  : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              Cards
            </button>
          </div>
        </div>
      </div>
      {layout === "list" ? (
        <ClientsTable
          clients={clients}
          workspaceId={workspaceId}
          sortBy={sortBy}
          sortDir={sortDir}
          searchParams={searchParams}
        />
      ) : (
        <div className="p-4">
          <ClientsCards clients={clients} workspaceId={workspaceId} />
        </div>
      )}
    </div>
  );
}

