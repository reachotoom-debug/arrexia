"use client";

import { useState } from "react";

type TabId = "workspace" | "email" | "reminders" | "payments" | "billing" | "account";

interface SettingsTabsProps {
  workspaceContent: React.ReactNode;
  emailContent: React.ReactNode;
  remindersContent: React.ReactNode;
  paymentsContent: React.ReactNode;
  billingContent: React.ReactNode;
  accountContent: React.ReactNode;
  initialTab?: TabId;
}

export function SettingsTabs({
  workspaceContent,
  emailContent,
  remindersContent,
  paymentsContent,
  billingContent,
  accountContent,
  initialTab = "workspace",
}: SettingsTabsProps) {
  const [activeTab, setActiveTab] = useState<TabId>(initialTab);

  return (
    <div className="space-y-6">
      {/* Tab Navigation */}
      <div className="border-b border-slate-200">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab("workspace")}
            className={`
              whitespace-nowrap border-b-2 px-1 py-4 text-sm font-medium transition-colors
              ${
                activeTab === "workspace"
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700"
              }
            `}
          >
            Workspace
          </button>
          <button
            onClick={() => setActiveTab("email")}
            className={`
              whitespace-nowrap border-b-2 px-1 py-4 text-sm font-medium transition-colors
              ${
                activeTab === "email"
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700"
              }
            `}
          >
            Email & Sending
          </button>
          <button
            onClick={() => setActiveTab("reminders")}
            className={`
              whitespace-nowrap border-b-2 px-1 py-4 text-sm font-medium transition-colors
              ${
                activeTab === "reminders"
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700"
              }
            `}
          >
            Reminders
          </button>
          <button
            onClick={() => setActiveTab("payments")}
            className={`
              whitespace-nowrap border-b-2 px-1 py-4 text-sm font-medium transition-colors
              ${
                activeTab === "payments"
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700"
              }
            `}
          >
            Payments & Defaults
          </button>
          <button
            onClick={() => setActiveTab("billing")}
            className={`
              whitespace-nowrap border-b-2 px-1 py-4 text-sm font-medium transition-colors
              ${
                activeTab === "billing"
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700"
              }
            `}
          >
            Billing
          </button>
          <button
            onClick={() => setActiveTab("account")}
            className={`
              whitespace-nowrap border-b-2 px-1 py-4 text-sm font-medium transition-colors
              ${
                activeTab === "account"
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700"
              }
            `}
          >
            Account
          </button>
        </nav>
      </div>

      {/* Tab Content */}
      <div>
        {activeTab === "workspace" && workspaceContent}
        {activeTab === "email" && emailContent}
        {activeTab === "reminders" && remindersContent}
        {activeTab === "payments" && paymentsContent}
        {activeTab === "billing" && billingContent}
        {activeTab === "account" && accountContent}
      </div>
    </div>
  );
}
