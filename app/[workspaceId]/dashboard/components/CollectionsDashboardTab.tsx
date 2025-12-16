"use client";

import { useState } from "react";
import Link from "next/link";
import { formatMoney } from "@/lib/invoices/utils";
import { KPI } from "../_components/KPI";
import type { DashboardData } from "../_types/dashboard";
import { FileText, DollarSign, AlertTriangle } from "lucide-react";
import { INVOICE_NUMBER_COL_CLASS } from "@/components/tables/invoiceTableColumns";
import { clsx } from "clsx";

interface CollectionsDashboardTabProps {
  data: DashboardData;
}

type RiskFilter = "all" | "high" | "medium" | "low";

export default function CollectionsDashboardTab({ data }: CollectionsDashboardTabProps) {
  const [riskFilter, setRiskFilter] = useState<RiskFilter>("all");

  // Filter collections worklist by risk
  const filteredWorklist =
    riskFilter === "all"
      ? data.collectionsWorklist
      : data.collectionsWorklist.filter((item) => item.riskLevel === riskFilter);

  const worklistOutstanding = filteredWorklist.reduce(
    (sum, item) => sum + item.outstandingAmount,
    0
  );

  const riskFilterLabels: Record<RiskFilter, string> = {
    all: "All risks",
    high: "High risk",
    medium: "Medium risk",
    low: "Low risk",
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "—";
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  function getRiskBadge(riskLevel: string) {
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

  function getStatusBadge(status: string) {
    const statusLower = status.toLowerCase();
    if (statusLower === "overdue") {
      return "bg-red-50 text-red-700 border-red-200";
    } else if (statusLower === "paid") {
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    } else if (statusLower === "sent") {
      return "bg-blue-50 text-blue-700 border-blue-200";
    } else if (statusLower === "partial" || statusLower === "partially_paid") {
      return "bg-amber-50 text-amber-700 border-amber-200";
    } else if (statusLower === "void") {
      return "bg-slate-100 text-slate-500 border-slate-200";
    }
    return "bg-slate-50 text-slate-700 border-slate-200";
  }

  return (
    <div className="space-y-6">
      {/* Row 1: Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <KPI
          label="Invoices in view"
          value={filteredWorklist.length}
          icon={FileText}
          iconBgColor="bg-blue-100"
        />
        <KPI
          label="Outstanding in view"
          value={formatMoney(worklistOutstanding, "USD")}
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

      {/* Row 2: Risk Filter Pills */}
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

      {/* Row 3: Collections Worklist Table */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200">
          <h2 className="text-sm font-semibold text-slate-900">Collections Worklist</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Overdue invoices requiring collection action
          </p>
        </div>
        {filteredWorklist.length === 0 ? (
          <div className="p-6 text-center text-sm text-slate-500">
            No invoices in worklist
          </div>
        ) : (
          <table className="min-w-full table-auto text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr className="text-xs uppercase tracking-wide text-slate-500">
                <th className="px-3 py-2 text-left">Risk</th>
                <th className={clsx("py-2", INVOICE_NUMBER_COL_CLASS)}>Invoice #</th>
                <th className="px-3 py-2 text-left">Client</th>
                <th className="px-3 py-2 text-left">Due Date</th>
                <th className="px-3 py-2 text-right">Outstanding</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-center">Contact</th>
                <th className="px-3 py-2 text-left">Next action</th>
              </tr>
            </thead>
            <tbody>
              {filteredWorklist.map((item) => (
                <tr
                  key={item.invoiceId}
                  className="border-b border-slate-100 hover:bg-slate-50"
                >
                  <td className="px-3 py-2">{getRiskBadge(item.riskLevel)}</td>
                  <td className={clsx("py-2 text-sm text-slate-700", INVOICE_NUMBER_COL_CLASS)}>
                    <Link
                      href={`/${data.workspaceId}/invoices/${item.invoiceId}`}
                      className="font-medium text-blue-600 hover:text-blue-700 hover:underline"
                    >
                      {item.invoiceNumber}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-slate-800">
                    <div className="font-medium">{item.clientName}</div>
                  </td>
                  <td className="px-3 py-2 text-slate-700">
                    <div>
                      {item.dueDate ? formatDate(item.dueDate) : "—"}
                      {item.daysOverdue > 0 && (
                        <div className="text-xs text-red-600 font-medium">
                          {item.daysOverdue} day{item.daysOverdue !== 1 ? "s" : ""} overdue
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right font-medium text-red-600">
                    {formatMoney(item.outstandingAmount, "USD")}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium capitalize ${getStatusBadge(
                        "overdue"
                      )}`}
                    >
                      Overdue
                    </span>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-sm text-slate-700 text-center">
                    <span className="text-slate-400">✉️</span>
                  </td>
                  <td className="px-3 py-2">
                    <span className="text-xs text-slate-500">—</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
