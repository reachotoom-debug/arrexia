"use client";

import { useState } from "react";

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

  return (
    <div className="space-y-4">
      <div className="border-b border-slate-200">
        <nav className="-mb-px flex space-x-8">
          <button
            type="button"
            onClick={() => setActiveTab("suggested")}
            className={`
              whitespace-nowrap border-b-2 px-1 py-4 text-sm font-medium transition-colors
              ${
                activeTab === "suggested"
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700"
              }
            `}
          >
            Suggested reminders
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("history")}
            className={`
              whitespace-nowrap border-b-2 px-1 py-4 text-sm font-medium transition-colors
              ${
                activeTab === "history"
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700"
              }
            `}
          >
            History
          </button>
        </nav>
      </div>

      <div>
        {activeTab === "suggested" && suggestedContent}
        {activeTab === "history" && historyContent}
      </div>
    </div>
  );
}

