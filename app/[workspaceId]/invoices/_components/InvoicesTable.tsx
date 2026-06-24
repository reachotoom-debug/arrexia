"use client";

import * as React from "react";
import { Eye, Pencil } from "lucide-react";
import { formatCurrency } from "@/lib/format/currency";
import { TableActionIconLink } from "@/components/table/TableActionIconLink";
import { SortableHeader } from "@/components/shared/sortable-header";
import { InvoicesBulkActions } from "./InvoicesBulkActions";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { SelectionProvider, SelectionContext } from "./InvoicesTableUnarchiveButton";
import { HorizontalScrollArea } from "@/components/table/HorizontalScrollArea";
import {
  TABLE_BASE,
  TABLE_ACTIONS_ROW,
  TABLE_CELL_TEXT_COL,
  TABLE_MIN_WIDTH_INNER,
  TABLE_ROW,
  TABLE_TD,
  TABLE_TD_RIGHT,
  TABLE_TH,
  TABLE_TH_RIGHT,
} from "@/components/table/tableShell";
import { DataTableShell } from "@/components/layout/DataTableShell";
import { EntityCard } from "@/components/ui/EntityCard";
import { EmptyState } from "@/components/ui/state";

function SelectAllCheckbox({
  checked,
  indeterminate,
  onChange,
}: {
  checked: boolean;
  indeterminate: boolean;
  onChange: () => void;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (inputRef.current) {
      inputRef.current.indeterminate = indeterminate;
    }
  }, [indeterminate]);

  return (
    <input
      ref={inputRef}
      type="checkbox"
      aria-label="Select all invoices"
      checked={checked}
      onChange={onChange}
      className="h-4 w-4 cursor-pointer accent-foreground"
    />
  );
}

interface Invoice {
  id: string;
  invoice_number: string | null;
  client_name: string | null;
  displayStatusNormalized: string;
  issue_date: string | null;
  due_date: string | null;
  total: number;
  totalPaid: number;
  outstanding: number;
  currency: string;
  risk: "high" | "medium" | "low" | "none";
  archived_at: string | null;
}

interface InvoicesTableProps {
  invoices: Invoice[];
  workspaceId: string;
  searchParams: Record<string, string | string[] | undefined>;
  isArchivedView?: boolean;
}

