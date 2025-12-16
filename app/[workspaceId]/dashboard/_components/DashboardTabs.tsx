"use client";

import { useState } from "react";
import Link from "next/link";
import type { DashboardData } from "../_types/dashboard";
import { OverviewTab } from "./OverviewTab";
import { CollectionsModeTab } from "./CollectionsModeTab";

interface DashboardTabsProps {
  workspaceId: string;
  data: DashboardData;
}

type TabId = "overview" | "collections";

export function DashboardTabs({ workspaceId, data }: DashboardTabsProps) {
  const [activeTab, setActiveTab] = useState<TabId>("overview");

  return (
    <>
      {/* Tab Navigation */}
      <div className="border-b border-slate-200">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab("overview")}
            className={`
              whitespace-nowrap border-b-2 px-1 py-4 text-sm font-medium transition-colors
              ${
                activeTab === "overview"
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700"
              }
            `}
          >
            Overview
          </button>
          <button
            onClick={() => setActiveTab("collections")}
            className={`
              whitespace-nowrap border-b-2 px-1 py-4 text-sm font-medium transition-colors
              ${
                activeTab === "collections"
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700"
              }
            `}
          >
            Collections mode
          </button>
        </nav>
      </div>

      {/* Tab Content */}
      <div className="mt-6">
        {activeTab === "overview" && (
          <OverviewTab workspaceId={workspaceId} data={data} />
        )}
        {activeTab === "collections" && (
          <CollectionsModeTab workspaceId={workspaceId} data={data} />
        )}
      </div>
    </>
  );
}
