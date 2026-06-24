"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { formatCurrency } from "@/lib/format/currency";
import type { CollectionsModeData } from "../../_types/dashboard";
import { INVOICE_NUMBER_COL_CLASS } from "@/components/tables/invoiceTableColumns";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { clsx } from "clsx";

interface CollectionsModeViewProps {
  data: CollectionsModeData;
  workspaceId: string;
}

type RiskFilter = "all" | "high" | "medium" | "low";
type SortOption = "overdue-days-desc" | "outstanding-desc" | "due-date-asc";

export function CollectionsModeView({ data, workspaceId }: CollectionsModeViewProps) {
  const [riskFilter, setRiskFilter] = useState<RiskFilter>("all");
  const [sortOption, setSortOption] = useState<SortOption>("outstanding-desc");

  // Filter and sort worklist
  const filteredAndSorted = useMemo(() => {
    // IMPORTANT: this view is “Collections exposure” (chaseable invoices).
    // data.worklist is already sourced from invoices_view with overdue + outstanding > 0
    // and eligibility filters applied server-side. We only apply risk_level filtering here.
    const filteredInvoices =
      riskFilter === "all"
        ? data.worklist
        : data.worklist.filter((item) => item.riskLevel === riskFilter);

    // Apply sorting for the table
    const sorted = [...filteredInvoices].sort((a, b) => {
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

    // Cap to 10 rows for display
    return {
      filteredInvoices,
      tableRows: sorted.slice(0, 10),
    };
  }, [data.worklist, riskFilter, sortOption]);
  
  // Check if there are more items (considering filter and original data)
  const hasMore =
    riskFilter === "all"
      ? data.worklistHasMore
      : filteredAndSorted.filteredInvoices.length > 10;

  const formatDate = (dateString: string) => {
    if (!dateString) return "—";
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  /** Overdue-day heat for urgency: <60 light, 60-120 medium red, >120 strong red. */
  function getOverdueDaysHeatClasses(days: number): string {
    if (days > 120) return "bg-red-600 text-white border-red-700";
    if (days >= 60) return "bg-red-200 text-red-900 border-red-400";
    return "bg-red-50 text-red-700 border-red-200";
  }

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
            Open the invoice to review details and prepare follow-up
          </p>
        </div>
        {filteredAndSorted.filteredInvoices.length === 0 ? (
          <div className="p-6 text-center">
            <p className="text-sm font-semibold text-slate-900 mb-1">
              No invoices require collection action
            </p>
            <p className="text-xs text-slate-500">
              Once invoices become overdue and risky, they'll appear here with suggested next actions.
            </p>
          </div>
        ) : (
          <>
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
                    <th className="px-3 py-2 text-left">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAndSorted.tableRows.map((item) => (
                    <tr
                      key={item.id}
                      className={clsx(
                        "border-b border-slate-100",
                        item.overdueDays >= 90
                          ? "bg-red-50 hover:bg-red-100"
                          : "hover:bg-slate-50"
                      )}
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
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        <span
                          className={clsx(
                            "inline-flex rounded-full border px-2 py-0.5 text-xs font-medium",
                            getOverdueDaysHeatClasses(item.overdueDays)
                          )}
                        >
                          {item.overdueDays} day{item.overdueDays !== 1 ? "s" : ""}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        <span className="font-semibold text-red-700">
                          {formatCurrency(item.outstanding, { currency: "USD" })}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <StatusBadge type="invoice" status="overdue" />
                      </td>
                      <td className="px-3 py-2 text-sm text-slate-700">
                        {item.primaryEmail || item.primaryPhone ? (
                          <div className="space-y-0.5">
                            {item.primaryEmail ? <div>{item.primaryEmail}</div> : null}
                            {item.primaryPhone ? <div className="text-slate-500">{item.primaryPhone}</div> : null}
                          </div>
                        ) : (
                          <span className="text-slate-400">No contact info</span>
                        )}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <Link
                          href={`/${workspaceId}/invoices/${item.id}`}
                          className="inline-flex items-center rounded-md bg-blue-600 px-2.5 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-blue-700"
                        >
                          View invoice
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {hasMore && (
              <div className="px-4 py-2 border-t border-slate-200 flex justify-end">
                <Link
                  href={`/${workspaceId}/collections`}
                  className="text-[11px] text-slate-500 hover:text-slate-700 hover:underline"
                >
                  View all
                </Link>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