export function InvoicesTable({
  invoices: invoicesProp,
  workspaceId,
  searchParams,
  isArchivedView = false,
}: InvoicesTableProps) {
  // Try to use parent SelectionProvider, or create local state
  const parentSelection = React.useContext(SelectionContext);
  const [localSelectedIds, setLocalSelectedIds] = React.useState<Set<string>>(new Set());
  const selectedIds = parentSelection?.selectedIds ?? localSelectedIds;
  const setSelectedIds = parentSelection?.setSelectedIds ?? setLocalSelectedIds;
  // Manage invoices as state for optimistic updates
  const [invoices, setInvoices] = React.useState<Invoice[]>(invoicesProp);

  // Reset selection when status/tab changes (to avoid stale selection crossing tabs)
  const statusParam = Array.isArray(searchParams.status) ? searchParams.status[0] : searchParams.status;
  React.useEffect(() => {
    setSelectedIds(new Set());
  }, [statusParam, setSelectedIds]);

  // Update invoices when prop changes (e.g., after router.refresh())
  React.useEffect(() => {
    setInvoices(invoicesProp);
  }, [invoicesProp]);

  const getRiskBadge = (risk: "high" | "medium" | "low" | "none") => {
    if (risk === "high") {
      return "bg-red-100 text-red-700 border-red-300";
    } else if (risk === "medium") {
      return "bg-orange-100 text-orange-700 border-orange-300";
    } else if (risk === "low") {
      return "bg-yellow-100 text-yellow-700 border-yellow-300";
    }
    return "";
  };

  const toggleOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleAllVisible = () => {
    if (selectedIds.size === invoices.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(invoices.map((inv) => inv.id)));
    }
  };

  const allSelected = invoices.length > 0 && selectedIds.size === invoices.length;
  const someSelected = selectedIds.size > 0 && selectedIds.size < invoices.length;

  if (invoices.length === 0) {
    return (
      <EmptyState
        bare
        title="No invoices match your filters"
        message="Try clearing search or filters to see more invoices."
        actionLabel="Clear filters"
        actionHref={`/${workspaceId}/invoices`}
      />
    );
  }

  const formatListDate = (d: string | null) =>
    d ? new Date(d).toLocaleDateString() : "—";

  const content = (
    <div className="w-full">
        <InvoicesBulkActions
          workspaceId={workspaceId}
          invoices={invoices}
          selectedIds={selectedIds}
          onSelectionChange={setSelectedIds}
          onInvoicesChange={(updatedInvoices) => setInvoices(updatedInvoices as Invoice[])}
          isArchivedView={isArchivedView}
        />
        <div className="mt-2 space-y-2 md:hidden">
          {invoices.map((inv) => {
            const riskBadgeClass = getRiskBadge(inv.risk);
            const status = inv.displayStatusNormalized || "sent";
            const totalAmount = inv.total ?? 0;
            const amountPaid = inv.totalPaid ?? Math.max(inv.total - (inv.outstanding ?? 0), 0);
            const paidRatio = totalAmount > 0 ? Math.round((amountPaid / totalAmount) * 100) : 0;

            return (
              <EntityCard
                key={`m-${inv.id}`}
                leading={
                  <input
                    type="checkbox"
                    aria-label={`Select invoice ${inv.invoice_number || inv.id}`}
                    checked={selectedIds.has(inv.id)}
                    onChange={() => toggleOne(inv.id)}
                    onClick={(e) => e.stopPropagation()}
                    className="h-4 w-4 cursor-pointer accent-foreground"
                  />
                }
                title={
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate">{inv.invoice_number ?? "—"}</span>
                    {riskBadgeClass ? (
                      <span
                        className={`inline-flex shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-medium whitespace-nowrap ${riskBadgeClass}`}
                        title={`Risk: ${inv.risk}`}
                      >
                        {inv.risk === "high" ? "!" : inv.risk === "medium" ? "~" : "•"}
                      </span>
                    ) : null}
                  </span>
                }
                subtitle={inv.client_name ?? "—"}
                meta={
                  <span className="text-xs text-muted-foreground">
                    Issue {formatListDate(inv.issue_date)} · Due {formatListDate(inv.due_date)} ·{" "}
                    {paidRatio}% paid
                  </span>
                }
                amount={
                  <div className="text-right">
                    <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                      Outstanding
                    </div>
                    <div className="text-lg font-semibold tabular-nums text-slate-900">
                      {formatCurrency(Math.abs(inv.outstanding), { currency: inv.currency })}
                    </div>
                    <div className="mt-0.5 text-xs tabular-nums text-emerald-600">
                      Paid {formatCurrency(amountPaid, { currency: inv.currency })}
                    </div>
                  </div>
                }
                status={<StatusBadge type="invoice" status={status} />}
                actions={
                  <div className={TABLE_ACTIONS_ROW}>
                    <TableActionIconLink
                      href={`/${workspaceId}/invoices/${inv.id}`}
                      label="Open invoice"
                      icon={<Eye className="h-4 w-4" />}
                    />
                    {!isArchivedView && (
                      <TableActionIconLink
                        href={`/${workspaceId}/invoices/${inv.id}/edit`}
                        label="Edit invoice"
                        icon={<Pencil className="h-4 w-4" />}
                      />
                    )}
                  </div>
                }
              />
            );
          })}
        </div>
        <DataTableShell className="hidden md:block" disableInnerScroll>
        <HorizontalScrollArea
          className="relative w-full min-w-0"
          viewportClassName="overflow-x-auto scrollbar-thin scrollbar-transparent"
        >
          <div className={TABLE_MIN_WIDTH_INNER}>
        <table className={TABLE_BASE}>
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              {/* Selection */}
              <th className={TABLE_TH}>
                <SelectAllCheckbox
                  checked={allSelected}
                  indeterminate={someSelected}
                  onChange={toggleAllVisible}
                />
              </th>
              <th className={TABLE_TH}>
                <SortableHeader
                  label="Invoice #"
                  sortKey="invoice_number"
                  workspaceId={workspaceId}
                  currentParams={searchParams}
                />
              </th>
              <th className={`${TABLE_CELL_TEXT_COL} ${TABLE_TH}`}>
                <SortableHeader
                  label="Client"
                  sortKey="client_name"
                  workspaceId={workspaceId}
                  currentParams={searchParams}
                />
              </th>
              <th className={TABLE_TH}>Status</th>
              <th className={`hidden md:table-cell ${TABLE_TH}`}>
                <SortableHeader
                  label="Issue Date"
                  sortKey="issue_date"
                  workspaceId={workspaceId}
                  currentParams={searchParams}
                />
              </th>
              <th className={`hidden md:table-cell ${TABLE_TH}`}>
                <SortableHeader
                  label="Due Date"
                  sortKey="due_date"
                  workspaceId={workspaceId}
                  currentParams={searchParams}
                />
              </th>
              <th className={TABLE_TH_RIGHT}>
                <SortableHeader
                  label="Total"
                  sortKey="total"
                  workspaceId={workspaceId}
                  currentParams={searchParams}
                  align="right"
                />
              </th>
              <th className={`hidden lg:table-cell ${TABLE_TH_RIGHT}`}>Amount Paid</th>
              <th className={`hidden lg:table-cell ${TABLE_TH_RIGHT}`}>
                <SortableHeader
                  label="Outstanding"
                  sortKey="outstanding"
                  workspaceId={workspaceId}
                  currentParams={searchParams}
                  align="right"
                />
              </th>
              <th className={TABLE_TH_RIGHT}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv) => {
              // Use per-invoice currency for list view formatting
              const riskBadgeClass = getRiskBadge(inv.risk);
              const status = inv.displayStatusNormalized || "sent";
              const totalAmount = inv.total ?? 0;
              const amountPaid = inv.totalPaid ?? Math.max(inv.total - (inv.outstanding ?? 0), 0);
              const paidRatio = totalAmount > 0 ? Math.round((amountPaid / totalAmount) * 100) : 0;

              return (
                <tr key={inv.id} className={TABLE_ROW}>
                  {/* Selection */}
                  <td
                    className={TABLE_TD}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <input
                      type="checkbox"
                      aria-label={`Select invoice ${inv.invoice_number || inv.id}`}
                      checked={selectedIds.has(inv.id)}
                      onChange={() => toggleOne(inv.id)}
                      onClick={(e) => e.stopPropagation()}
                      className="h-4 w-4 cursor-pointer accent-foreground"
                    />
                  </td>
                  <td className={`${TABLE_TD} text-sm font-semibold text-slate-900 whitespace-nowrap`}>
                    <div className="flex flex-nowrap items-center gap-2">
                      {inv.invoice_number ?? "—"}
                      {riskBadgeClass && (
                        <span
                          className={`inline-flex shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-medium whitespace-nowrap ${riskBadgeClass}`}
                          title={`Risk: ${inv.risk}`}
                        >
                          {inv.risk === "high" ? "!" : inv.risk === "medium" ? "~" : "•"}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className={`${TABLE_CELL_TEXT_COL} ${TABLE_TD} text-sm font-medium text-slate-900`}>
                    <span className="break-words">{inv.client_name ?? "—"}</span>
                  </td>
                  <td className={`${TABLE_TD} text-sm leading-5 whitespace-nowrap`}>
                    <div className="flex flex-col leading-tight">
                      <StatusBadge type="invoice" status={status} />
                      <span className="text-xs text-muted-foreground">{paidRatio}% paid</span>
                    </div>
                  </td>
                  <td className={`hidden md:table-cell ${TABLE_TD} text-sm text-slate-500 whitespace-nowrap`}>
                    {inv.issue_date ? new Date(inv.issue_date).toLocaleDateString() : "—"}
                  </td>
                  <td className={`hidden md:table-cell ${TABLE_TD} text-sm text-slate-500 whitespace-nowrap`}>
                    {inv.due_date ? new Date(inv.due_date).toLocaleDateString() : "—"}
                  </td>
                  <td className={`${TABLE_TD_RIGHT} text-sm text-blue-600`}>
                    {formatCurrency(inv.total, { currency: inv.currency })}
                  </td>
                  <td className={`hidden lg:table-cell ${TABLE_TD_RIGHT} text-sm font-medium text-emerald-600`}>
                    {formatCurrency(inv.totalPaid ?? Math.max(inv.total - (inv.outstanding ?? 0), 0), { currency: inv.currency })}
                  </td>
                  <td className={`hidden lg:table-cell ${TABLE_TD_RIGHT} text-sm text-slate-900`}>
                    {formatCurrency(Math.abs(inv.outstanding), { currency: inv.currency })}
                  </td>
                  <td className={`${TABLE_TD_RIGHT} text-sm leading-5`}>
                    <div className={TABLE_ACTIONS_ROW}>
                      <TableActionIconLink
                        href={`/${workspaceId}/invoices/${inv.id}`}
                        label="Open invoice"
                        icon={<Eye className="h-4 w-4" />}
                      />
                      {!isArchivedView && (
                        <TableActionIconLink
                          href={`/${workspaceId}/invoices/${inv.id}/edit`}
                          label="Edit invoice"
                          icon={<Pencil className="h-4 w-4" />}
                        />
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
          </div>
        </HorizontalScrollArea>
        </DataTableShell>
    </div>
  );

  // If parent SelectionProvider exists, don't wrap again; otherwise provide one
  if (parentSelection) {
    return content;
  }

  return (
    <SelectionProvider value={{ selectedIds, setSelectedIds }}>
      {content}
    </SelectionProvider>
  );
}
