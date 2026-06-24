// @ts-nocheck
"use client";

import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

interface InvoiceStatusData {
  label: string;
  value: number;
  formattedValue: string;
  color: string;
}

interface OwnerOverviewPieChartProps {
  data: InvoiceStatusData[];
}

export function OwnerOverviewPieChart({ data }: OwnerOverviewPieChartProps) {
  const total = data.reduce((sum, item) => sum + item.value, 0);

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
      <div className="mb-6 text-center">
        <h3 className="text-sm font-medium text-slate-900">
          Portfolio Health by Invoice Status
        </h3>
        <p className="text-xs text-muted-foreground mt-1">
          Snapshot of paid, overdue, and remaining invoices
        </p>
      </div>
      <div className="flex flex-col items-center justify-center">
        <div className="h-64 w-64 md:h-72 md:w-72 flex-shrink-0 mx-auto mb-6">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                nameKey="label"
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={90}
                paddingAngle={2}
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
                formatter={(value: number) => [`${value} invoices`, ""]}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        {/* Grid legend below the pie chart */}
        <div className="mt-4 grid w-full grid-cols-1 gap-2 text-xs sm:grid-cols-2 xl:grid-cols-4">
          {data.map((entry) => (
            <div
              key={entry.label}
              className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-2 py-1.5"
            >
              <div className="flex items-center gap-2">
                <span
                  className="h-2.5 w-2.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: entry.color }}
                />
                <span className="font-medium text-slate-700">{entry.label}</span>
              </div>
              <span className="text-slate-500">{entry.formattedValue}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

