// @ts-nocheck
"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { Eye, Pencil } from "lucide-react";
import { SortableHeader } from "@/components/shared/sortable-header";
import { TableActionIconLink } from "@/components/table/TableActionIconLink";
import { PaymentsBulkActions } from "@/app/[workspaceId]/payments/_components/PaymentsBulkActions";
import { formatCurrency } from "@/lib/format/currency";
import { PaginationBar } from "@/components/PaginationBar";
import { HorizontalScrollArea } from "@/components/table/HorizontalScrollArea";
import { buildPaymentsUrl } from "@/app/[workspaceId]/payments/_lib/buildPaymentsUrl";
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

export interface PaymentRow {
  id: string;
  workspace_id: string;
  invoice_id: string | null;
  payment_date: string;
  amount: number;
  currency: string;
  method: string | null;
  status: string;
  transaction_id: string | null;
  notes: string | null;
  payment_provider: string | null;
  created_at: string;
  updated_at: string;
  invoice_number: string | null;
  client_name: string | null;
  archived_at?: string | null;
  invoices?: {
    id?: string | null;
    invoice_number?: string | null;
    clients?: { name?: string | null } | null;
  } | null;
}

type PaymentStatusParam = "all" | "completed" | "pending" | "failed" | "refunded" | "archived";
type PaymentListViewParam = "default" | "recent-first" | "largest-first" | "failed-first";
type PaymentSortKey = "payment_date" | "amount" | "method" | "payment_provider" | "client_name" | "invoice_number" | null;

interface PaymentsTableProps {
  rows: PaymentRow[];
  workspaceId: string;
  searchParams: Record<string, string | string[] | undefined>;
  currentPage: number;
  totalPages: number;
  totalCount: number;
  anyPaymentsCount?: number;
  view: PaymentListViewParam;
  status: PaymentStatusParam;
  sort: PaymentSortKey;
  dir: "asc" | "desc";
  q: string;
}

function SelectAllCheckbox({
  checked,
  indeterminate,
  onChange,
}: {
  checked: boolean;
  indeterminate: boolean;
  onChange: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.indeterminate = indeterminate;
    }
  }, [indeterminate]);

  return (
    <input
      ref={inputRef}
      type="checkbox"
      aria-label="Select all payments"
      checked={checked}
      onChange={onChange}
      className="h-4 w-4 cursor-pointer accent-foreground"
    />
  );
}

