// @ts-nocheck
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
import { CHART_COLORS, formatCurrencyAxis, ChartTooltip } from "@/app/[workspaceId]/dashboard/_components/chart-utils";
import { ChartEmptyState } from "@/app/[workspaceId]/dashboard/_components/ChartEmptyState";

interface RevenueOverviewChartProps {
  data: { month: string; invoiced: number; collected: number }[];
  workspaceId?: string;
  totalInvoiced?: number;
  paymentsCount?: number;
}

export function RevenueOverviewChart({ data }: RevenueOverviewChartProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const hasData = data.length > 0 && data.some((d) => d.invoiced > 0 || d.collected > 0);
  const hasInvoiced = data.some((d) => d.invoiced > 0);
  const hasCollected = data.some((d) => d.collected > 0);

  if (!mounted) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-6">
        <div className="mb-4">
          <h3 className="text-sm font-medium text-slate-900">
            Revenue Overview (Last 12 Months)
          </h3>
          <p className="text-xs text-muted-foreground mt-1">
            Comparison of invoiced amounts and payments received.
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
          Revenue Overview (Last 12 Months)
        </h3>
        <p className="text-xs text-muted-foreground mt-1">
          Bars show invoices issued, line shows payments received.
        </p>
      </div>

      {!hasData ? (
        totalInvoiced === 0 ? (
          <ChartEmptyState
            title="No revenue activity yet"
            description="As you raise invoices and record payments, this chart will show billed vs collected amounts by month."
            href={workspaceId ? `/${workspaceId}/invoices/new` : undefined}
            actionLabel={workspaceId ? "Create first invoice" : undefined}
          />
        ) : paymentsCount === 0 ? (
          <ChartEmptyState
            title="Invoices created, no payments recorded"
            description="Record payments against your invoices to see how much cash you're collecting each month."
            href={workspaceId ? `/${workspaceId}/payments` : undefined}
            actionLabel={workspaceId ? "Record payment" : undefined}
          />
        ) : (
          <ChartEmptyState
            title="No revenue data yet"
            description="Once you start creating invoices and receiving payments, we'll show trends here."
          />
        )
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
              {hasInvoiced && (
                <Bar
                  dataKey="invoiced"
                  fill={CHART_COLORS.invoiced}
                  radius={[4, 4, 0, 0]}
                  name="Invoices Issued"
                />
              )}
              {hasCollected && (
                <Line
                  type="monotone"
                  dataKey="collected"
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
