"use client";

import { useEffect, useState } from "react";
import { ScrollTabStrip } from "@/components/layout/ScrollTabStrip";

type ImportTabId = "clients" | "invoices" | "payments";

interface ImportTabsProps {
  clientsContent: React.ReactNode;
  invoicesContent: React.ReactNode;
  paymentsContent: React.ReactNode;
  initialTab?: ImportTabId;
}

export function ImportTabs({
  clientsContent,
  invoicesContent,
  paymentsContent,
  initialTab = "clients",
}: ImportTabsProps) {
  const [activeTab, setActiveTab] = useState<ImportTabId>(initialTab);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  const tabBtn = (active: boolean) =>
    [
      "shrink-0 whitespace-nowrap border-b-2 px-1 py-4 text-sm font-medium transition-colors",
      active
        ? "border-blue-500 text-blue-600"
        : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700",
    ].join(" ");

  return (
    <div className="space-y-6">
      <ScrollTabStrip aria-label="Import data type">
        <button
          type="button"
          onClick={() => setActiveTab("clients")}
          className={tabBtn(activeTab === "clients")}
        >
          Clients
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("invoices")}
          className={tabBtn(activeTab === "invoices")}
        >
          Invoices
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("payments")}
          className={tabBtn(activeTab === "payments")}
        >
          Payments
        </button>
      </ScrollTabStrip>

      {/* Tab Content */}
      <div>
        {activeTab === "clients" && clientsContent}
        {activeTab === "invoices" && invoicesContent}
        {activeTab === "payments" && paymentsContent}
      </div>
    </div>
  );
}

