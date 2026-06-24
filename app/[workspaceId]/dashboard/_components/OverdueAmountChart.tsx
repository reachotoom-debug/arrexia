"use client";

import { useState, useEffect } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CHART_COLORS, formatCurrencyAxis, ChartTooltip } from "./chart-utils";
import { ChartEmptyState } from "./ChartEmptyState";

interface OverdueAmountChartData {
  label: string;
  key: string;
  amount: number;
  formattedAmount: string;
}

interface OverdueAmountChartProps {
  data: OverdueAmountChartData[];
  currency?: string;
  workspaceId?: string;
}

export function OverdueAmountChart({
  data,
  currency = "USD",
  workspaceId,
}: OverdueAmountChartProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const totalAmount = data.reduce((sum, d) => sum + d.amount, 0);
  const hasData = totalAmount > 0;

  if (!mounted) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-6">
        <div className="mb-4">
          <h3 className="text-sm font-medium text-slate-900">
            Overdue Amount by Aging Bucket
          </h3>
          <p className="text-xs text-muted-foreground mt-1">
            Breakdown of overdue invoices by days past due ({currency}).
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
          Overdue Amount by Aging Bucket
        </h3>
        <p className="text-xs text-muted-foreground mt-1">
          Breakdown of overdue invoices by days past due ({currency}).
        </p>
      </div>

      {!hasData ? (
        <ChartEmptyState
          title="No overdue invoices yet"
          description="Once invoices pass their due date, we'll show how your overdue balance is distributed by aging bucket."
          href={workspaceId ? `/${workspaceId}/invoices/new` : undefined}
          actionLabel={workspaceId ? "Create invoice" : undefined}
        />
      ) : (
        <>
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
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
                  dataKey="label"
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
                <Tooltip
                  content={<ChartTooltip currency={currency} />}
                  cursor={{ fill: "rgba(148, 163, 184, 0.1)" }}
                />
                <Bar
                  dataKey="amount"
                  radius={[8, 8, 0, 0]}
                  fill={CHART_COLORS.overdue}
                  maxBarSize={50}
                  name="Overdue Amount"
                />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Legend / Summary row */}
          <div className="mt-4 grid grid-cols-1 gap-2 text-xs sm:grid-cols-2 xl:grid-cols-4">
            {data.map((bucket) => (
              <div
                key={bucket.key}
                className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2"
              >
                <span className="font-medium text-slate-700">{bucket.label}</span>
                <span className="text-slate-600">{bucket.formattedAmount}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
