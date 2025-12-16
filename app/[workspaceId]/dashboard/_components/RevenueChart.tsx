"use client";

import { useState, useEffect } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { CHART_COLORS, formatCurrencyAxis, ChartTooltip } from "./chart-utils";
import { ChartEmptyState } from "./ChartEmptyState";

interface RevenueChartProps {
  data: { month: string; revenue: number }[];
  workspaceId?: string;
}

export function RevenueChart({ data }: RevenueChartProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const hasData = data.length > 0 && data.some((d) => d.revenue > 0);

  if (!mounted) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-6">
        <div className="mb-4">
          <h3 className="text-sm font-medium text-slate-900">
            Revenue Overview (Last 6 Months)
          </h3>
          <p className="text-xs text-muted-foreground mt-1">
            Monthly payment totals over the past 6 months
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
          Revenue Overview (Last 6 Months)
        </h3>
        <p className="text-xs text-muted-foreground mt-1">
          Monthly payment totals over the past 6 months
        </p>
      </div>

      {!hasData ? (
        <ChartEmptyState
          title="No AR history yet"
          description="As you start issuing invoices and collecting payments, this chart becomes your monthly revenue timeline."
          href={workspaceId ? `/${workspaceId}/invoices/new` : undefined}
          actionLabel={workspaceId ? "Create invoice" : undefined}
        />
      ) : (
        <div className="h-[260px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={data}
              margin={{ top: 10, right: 12, left: 8, bottom: 8 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="#e5e7eb"
                opacity={0.5}
              />
              <XAxis
                dataKey="month"
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
                tickFormatter={(value) => formatCurrencyAxis(value, "USD")}
                tickMargin={8}
                width={70}
              />
              <Tooltip content={<ChartTooltip currency="USD" />} />
              <Line
                type="monotone"
                dataKey="revenue"
                stroke={CHART_COLORS.collected}
                strokeWidth={2}
                dot={{ fill: CHART_COLORS.collected, r: 4 }}
                activeDot={{ r: 6 }}
                name="Revenue"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
