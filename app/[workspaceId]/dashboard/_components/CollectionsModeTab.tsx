// @ts-nocheck
"use client";

import { useState } from "react";
import Link from "next/link";
import { formatCurrency } from "@/lib/format/currency";
import { KPI } from "./KPI";
import { CollectionsTable } from "@/app/[workspaceId]/collections/_components/CollectionsTable";
import type { DashboardData, CollectionsRow } from "../_types/dashboard";
import { FileText, DollarSign, AlertTriangle } from "lucide-react";

interface CollectionsModeTabProps {
  workspaceId: string;
  data: DashboardData;
}

type RiskFilter = "high" | "medium" | "low" | "all";

export function CollectionsModeTab({ workspaceId, data }: CollectionsModeTabProps) {
  const [riskFilter, setRiskFilter] = useState<RiskFilter>("all");

  const collectionsData = data.collectionsByRisk[riskFilter];
  const filteredCount = collectionsData.length;
  const filteredOutstanding = collectionsData.reduce(
    (sum, inv) => sum + inv.outstanding,
    0
  );

  const riskFilterLabels: Record<RiskFilter, string> = {
    high: "High risk",
    medium: "Medium risk",
    low: "Low risk",
    all: "All risks",
  };

  // Convert to CollectionsTable format
  const tableData = collectionsData.map((inv) => ({
    id: inv.id,
    invoice_number: inv.invoiceNumber,
    risk: (inv.riskLevel || "none") as "high" | "medium" | "low" | "none",
    outstanding: inv.outstanding,
    due_date: inv.dueDate,
    status: inv.status,
    notes: null,
    currency: "USD",
    daysOverdue: inv.overdueDays,
    clients: inv.clientName
      ? ({
          id: "",
          name: inv.clientName,
          company: null,
          email: null,
          phone: null,
          whatsapp: null,
          whatsapp_phone: null,
        } as any)
      : null,
  }));

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(14rem,1fr))] gap-4">
        <KPI
          label="Invoices in view"
          value={filteredCount}
          icon={FileText}
          iconBgColor="bg-blue-100"
        />
        <KPI
          label="Outstanding in view"
          value={formatCurrency(filteredOutstanding, { currency: "USD" })}
          icon={DollarSign}
          iconBgColor="bg-red-100"
        />
        <KPI
          label="Mode"
          value={riskFilterLabels[riskFilter]}
          icon={AlertTriangle}
          iconBgColor="bg-amber-100"
        />
      </div>

      {/* Risk Filter Pills */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => setRiskFilter("high")}
          className={`
            rounded-full px-4 py-2 text-sm font-medium transition-colors
            ${
              riskFilter === "high"
                ? "bg-red-100 text-red-700 border-2 border-red-300"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200 border-2 border-transparent"
            }
          `}
        >
          High risk
        </button>
        <button
          onClick={() => setRiskFilter("medium")}
          className={`
            rounded-full px-4 py-2 text-sm font-medium transition-colors
            ${
              riskFilter === "medium"
                ? "bg-orange-100 text-orange-700 border-2 border-orange-300"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200 border-2 border-transparent"
            }
          `}
        >
          Medium risk
        </button>
        <button
          onClick={() => setRiskFilter("low")}
          className={`
            rounded-full px-4 py-2 text-sm font-medium transition-colors
            ${
              riskFilter === "low"
                ? "bg-yellow-100 text-yellow-700 border-2 border-yellow-300"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200 border-2 border-transparent"
            }
          `}
        >
          Low risk
        </button>
        <button
          onClick={() => setRiskFilter("all")}
          className={`
            rounded-full px-4 py-2 text-sm font-medium transition-colors
            ${
              riskFilter === "all"
                ? "bg-blue-100 text-blue-700 border-2 border-blue-300"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200 border-2 border-transparent"
            }
          `}
        >
          All risks
        </button>
      </div>

      {/* Collections Table */}
      <CollectionsTable invoices={tableData} workspaceId={workspaceId} />
    </div>
  );
}
