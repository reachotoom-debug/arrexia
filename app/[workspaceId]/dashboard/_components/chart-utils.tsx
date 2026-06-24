"use client";

import { formatCurrency } from "@/lib/format/currency";
import { ValueType } from "recharts/types/component/DefaultTooltipContent";

// Shared chart colors
export const CHART_COLORS = {
  invoiced: "#3b82f6", // blue-500
  collected: "#10b981", // emerald-500
  overdue: "#ef4444", // red-500
  statusPaid: "#10b981",
  statusSent: "#3b82f6",
  statusOverdue: "#ef4444",
  statusDraft: "#94a3b8", // slate-400
  count: "#3b82f6",
  amount: "#10b981",
};

// Shared currency formatter for Y-axis
export function formatCurrencyAxis(value: number, currency: string = "USD"): string {
  // Use compact notation for larger values, full for smaller
  if (Math.abs(value) >= 1000) {
    return new Intl.NumberFormat("en-US", {
      notation: "compact",
      maximumFractionDigits: 1,
      style: "currency",
      currency,
      minimumFractionDigits: 0,
    }).format(value);
  }
  return formatCurrency(value, { currency });
}

// Custom tooltip component
export function ChartTooltip({
  active,
  payload,
  label,
  currency = "USD",
}: {
  active?: boolean;
  payload?: Array<{
    name?: string;
    value?: ValueType;
    dataKey?: string | number;
    color?: string;
    payload?: Record<string, unknown>;
  }>;
  label?: string;
  currency?: string;
}) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  // Filter out null/undefined values
  const validEntries = payload.filter((entry) => entry.value != null);

  if (validEntries.length === 0) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-lg">
        <p className="text-xs text-slate-500">No data</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-lg">
      {label && <p className="mb-2 text-sm font-semibold text-slate-900">{label}</p>}
      <div className="space-y-1.5">
        {validEntries.map((entry, index) => {
          const value = typeof entry.value === "number" ? entry.value : 0;
          const displayName = entry.name || String(entry.dataKey || "").replace(/([A-Z])/g, " $1").trim() || "Value";
          
          // Determine if this is a currency value or count
          const dataKeyStr = entry.dataKey?.toString().toLowerCase() || "";
          const nameStr = entry.name?.toLowerCase() || "";
          const isCurrency = 
            dataKeyStr.includes("amount") || 
            dataKeyStr.includes("collected") ||
            dataKeyStr.includes("invoiced") ||
            dataKeyStr.includes("overdue") ||
            dataKeyStr.includes("revenue") ||
            nameStr.includes("amount") ||
            nameStr.includes("collected") ||
            nameStr.includes("invoiced") ||
            nameStr.includes("overdue") ||
            nameStr.includes("revenue");

          return (
            <div key={index} className="flex items-center gap-2 text-xs">
              <div
                className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
                style={{ backgroundColor: entry.color || "#94a3b8" }}
              />
              <span className="text-slate-600">{displayName}:</span>
              <span className="font-semibold text-slate-900">
                {isCurrency ? formatCurrency(value, { currency }) : value.toLocaleString()}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Empty state component for charts
export function ChartEmptyState({
  icon = "📊",
  title = "No data yet",
  message = "Once you start creating invoices and payments, we'll show trends here.",
}: {
  icon?: string;
  title?: string;
  message?: string;
}) {
  return (
    <div className="flex min-h-[260px] flex-col items-center justify-center py-12 text-center">
      <div className="mb-3 text-3xl">{icon}</div>
      <p className="text-sm font-medium text-slate-900">{title}</p>
      <p className="mt-1 text-xs text-slate-500 max-w-xs">{message}</p>
    </div>
  );
}
