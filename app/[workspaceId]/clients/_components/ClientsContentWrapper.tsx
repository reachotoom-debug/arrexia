"use client";

import { useSearchParams } from "next/navigation";
import { ClientsListView } from "./ClientsListView";
import { ClientsCardView } from "./ClientsCardView";
import { ClientsViewToggle } from "./ClientsViewToggle";

type DisplayView = "list" | "cards";

interface Client {
  id: string;
  name: string;
  company: string | null;
  email: string | null;
  whatsapp: string | null;
  country: string | null;
  payment_terms: number | null;
  status: string; // Legacy field, not used for UI status
  archived_at: string | null;
  is_active: boolean;
  invoicesCount?: number;
  outstanding?: number;
}

interface ClientsContentWrapperProps {
  clients: Client[];
  workspaceId: string;
  sortBy?: string;
  sortDir?: string;
  searchParams: Record<string, string | string[] | undefined>;
  view?: string; // View preset (default, highest-outstanding-first, etc.)
  sortLabel: string;
  sortArrow: string;
  displayView?: DisplayView; // Display view (list or cards)
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
  displayView: initialDisplayView,
}: ClientsContentWrapperProps) {
  const searchParamsObj = useSearchParams();
  const urlDisplayView = searchParamsObj.get("displayView") as DisplayView | null;
  const displayView = urlDisplayView === "list" || urlDisplayView === "cards" 
    ? urlDisplayView 
    : initialDisplayView || "list";

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
        <div className="hidden items-center gap-2 md:flex">
          <ClientsViewToggle workspaceId={workspaceId} currentView={displayView} />
        </div>
      </div>
      {/* Below md: always cards (URL/list preference applies from md only) */}
      <div className="md:hidden">
        <div className="p-4">
          <ClientsCardView
            clients={clients}
            workspaceId={workspaceId}
            searchParams={searchParams}
          />
        </div>
      </div>
      {/* md+: list vs cards from URL / prefs */}
      <div className="hidden md:block">
        {displayView === "list" ? (
          <ClientsListView
            clients={clients}
            workspaceId={workspaceId}
            sortBy={sortBy}
            sortDir={sortDir}
            searchParams={searchParams}
          />
        ) : (
          <div className="p-4">
            <ClientsCardView
              clients={clients}
              workspaceId={workspaceId}
              searchParams={searchParams}
            />
          </div>
        )}
      </div>
    </div>
  );
}