export default function PaymentsTable({
  rows,
  workspaceId,
  searchParams,
  currentPage,
  totalPages,
  totalCount,
  anyPaymentsCount,
  view: _view,
  status,
  sort,
  dir,
  q: _q,
}: PaymentsTableProps) {
  // Selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // Manage payments as state for optimistic updates
  const [payments, setPayments] = useState<PaymentRow[]>(rows);
  
  // Reset selection when status/tab changes (to avoid stale selection crossing tabs)
  useEffect(() => {
    setSelectedIds(new Set());
  }, [status]);
  
  // Update payments when prop changes (e.g., after router.refresh())
  useEffect(() => {
    setPayments(rows);
  }, [rows]);
  
  // Selection handlers
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
    if (selectedIds.size === payments.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(payments.map((p) => p.id)));
    }
  };
  
  const allVisibleSelected = payments.length > 0 && selectedIds.size === payments.length;
  const someVisibleSelected = selectedIds.size > 0 && selectedIds.size < payments.length;

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "—";
    try {
      return new Date(dateString).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch {
      return "Invalid Date";
    }
  };

  const getStatusBadge = (status: string) => {
    const statusLower = status.toLowerCase();
    if (statusLower === "completed") {
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    } else if (statusLower === "pending") {
      return "bg-amber-50 text-amber-700 border-amber-200";
    } else if (statusLower === "failed") {
      return "bg-red-50 text-red-700 border-red-200";
    } else if (statusLower === "refunded") {
      return "bg-slate-50 text-slate-700 border-slate-200";
    }
    return "bg-slate-50 text-slate-700 border-slate-200";
  };

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Table or empty state */}
      {rows.length === 0 ? (
        <EmptyState
          title={
            status === "archived"
              ? "No archived payments"
              : "No payments match your filters"
          }
          message={
            status === "archived"
              ? "You don't have any archived payments. Active payments are shown under the All tab."
              : "Try clearing search or filters to see more payments."
          }
          actionLabel="View all payments"
          actionHref={`/${workspaceId}/payments`}
        />
      ) : (
        <>
          <PaymentsBulkActions
            workspaceId={workspaceId}
            payments={payments}
            selectedIds={selectedIds}
            onSelectionChange={setSelectedIds}
            onPaymentsChange={setPayments}
            status={status}
          />
          <div className="mt-2 space-y-2 md:hidden">
            {payments.map((p) => (
              <EntityCard
                key={`m-${p.id}`}
                leading={
                  <input
                    type="checkbox"
                    checked={selectedIds.has(p.id)}
                    onChange={() => toggleOne(p.id)}
                    className="h-4 w-4 cursor-pointer accent-foreground"
                    aria-label={`Select payment ${p.id}`}
                  />
                }
                title={p.client_name || "—"}
                subtitle={formatDate(p.payment_date)}
                meta={
                  <div className="space-y-0.5 text-xs text-muted-foreground">
                    <div>
                      {p.invoices?.invoice_number || p.invoice_number ? (
                        p.invoices?.id || p.invoice_id ? (
                          <Link
                            href={`/${workspaceId}/invoices/${p.invoices?.id || p.invoice_id}`}
                            className="font-medium text-blue-600 hover:underline"
                          >
                            {p.invoices?.invoice_number || p.invoice_number}
                          </Link>
                        ) : (
                          p.invoices?.invoice_number || p.invoice_number
                        )
                      ) : (
                        "—"
                      )}
                    </div>
                    <div className="capitalize">
                      {(p.method ?? "—").replace(/_/g, " ").toLowerCase()}
                      {p.payment_provider ? ` · ${p.payment_provider}` : ""}
                    </div>
                  </div>
                }
                amount={
                  <span className="text-lg font-semibold tabular-nums text-slate-900">
                    {formatCurrency(p.amount, { currency: p.currency })}
                  </span>
                }
                status={
                  <span
                    className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium capitalize ${getStatusBadge(
                      p.status
                    )}`}
                  >
                    {p.status}
                  </span>
                }
                actions={
                  <div className={TABLE_ACTIONS_ROW}>
                    <TableActionIconLink
                      href={`/${workspaceId}/payments/${p.id}`}
                      label="Open payment"
                      icon={<Eye className="h-4 w-4" />}
                    />
                    {status !== "archived" && !p.archived_at && (
                      <TableActionIconLink
                        href={`/${workspaceId}/payments/${p.id}/edit`}
                        label="Edit payment"
                        icon={<Pencil className="h-4 w-4" />}
                      />
                    )}
                  </div>
                }
              />
            ))}
          </div>
          <DataTableShell className="hidden md:block" disableInnerScroll>
          <HorizontalScrollArea
            className="relative w-full min-w-0"
            viewportClassName="overflow-x-auto scrollbar-thin scrollbar-transparent"
          >
          <div className={TABLE_MIN_WIDTH_INNER}>
          <table className={`${TABLE_BASE} divide-y divide-slate-100`}>
            <thead className="bg-slate-50/60 border-b border-slate-200">
              <tr>
                <th className={`w-[40px] ${TABLE_TH}`}>
                  <SelectAllCheckbox
                    checked={allVisibleSelected}
                    indeterminate={someVisibleSelected}
                    onChange={toggleAllVisible}
                  />
                </th>
                <th className={`w-[120px] ${TABLE_TH}`}>
                  <SortableHeader
                    label="Date"
                    sortKey="payment_date"
                    workspaceId={workspaceId}
                    currentParams={searchParams}
                    basePath={`/${workspaceId}/payments`}
                  />
                </th>
                <th className={`${TABLE_CELL_TEXT_COL} w-[180px] ${TABLE_TH}`}>
                  <SortableHeader
                    label="Client"
                    sortKey="client_name"
                    workspaceId={workspaceId}
                    currentParams={searchParams}
                    basePath={`/${workspaceId}/payments`}
                  />
                </th>
                <th className={`w-[120px] ${TABLE_TH}`}>
                  <SortableHeader
                    label="Invoice #"
                    sortKey="invoice_number"
                    workspaceId={workspaceId}
                    currentParams={searchParams}
                    basePath={`/${workspaceId}/payments`}
                  />
                </th>
                <th className={`w-[120px] ${TABLE_TH_RIGHT}`}>
                  <SortableHeader
                    label="Amount"
                    sortKey="amount"
                    workspaceId={workspaceId}
                    currentParams={searchParams}
                    basePath={`/${workspaceId}/payments`}
                    align="right"
                  />
                </th>
                <th className={`w-[100px] ${TABLE_TH}`}>
                  <SortableHeader
                    label="Method"
                    sortKey="method"
                    workspaceId={workspaceId}
                    currentParams={searchParams}
                    basePath={`/${workspaceId}/payments`}
                  />
                </th>
                <th className={`hidden lg:table-cell w-[120px] ${TABLE_TH}`}>
                  <SortableHeader
                    label="Provider"
                    sortKey="payment_provider"
                    workspaceId={workspaceId}
                    currentParams={searchParams}
                    basePath={`/${workspaceId}/payments`}
                  />
                </th>
                <th className={`w-[110px] ${TABLE_TH}`}>Status</th>
                <th className={`w-[88px] ${TABLE_TH_RIGHT}`}>Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {payments.map((p) => {
                return (
                <tr key={p.id} className={TABLE_ROW}>
                  <td className={TABLE_TD}>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(p.id)}
                      onChange={() => toggleOne(p.id)}
                      className="h-4 w-4 cursor-pointer accent-foreground"
                      aria-label={`Select payment ${p.id}`}
                    />
                  </td>
                  <td className={`${TABLE_TD} text-sm text-slate-700 whitespace-nowrap`}>
                    {formatDate(p.payment_date)}
                  </td>
                  <td className={`${TABLE_CELL_TEXT_COL} ${TABLE_TD} text-sm text-slate-800`} title={p.client_name || "—"}>
                    {p.client_name || "—"}
                  </td>
                  <td className={`${TABLE_TD} text-sm text-slate-800 whitespace-nowrap`}>
                    {p.invoices?.invoice_number || p.invoice_number ? (
                      p.invoices?.id || p.invoice_id ? (
                        <Link
                          href={`/${workspaceId}/invoices/${p.invoices?.id || p.invoice_id}`}
                          className="text-blue-600 hover:text-blue-700"
                          title="Open invoice"
                        >
                          {p.invoices?.invoice_number || p.invoice_number}
                        </Link>
                      ) : (
                        p.invoices?.invoice_number || p.invoice_number
                      )
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className={`${TABLE_TD_RIGHT} text-sm font-medium text-slate-900`}>
                    {formatCurrency(p.amount, { currency: p.currency })}
                  </td>
                  <td className={`${TABLE_TD} text-sm text-slate-700 whitespace-nowrap`}>
                    {(p.method ?? "—").replace(/_/g, " ").toLowerCase().replace(/^./, (c) => c.toUpperCase())}
                  </td>
                  <td className={`hidden lg:table-cell ${TABLE_TD} text-sm text-slate-500 whitespace-nowrap`}>
                    {p.payment_provider || "—"}
                  </td>
                  <td className={`${TABLE_TD} text-sm leading-5 whitespace-nowrap`}>
                    <span
                      className={`inline-flex rounded-full border px-1.5 py-0.5 text-xs font-medium capitalize ${getStatusBadge(
                        p.status
                      )}`}
                    >
                      {p.status}
                    </span>
                  </td>
                  <td className={`${TABLE_TD_RIGHT} text-sm leading-5`}>
                    {/* Actions: Hide Edit if status=archived OR row.archived_at != null */}
                    {/* Archive/Unarchive actions are ONLY available via bulk selection bar */}
                    <div className={TABLE_ACTIONS_ROW}>
                      <TableActionIconLink
                        href={`/${workspaceId}/payments/${p.id}`}
                        label="Open payment"
                        icon={<Eye className="h-4 w-4" />}
                      />
                      {/* Edit icon: only shown if not archived (check both status filter and row.archived_at) */}
                      {status !== "archived" && !p.archived_at && (
                        <TableActionIconLink
                          href={`/${workspaceId}/payments/${p.id}/edit`}
                          label="Edit payment"
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
        </>
      )}

      {/* Pagination */}
      <PaginationBar
        currentPage={currentPage}
        totalPages={totalPages}
        totalItems={totalCount}
        itemLabel={`payment${totalCount !== 1 ? "s" : ""}`}
        basePath={`/${workspaceId}/payments`}
        queryParams={searchParams}
      />
    </div>
  );
}
