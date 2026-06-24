"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { formatCurrency } from "@/lib/format/currency";
import { KPI } from "@/app/[workspaceId]/dashboard/_components/KPI";
import type {
  DashboardSummary,
  CollectionsWorkItem,
} from "@/app/[workspaceId]/dashboard/_types/dashboard";
import { FileText, DollarSign, AlertTriangle } from "lucide-react";
import { INVOICE_NUMBER_COL_CLASS } from "@/components/tables/invoiceTableColumns";
import { clsx } from "clsx";

interface CollectionsModeTabProps {
  summary: DashboardSummary;
  collectionsWorklist: CollectionsWorkItem[];
  workspaceId: string;
}

type RiskFilter = "all" | "high" | "medium" | "low";
type SortOption = "overdue-days-desc" | "outstanding-desc" | "due-date-asc";

export function CollectionsModeTab({
  summary,
  collectionsWorklist,
  workspaceId,
}: CollectionsModeTabProps) {
  const [riskFilter, setRiskFilter] = useState<RiskFilter>("all");
  const [sortOption, setSortOption] = useState<SortOption>("outstanding-desc");

  // Filter and sort worklist
  const filteredAndSorted = useMemo(() => {
    const filtered =
      riskFilter === "all"
        ? collectionsWorklist
        : collectionsWorklist.filter((item) => item.riskLevel === riskFilter);

    // Apply sorting
    const sorted = [...filtered].sort((a, b) => {
      switch (sortOption) {
        case "overdue-days-desc":
          return b.overdueDays - a.overdueDays;
        case "outstanding-desc":
          return b.outstanding - a.outstanding;
        case "due-date-asc":
          return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
        default:
          return 0;
      }
    });

    return sorted;
  }, [collectionsWorklist, riskFilter, sortOption]);

  const worklistOutstanding = filteredAndSorted.reduce(
    (sum, item) => sum + item.outstanding,
    0
  );

  const riskFilterLabels: Record<RiskFilter, string> = {
    all: "All risks",
    high: "High risk",
    medium: "Medium risk",
    low: "Low risk",
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return "—";
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  function getRiskBadge(riskLevel: string | null) {
    if (riskLevel === "high") {
      return (
        <span className="inline-flex rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-700 border border-red-200">
          H
        </span>
      );
    } else if (riskLevel === "medium") {
      return (
        <span className="inline-flex rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-medium text-orange-700 border border-orange-200">
          M
        </span>
      );
    } else if (riskLevel === "low") {
      return (
        <span className="inline-flex rounded-full bg-yellow-100 px-2 py-0.5 text-[10px] font-medium text-yellow-700 border border-yellow-200">
          L
        </span>
      );
    }
    return null;
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(14rem,1fr))] gap-4">
        <KPI
          label="Invoices in view"
          value={filteredAndSorted.length}
          icon={FileText}
          iconBgColor="bg-blue-100"
        />
        <KPI
          label="Outstanding in view"
          value={formatCurrency(worklistOutstanding, { currency: "USD" })}
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

      {/* Filters and Sort */}
      <div className="flex gap-4 items-center flex-wrap">
        <div className="flex gap-2 flex-wrap">
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
        </div>

        <div className="flex items-center gap-2">
          <label className="text-sm text-slate-600">Sort:</label>
          <select
            value={sortOption}
            onChange={(e) => setSortOption(e.target.value as SortOption)}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
          >
            <option value="outstanding-desc">Outstanding (High → Low)</option>
            <option value="overdue-days-desc">Days Overdue (High → Low)</option>
            <option value="due-date-asc">Due Date (Oldest First)</option>
          </select>
        </div>
      </div>

      {/* Collections Worklist Table */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200">
          <h2 className="text-sm font-semibold text-slate-900">Collections Worklist</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Overdue invoices requiring collection action
          </p>
        </div>
        {filteredAndSorted.length === 0 ? (
          <div className="p-6 text-center text-sm text-slate-500">
            No invoices in worklist
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full table-auto text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr className="text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-2 text-left">Risk</th>
                  <th className={clsx("py-2", INVOICE_NUMBER_COL_CLASS)}>Invoice #</th>
                  <th className="px-3 py-2 text-left">Client</th>
                  <th className="px-3 py-2 text-left">Due Date</th>
                  <th className="px-3 py-2 text-right">Days Overdue</th>
                  <th className="px-3 py-2 text-right">Outstanding</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-center">Contact</th>
                  <th className="px-3 py-2 text-left">Next action</th>
                </tr>
              </thead>
              <tbody>
                {filteredAndSorted.map((item) => (
                  <tr
                    key={item.id}
                    className="border-b border-slate-100 hover:bg-slate-50"
                  >
                    <td className="px-3 py-2">{getRiskBadge(item.riskLevel)}</td>
                    <td className={clsx("py-2 text-sm text-slate-700", INVOICE_NUMBER_COL_CLASS)}>
                      <Link
                        href={`/${workspaceId}/invoices/${item.id}`}
                        className="font-medium text-blue-600 hover:text-blue-700 hover:underline"
                      >
                        {item.invoiceNumber}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-slate-800 whitespace-nowrap truncate max-w-[150px]" title={item.clientName}>
                      <div className="font-medium">{item.clientName}</div>
                    </td>
                    <td className="px-3 py-2 text-slate-700 whitespace-nowrap">
                      {item.dueDate ? formatDate(item.dueDate) : "—"}
                    </td>
                    <td className="px-3 py-2 text-right font-medium text-red-600 whitespace-nowrap">
                      {item.overdueDays} day{item.overdueDays !== 1 ? "s" : ""}
                    </td>
                    <td className="px-3 py-2 text-right font-medium text-red-600 whitespace-nowrap">
                      {formatCurrency(item.outstanding, { currency: "USD" })}
                    </td>
                    <td className="px-3 py-2">
                      <span className="inline-flex rounded-full bg-red-50 border border-red-200 px-2 py-0.5 text-xs font-medium text-red-700 capitalize">
                        Overdue
                      </span>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-sm text-slate-700 text-center">
                      <span className="text-slate-400" title="Email">✉️</span>
                      <span className="text-slate-400 ml-2" title="WhatsApp">💬</span>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className="text-xs text-slate-500">—</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
