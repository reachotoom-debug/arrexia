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
  Legend,
} from "recharts";
import { CHART_COLORS, formatCurrencyAxis, ChartTooltip } from "@/app/[workspaceId]/dashboard/_components/chart-utils";
import { ChartEmptyState } from "@/app/[workspaceId]/dashboard/_components/ChartEmptyState";

interface StatusFunnelChartProps {
  data: Array<{ status: string; count: number; amount: number }>;
  workspaceId?: string;
}

export function StatusFunnelChart({ data, workspaceId }: StatusFunnelChartProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const hasData = data.length > 0 && data.some((d) => d.count > 0 || d.amount > 0);
  const hasCount = data.some((d) => d.count > 0);
  const hasAmount = data.some((d) => d.amount > 0);

  // Map status to colors
  const getStatusColor = (status: string): string => {
    const statusLower = status.toLowerCase();
    if (statusLower === "paid") return CHART_COLORS.statusPaid;
    if (statusLower === "overdue") return CHART_COLORS.statusOverdue;
    if (statusLower === "sent") return CHART_COLORS.statusSent;
    return CHART_COLORS.statusDraft;
  };

  const chartData = data.map((item) => ({
    status: item.status.charAt(0).toUpperCase() + item.status.slice(1),
    count: item.count,
    amount: item.amount,
  }));

  if (!mounted) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-6">
        <div className="mb-4">
          <h3 className="text-sm font-medium text-slate-900">Status Funnel</h3>
          <p className="text-xs text-muted-foreground mt-1">
            Distribution of invoice statuses
          </p>
        </div>
        <div className="min-h-[260px]" />
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-6">
      <div className="mb-4">
        <h3 className="text-sm font-medium text-slate-900">Status Funnel</h3>
        <p className="text-xs text-muted-foreground mt-1">
          Counts and amounts by invoice status
        </p>
      </div>

      {!hasData ? (
        <ChartEmptyState
          title="Invoice funnel is empty"
          description="Create invoices to see how much value sits in Draft, Sent, Paid, and Overdue states."
          href={workspaceId ? `/${workspaceId}/invoices/new` : undefined}
          actionLabel={workspaceId ? "Create invoice" : undefined}
        />
      ) : (
        <div className="h-[260px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              margin={{ top: 10, right: 12, left: 8, bottom: 50 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="#e5e7eb"
                opacity={0.5}
              />
              <XAxis
                dataKey="status"
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 12, fill: "#64748b" }}
                angle={-45}
                textAnchor="end"
                height={60}
                tickMargin={8}
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
              {hasCount && (
                <Bar
                  yAxisId="left"
                  dataKey="count"
                  fill={CHART_COLORS.count}
                  radius={[4, 4, 0, 0]}
                  name="Count"
                />
              )}
              {hasAmount && (
                <Bar
                  yAxisId="right"
                  dataKey="amount"
                  fill={CHART_COLORS.amount}
                  radius={[4, 4, 0, 0]}
                  name="Amount"
                />
              )}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
