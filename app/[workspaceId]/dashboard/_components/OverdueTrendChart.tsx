"use client";

import { useState, useEffect } from "react";
import {
  Line,
  LineChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CHART_COLORS, formatCurrencyAxis, ChartTooltip } from "./chart-utils";
import { ChartEmptyState } from "./ChartEmptyState";

interface OverdueTrendData {
  monthLabel: string;
  overdueAmount: number;
}

interface OverdueTrendChartProps {
  data: OverdueTrendData[];
  currency?: string;
}

export function OverdueTrendChart({
  data,
  currency = "USD",
}: OverdueTrendChartProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const hasData = data.length > 0 && data.some((d) => d.overdueAmount > 0);

  if (!mounted) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-6">
        <div className="mb-4">
          <h3 className="text-sm font-medium text-slate-900">
            Overdue Trend (Last 12 Months)
          </h3>
          <p className="text-xs text-muted-foreground mt-1">
            Trend of overdue amounts by month ({currency}).
          </p>
        </div>
        <div className="min-h-[260px]" />
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-6">
      <div className="mb-4">
        <h3 className="text-sm font-medium text-slate-900">
          Overdue Trend (Last 12 Months)
        </h3>
        <p className="text-xs text-muted-foreground mt-1">
          Trend of overdue amounts by month ({currency}).
        </p>
      </div>

      {!hasData ? (
        <ChartEmptyState
          title="No overdue trend to show"
          description="When invoices become overdue over time, we'll plot your total overdue balance by month."
        />
      ) : (
        <div className="h-[260px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={data}
              margin={{ top: 10, right: 12, left: 8, bottom: 8 }}
            >
              <CartesianGrid
                vertical={false}
                stroke="#e5e7eb"
                strokeDasharray="3 3"
                opacity={0.5}
              />
              <XAxis
                dataKey="monthLabel"
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 12, fill: "#64748b" }}
                tickMargin={8}
                minTickGap={8}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 12, fill: "#64748b" }}
                tickFormatter={(value) => formatCurrencyAxis(value, currency)}
                tickMargin={8}
                width={70}
              />
              <Tooltip content={<ChartTooltip currency={currency} />} />
              <Line
                type="monotone"
                dataKey="overdueAmount"
                stroke={CHART_COLORS.overdue}
                strokeWidth={2}
                dot={{ fill: CHART_COLORS.overdue, r: 4 }}
                activeDot={{ r: 6 }}
                name="Overdue Amount"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

// Default export for compatibility
export default OverdueTrendChart;
