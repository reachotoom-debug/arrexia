// @ts-nocheck
"use client";

import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

// Helper function to format currency
function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

interface InvoiceStatusData {
  label: string;
  value: number;
  formattedValue: string;
  color: string;
  percentage?: number;
  formattedAmount?: string;
  formattedPercentage?: string;
}

interface InvoiceStatusPieChartProps {
  data: InvoiceStatusData[];
  size?: "default" | "large";
  title?: string;
  description?: string;
  showLegend?: boolean;
  children?: React.ReactNode; // For custom content like overdue context
}

export function InvoiceStatusPieChart({
  data,
  size = "default",
  title = "Invoice Status Mix",
  description = "Paid vs overdue vs other statuses",
  showLegend = true,
  children,
}: InvoiceStatusPieChartProps) {
  const total = data.reduce((sum, item) => sum + item.value, 0);

  // Always use large size for better visibility
  const chartSize = "h-64 w-64 md:h-72 md:w-72";
  const innerRadius = 60;
  const outerRadius = 90;

  if (total === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-6">
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <p className="text-sm text-slate-500">No invoice data available</p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-6">
      {(title || description) && (
        <div className="mb-6 text-center">
          <h3 className="text-sm font-medium text-slate-900">{title}</h3>
          {description && (
            <p className="text-xs text-muted-foreground mt-1">{description}</p>
          )}
        </div>
      )}
      <div className="flex flex-col items-center justify-center gap-6 md:flex-row md:justify-between md:items-start">
        {/* Pie Chart - Centered */}
        <div className={`${chartSize} flex-shrink-0 mx-auto md:mx-0`}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                nameKey="label"
                cx="50%"
                cy="50%"
                innerRadius={innerRadius}
                outerRadius={outerRadius}
                paddingAngle={2}
                stroke="#ffffff"
                strokeWidth={1}
              >
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: "white",
                  border: "1px solid #e2e8f0",
                  borderRadius: "8px",
                  padding: "8px",
                }}
                formatter={(value: number, name: string, props: any) => {
                  const entry = props.payload;
                  const amount = entry.formattedAmount || formatCurrency(value);
                  const percentage = entry.formattedPercentage || "";
                  return [amount + (percentage ? ` (${percentage})` : ""), name];
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Legend - Professional layout with percentage and amount */}
        {showLegend && (
          <div className="space-y-2 text-xs flex-1 md:max-w-xs">
            {children}
            {!children &&
              data.map((entry) => (
                <div
                  key={entry.label}
                  className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: entry.color }}
                    />
                    <span className="font-medium text-slate-700">{entry.label}</span>
                  </div>
                  <div className="text-right">
                    {entry.formattedPercentage && (
                      <div className="font-semibold text-slate-900">
                        {entry.formattedPercentage}
                      </div>
                    )}
                    {entry.formattedAmount && (
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        {entry.formattedAmount}
                      </div>
                    )}
                    {!entry.formattedPercentage && !entry.formattedAmount && (
                      <span className="text-slate-500">{entry.formattedValue}</span>
                    )}
                  </div>
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}
