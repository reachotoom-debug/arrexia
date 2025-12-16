"use client";

import { useState, useEffect } from "react";
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { CHART_COLORS, formatCurrencyAxis, ChartTooltip } from "./chart-utils";
import { ChartEmptyState } from "./ChartEmptyState";

interface ReminderEffectivenessData {
  month: string;
  remindersSent: number;
  paymentsReceived: number;
}

interface ReminderEffectivenessChartProps {
  data: ReminderEffectivenessData[];
  workspaceId?: string;
}

export function ReminderEffectivenessChart({
  data,
  workspaceId,
}: ReminderEffectivenessChartProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const hasData = data.length > 0 && data.some((d) => d.remindersSent > 0 || d.paymentsReceived > 0);
  const hasReminders = data.some((d) => d.remindersSent > 0);
  const hasPayments = data.some((d) => d.paymentsReceived > 0);

  if (!mounted) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-6">
        <div className="mb-4">
          <h3 className="text-sm font-medium text-slate-900">Reminder Effectiveness</h3>
          <p className="text-xs text-muted-foreground mt-1">
            Reminders sent vs payments received by month
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
          Reminders sent vs payments received by month
        </p>
      </div>

      {!hasData ? (
        <ChartEmptyState
          title="No reminder data yet"
          description="Once you start sending reminders and receiving payments, we'll show the correlation here."
          href={workspaceId ? `/${workspaceId}/reminders` : undefined}
          actionLabel={workspaceId ? "Send reminder" : undefined}
        />
      ) : (
        <div className="h-[260px]">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
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
                yAxisId="left"
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 12, fill: "#64748b" }}
                tickFormatter={(value) => value.toLocaleString()}
                tickMargin={8}
                width={50}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 12, fill: "#64748b" }}
                tickFormatter={(value) => formatCurrencyAxis(value, "USD")}
                tickMargin={8}
                width={70}
              />
              <Tooltip content={<ChartTooltip currency="USD" />} />
              <Legend
                wrapperStyle={{
                  paddingTop: "8px",
                  fontSize: "12px",
                }}
                iconType="circle"
              />
              {hasReminders && (
                <Bar
                  yAxisId="left"
                  dataKey="remindersSent"
                  fill={CHART_COLORS.statusSent}
                  radius={[4, 4, 0, 0]}
                  name="Reminders Sent"
                />
              )}
              {hasPayments && (
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="paymentsReceived"
                  stroke={CHART_COLORS.collected}
                  strokeWidth={2}
                  dot={{ fill: CHART_COLORS.collected, r: 4 }}
                  activeDot={{ r: 6 }}
                  name="Payments Received"
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
