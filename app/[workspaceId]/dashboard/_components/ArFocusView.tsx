import { formatCurrency } from "@/lib/format/currency";
import { KPI } from "./KPI";
import { TopOverdueClientsTable } from "./TopOverdueClientsTable";
import { OverdueInvoicesTable } from "./OverdueInvoicesTable";
import type { DashboardData } from "../../_types/dashboard";
import { AlertTriangle, Target, FileText } from "lucide-react";
import Link from "next/link";

interface ArFocusViewProps {
  data: DashboardData;
  workspaceId: string;
}

export function ArFocusView({ data, workspaceId }: ArFocusViewProps) {
  const overdueCount = data.arFocus.overdueInvoicesCount;

  // Convert overdue invoices for table
  const overdueInvoicesForTable = data.arFocus.overdueInvoices.map((inv) => ({
    id: inv.id,
    invoiceNumber: inv.invoiceNumber,
    clientName: inv.clientName,
    status: "overdue" as const,
    issueDate: null,
    dueDate: inv.dueDate,
    totalAmount: 0,
    amountPaid: 0,
    outstanding: inv.outstanding,
    overdueDays: inv.overdueDays,
    riskLevel: inv.riskLevel,
  }));

  return (
    <div className="space-y-6">
      {/* Top 4 AR-specific KPIs */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(14rem,1fr))] gap-4">
        <KPI
          label="Collectible Outstanding"
          value={formatCurrency(data.arFocus.collectibleOutstanding, { currency: "USD" })}
          icon={AlertTriangle}
          iconBgColor="bg-blue-100"
        />
        <KPI
          label="Overdue Amount"
          value={formatCurrency(data.arFocus.overdueAmount, { currency: "USD" })}
          icon={AlertTriangle}
          iconBgColor="bg-red-100"
        />
        <KPI
          label="High-Risk Exposure"
          value={formatCurrency(data.arFocus.highRiskExposure, { currency: "USD" })}
          icon={Target}
          iconBgColor="bg-red-100"
        />
        <KPI
          label="Overdue Invoices"
          value={overdueCount}
          icon={FileText}
          iconBgColor="bg-amber-100"
        />
      </div>

      {/* Where to Collect First */}
      <div className="grid grid-cols-1 gap-6">
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-6">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Where to Collect First</h3>
              <p className="text-xs text-muted-foreground mt-1">
                Prioritized overdue invoices based on risk and amount
              </p>
            </div>
          </div>

          <div className="grid grid-cols-[repeat(auto-fit,minmax(14rem,1fr))] gap-4">
            {/* High priority */}
            <Link
              href={`/${workspaceId}/invoices?view=smart-high-risk`}
              className="flex flex-col rounded-lg border border-red-200 bg-gradient-to-br from-red-50 to-red-100/50 p-4 hover:border-red-300 transition-colors"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-700">
                  High Priority
                </span>
              </div>
              <div className="text-xs text-red-800 mb-1">
                {data.riskOverview.high.invoiceCount} invoice{data.riskOverview.high.invoiceCount !== 1 ? "s" : ""}
              </div>
              <div className="text-lg font-semibold text-red-900">
                {formatCurrency(data.riskOverview.high.amount, { currency: "USD" })}
              </div>
            </Link>

            {/* Medium */}
            <Link
              href={`/${workspaceId}/invoices?view=smart-medium-risk`}
              className="flex flex-col rounded-lg border border-amber-200 bg-gradient-to-br from-amber-50 to-amber-100/50 p-4 hover:border-amber-300 transition-colors"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700">
                  Medium Priority
                </span>
              </div>
              <div className="text-xs text-amber-800 mb-1">
                {data.riskOverview.medium.invoiceCount} invoice{data.riskOverview.medium.invoiceCount !== 1 ? "s" : ""}
              </div>
              <div className="text-lg font-semibold text-amber-900">
                {formatCurrency(data.riskOverview.medium.amount, { currency: "USD" })}
              </div>
            </Link>

            {/* Low */}
            <Link
              href={`/${workspaceId}/invoices?view=smart-low-risk`}
              className="flex flex-col rounded-lg border border-yellow-200 bg-gradient-to-br from-yellow-50 to-yellow-100/50 p-4 hover:border-yellow-300 transition-colors"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="inline-flex items-center rounded-full bg-yellow-100 px-2.5 py-0.5 text-xs font-medium text-yellow-700">
                  Low Priority
                </span>
              </div>
              <div className="text-xs text-yellow-800 mb-1">
                {data.riskOverview.low.invoiceCount} invoice{data.riskOverview.low.invoiceCount !== 1 ? "s" : ""}
              </div>
              <div className="text-lg font-semibold text-yellow-900">
                {formatCurrency(data.riskOverview.low.amount, { currency: "USD" })}
              </div>
            </Link>
          </div>
        </div>
      </div>

      {/* Tables — min-w-0 so grid children can shrink and tables scroll inside DataTableShell */}
      <div className="grid min-w-0 grid-cols-1 gap-6 sm:grid-cols-2">
        <div className="min-w-0">
          <TopOverdueClientsTable
            clients={data.arFocus.topOverdueClients}
            hasMore={data.arFocus.topOverdueClientsHasMore}
            workspaceId={workspaceId}
          />
        </div>
        <div className="min-w-0">
          <OverdueInvoicesTable
            invoices={overdueInvoicesForTable}
            workspaceId={workspaceId}
            hasMore={data.arFocus.overdueInvoicesHasMore}
          />
        </div>
      </div>
    </div>
  );
}
