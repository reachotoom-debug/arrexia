"use client";

import { useState, useEffect } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { CHART_COLORS, ChartTooltip, ChartEmptyState } from "@/app/[workspaceId]/dashboard/_components/chart-utils";
import type { ReminderPerformanceRow } from "@/app/[workspaceId]/dashboard/_types/dashboard";

interface ReminderPerformanceChartProps {
  data: ReminderPerformanceRow[];
}

export function ReminderPerformanceChart({ data }: ReminderPerformanceChartProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const hasData = data.some((d) => d.count > 0 || d.amount > 0);

  if (!mounted) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-6">
        <div className="mb-4">
          <h3 className="text-sm font-medium text-slate-900">Reminder Effectiveness</h3>
          <p className="text-xs text-muted-foreground mt-1">
            Invoices paid after reminder actions
          </p>
        </div>
        <div className="min-h-[260px]" />
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-6">
      <div className="mb-4">
        <h3 className="text-sm font-medium text-slate-900">Reminder Effectiveness</h3>
        <p className="text-xs text-muted-foreground mt-1">
          Invoices paid after reminder actions
        </p>
      </div>

      {!hasData ? (
        <ChartEmptyState
          icon="📧"
          title="No reminder data yet"
          message="Reminder effectiveness metrics will appear here once you start sending reminders."
        />
      ) : (
        <div className="h-[260px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data}
              margin={{ top: 10, right: 12, left: 8, bottom: 50 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="#e5e7eb"
                opacity={0.5}
              />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 12, fill: "#64748b" }}
                angle={-45}
                textAnchor="end"
                height={60}
                tickMargin={8}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 12, fill: "#64748b" }}
                tickFormatter={(value) => value.toLocaleString()}
                tickMargin={8}
                width={50}
              />
              <Tooltip content={<ChartTooltip currency="USD" />} />
              <Bar
                dataKey="count"
                fill={CHART_COLORS.count}
                radius={[4, 4, 0, 0]}
                name="Invoices"
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
