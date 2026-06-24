"use client";

import { useState } from "react";
import { ScrollTabStrip } from "@/components/layout/ScrollTabStrip";

interface RemindersTabsProps {
  defaultValue?: "suggested" | "history";
  suggestedContent: React.ReactNode;
  historyContent: React.ReactNode;
}

export function RemindersTabs({
  defaultValue = "suggested",
  suggestedContent,
  historyContent,
}: RemindersTabsProps) {
  const [activeTab, setActiveTab] = useState<"suggested" | "history">(defaultValue);

  const tabBtn = (active: boolean) =>
    [
      "border-b-2 px-1 py-4 text-sm font-medium transition-colors",
      active
        ? "border-blue-500 text-blue-600"
        : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700",
    ].join(" ");

  return (
    <div className="space-y-4">
      <ScrollTabStrip aria-label="Reminders">
          <button
            type="button"
            onClick={() => setActiveTab("suggested")}
            className={tabBtn(activeTab === "suggested")}
          >
            Suggested reminders
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("history")}
            className={tabBtn(activeTab === "history")}
          >
            History
          </button>
      </ScrollTabStrip>

      <div>
        {activeTab === "suggested" && suggestedContent}
        {activeTab === "history" && historyContent}
      </div>
    </div>
  );
}

