"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Eye, Pencil, Archive, ArchiveRestore } from "lucide-react";
import { EmptyState } from "@/components/ui/state";
import { TableActionIconLink } from "@/components/table/TableActionIconLink";
import { archivePayment, unarchivePayment } from "../actions";
import type { PaymentSort, PaymentStatus } from "../_lib/getPayments";
import { PaymentsBulkActions } from "./PaymentsBulkActions";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { prettyLabel } from "@/lib/formatters/prettyLabel";
import { formatCurrency } from "@/lib/format/currency";
import { HorizontalScrollArea } from "@/components/table/HorizontalScrollArea";
import { DataTableShell } from "@/components/layout/DataTableShell";
import {
  TABLE_BASE,
  TABLE_MIN_WIDTH_INNER,
  TABLE_ROW,
  TABLE_TD,
  TABLE_TD_RIGHT,
  TABLE_TH,
  TABLE_TH_RIGHT,
} from "@/components/table/tableShell";

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

interface PaymentRow {
  id: string;
  payment_date: string; // ISO string
  amount: number | string;
  currency: string | null;
  method: string | null;
  status: string; // "completed" | "pending" | "failed" | "refunded" | etc.
  transaction_id: string | null;
  payment_provider: string | null;
  archived_at?: string | null;
  invoice_number?: string | null;
  client_name?: string | null;
  invoices?: { invoice_number?: string | null; clients?: { name?: string | null } | null } | null;
  clients?: { name?: string | null } | null;
}

interface PaymentsTableProps {
  payments: PaymentRow[];
  workspaceId: string;
  searchParams?: Record<string, string | string[] | undefined>;
  totalFilteredCount?: number;
  currentSort: PaymentSort;
  currentStatus: PaymentStatus;
  currentSearch: string;
  hasAnyPayments?: boolean;
}

export function PaymentsTable({ 
  payments: paymentsProp, 
  workspaceId,
  searchParams = {},
  totalFilteredCount = 0,
  currentSort,
  currentStatus,
  currentSearch,
  hasAnyPayments = false,
}: PaymentsTableProps) {
  const router = useRouter();
  const pathname = usePathname();
  const urlSearchParams = useSearchParams();
  
  const [searchTerm, setSearchTerm] = useState(currentSearch);
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
  const dropdownRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // Manage payments as state for optimistic updates
  const [payments, setPayments] = useState<PaymentRow[]>(paymentsProp);

  // Reset selection when status/tab changes (to avoid stale selection crossing tabs)
  useEffect(() => {
    setSelectedIds(new Set());
  }, [currentStatus]);

  // Update payments when prop changes (e.g., after router.refresh())
  useEffect(() => {
    setPayments(paymentsProp);
  }, [paymentsProp]);

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

  const allSelected = payments.length > 0 && selectedIds.size === payments.length;
  const someSelected = selectedIds.size > 0 && selectedIds.size < payments.length;
  
  // Sync search term with URL param
  useEffect(() => {
    setSearchTerm(currentSearch);
  }, [currentSearch]);
  
  // Helper to update URL params (following InvoicesTable pattern)
  const updateUrl = (updates: {
    view?: PaymentSort;
    status?: PaymentStatus;
    q?: string;
    page?: number;
  }) => {
    const params = new URLSearchParams(urlSearchParams.toString());
    
    if (updates.view !== undefined) {
      if (updates.view === "default") {
        params.delete("view");
      } else {
        params.set("view", updates.view);
      }
    }
    
    if (updates.status !== undefined) {
      if (updates.status === "all") {
        params.delete("status");
      } else {
        params.set("status", updates.status);
      }
    }
    
    if (updates.q !== undefined) {
      if (updates.q === "") {
        params.delete("q");
      } else {
        params.set("q", updates.q);
      }
    }
    
    if (updates.page !== undefined) {
      if (updates.page === 1) {
        params.delete("page");
      } else {
        params.set("page", updates.page.toString());
      }
    } else if (updates.view !== undefined || updates.status !== undefined || updates.q !== undefined) {
      // Reset to page 1 when filters change
      params.delete("page");
    }
    
    router.push(`${pathname}${params.toString() ? `?${params.toString()}` : ""}`);
  };


  // Reset filters handler - resets to default: default + all
  const handleResetFilters = () => {
    updateUrl({ view: "default", status: "all", q: "" });
  };
  
  // Handlers that update URL params
  const handleSortChange = (preset: PaymentSort) => {
    updateUrl({ view: preset });
  };
  
  const handleStatusFilterChange = (status: PaymentStatus) => {
    updateUrl({ status });
  };
  
  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateUrl({ q: searchTerm });
  };
  
  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
  };

  const formatMoney = (amount: number, currency?: string | null) => {
    return formatCurrency(amount, { currency });
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };


  const getPresetLabel = (preset: PaymentSort): string => {
    switch (preset) {
      case "default":
        return "Default sort";
      case "recentFirst":
        return "Most recent payments first";
      case "largestFirst":
        return "Largest payments first";
      case "failedFirst":
        return "Failed payments first";
      default:
        return "Default sort";
    }
  };

  const SORT_PRESETS: { key: PaymentSort; label: string }[] = [
    { key: "default", label: "Default View" },
    { key: "recentFirst", label: "Recent first" },
    { key: "largestFirst", label: "Largest first" },
    { key: "failedFirst", label: "Failed first" },
  ];
  
  const STATUS_OPTIONS: { key: PaymentStatus; label: string }[] = [
    { key: "all", label: "All" },
    { key: "completed", label: "Completed" },
    { key: "pending", label: "Pending" },
    { key: "failed", label: "Failed" },
    { key: "refunded", label: "Refunded" },
    { key: "archived", label: "Archived" },
  ];

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (openDropdownId) {
        const ref = dropdownRefs.current[openDropdownId];
        if (ref && !ref.contains(event.target as Node)) {
          setOpenDropdownId(null);
        }
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [openDropdownId]);

  return (
    <div className="space-y-4">
      <div className="flex w-full max-w-full flex-col gap-3 py-2">
      {/* Sort Preset Chips */}
      <div className="flex w-full max-w-full items-center justify-between gap-2">
        <div className="flex w-full max-w-full flex-wrap gap-2">
        {SORT_PRESETS.map((preset) => (
          <button
            key={preset.key}
            type="button"
            onClick={() => handleSortChange(preset.key)}
            className={
              "inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition " +
              (currentSort === preset.key
                ? "border-blue-600 bg-blue-50 text-blue-700"
                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50")
            }
          >
            {preset.label}
          </button>
        ))}
        </div>
      </div>

      {/* Status chips + search */}
      <div className="flex w-full max-w-full flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex w-full max-w-full flex-wrap gap-2">
          {STATUS_OPTIONS.map((chip) => (
            <button
              key={chip.key}
              type="button"
              onClick={() => handleStatusFilterChange(chip.key)}
              className={
                currentStatus === chip.key
                  ? "rounded-full bg-slate-900 px-3 py-1 text-xs font-medium text-white"
                  : "rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-600 hover:bg-slate-50"
              }
            >
              {chip.label}
            </button>
          ))}
        </div>

        <div className="flex w-full max-w-full flex-col gap-2 md:flex-row md:items-center">
          <form onSubmit={handleSearchSubmit} className="flex min-w-0 w-full gap-2 md:w-auto">
            <input
              type="text"
              placeholder="Search transaction, client, or invoice..."
              value={searchTerm}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="h-9 rounded-lg border border-slate-200 px-3 text-sm"
            />
          </form>
          <button
            type="button"
            onClick={handleResetFilters}
            className="h-9 rounded-lg border border-slate-200 px-3 text-xs text-slate-600 hover:bg-slate-50"
          >
            Reset filters
          </button>
        </div>
      </div>
      </div>

      {/* Helper text for active preset */}
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <span>Sorted by:</span>
        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-[11px] font-medium text-slate-700">
          {getPresetLabel(currentSort)}
        </span>
      </div>

      {/* Table or empty state depending on filters */}
      {totalFilteredCount === 0 ? (
        hasAnyPayments ? (
          <div className="p-8">
            <EmptyState
              title="No payments match your filters"
              message="Try clearing search or filters to see more payments."
              actionLabel="Reset filters"
              onAction={handleResetFilters}
            />
          </div>
        ) : (
          <div className="p-8">
            <EmptyState
              title="No payments recorded"
              message="Record a payment against an invoice to see it here."
              actionLabel="Record payment"
              actionHref={`/${workspaceId}/payments/new`}
            />
          </div>
        )
      ) : (
        <div className="w-full">
          <PaymentsBulkActions
            workspaceId={workspaceId}
            payments={payments as any}
            selectedIds={selectedIds}
            onSelectionChange={setSelectedIds}
            onPaymentsChange={(updatedPayments) => setPayments(updatedPayments as unknown as PaymentRow[])}
            status={currentStatus}
          />
          <DataTableShell disableInnerScroll>
          <HorizontalScrollArea className="relative w-full min-w-0" viewportClassName="overflow-x-auto scrollbar-thin scrollbar-transparent">
            <div className={TABLE_MIN_WIDTH_INNER}>
            <table className={`${TABLE_BASE} divide-y divide-slate-100`}>
              <thead className="bg-slate-50/60 border-b border-slate-200">
                <tr>
                  {/* Selection */}
                  <th className={`w-[40px] ${TABLE_TH}`}>
                    <SelectAllCheckbox
                      checked={allSelected}
                      indeterminate={someSelected}
                      onChange={toggleAllVisible}
                    />
                  </th>
                  <th className={`hidden md:table-cell ${TABLE_TH}`}>Date</th>
                  <th className={TABLE_TH}>Client</th>
                  <th className={TABLE_TH}>Invoice #</th>
                  <th className={TABLE_TH_RIGHT}>Amount</th>
                  <th className={`hidden lg:table-cell ${TABLE_TH}`}>Method</th>
                  <th className={`hidden lg:table-cell ${TABLE_TH}`}>Provider</th>
                  <th className={TABLE_TH}>Status</th>
                  <th className={TABLE_TH_RIGHT}>Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {payments.map((p) => (
                <tr key={p.id} className={TABLE_ROW}>
                  {/* Selection */}
                  <td
                    className={TABLE_TD}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <input
                      type="checkbox"
                      aria-label={`Select payment ${p.id}`}
                      checked={selectedIds.has(p.id)}
                      onChange={() => toggleOne(p.id)}
                      onClick={(e) => e.stopPropagation()}
                      className="h-4 w-4 cursor-pointer accent-foreground"
                    />
                  </td>
                  <td className={`hidden md:table-cell ${TABLE_TD} text-sm text-slate-700`}>
                    {formatDate(p.payment_date)}
                  </td>
                  <td className={`min-w-0 ${TABLE_TD} text-slate-800`}>
                    <div className="break-words" title={p.client_name ?? p.invoices?.clients?.name ?? p.clients?.name ?? "—"}>
                      {p.client_name ?? p.invoices?.clients?.name ?? p.clients?.name ?? "—"}
                    </div>
                  </td>
                  <td className={`${TABLE_TD} text-slate-800`}>
                    {p.invoice_number ?? p.invoices?.invoice_number ?? "—"}
                  </td>
                  <td className={`${TABLE_TD_RIGHT} text-sm font-medium text-slate-900`}>
                    {formatMoney(Number(p.amount), p.currency || "USD")}
                  </td>
                  <td className={`hidden lg:table-cell ${TABLE_TD} text-sm text-slate-700`}>
                    {prettyLabel(p.method)}
                  </td>
                  <td className={`hidden lg:table-cell ${TABLE_TD} text-sm text-slate-500`}>
                    {p.payment_provider ?? "—"}
                  </td>
                  <td className={`${TABLE_TD} whitespace-nowrap`}>
                    <StatusBadge type="payment" status={p.status} />
                  </td>
                  <td className={`${TABLE_TD_RIGHT} text-sm`}>
                    <div className="flex items-center justify-end gap-1">
                      <TableActionIconLink
                        href={`/${workspaceId}/payments/${p.id}`}
                        label="View payment"
                        icon={<Eye className="h-4 w-4" />}
                      />
                      {!p.archived_at && (
                        <>
                          <TableActionIconLink
                            href={`/${workspaceId}/payments/${p.id}/edit`}
                            label="Edit payment"
                            icon={<Pencil className="h-4 w-4" />}
                          />
                          <button
                            onClick={async () => {
                              try {
                                await archivePayment(workspaceId, p.id);
                                router.refresh();
                              } catch (error) {
                                alert("Failed to archive payment");
                              }
                            }}
                            className="p-1.5 rounded-md hover:bg-slate-100 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
                            aria-label="Archive payment"
                            title="Archive payment"
                          >
                            <Archive className="h-4 w-4 text-slate-600" />
                          </button>
                        </>
                      )}
                      {p.archived_at && (
                        <button
                          onClick={async () => {
                            try {
                              await unarchivePayment(workspaceId, p.id);
                              router.refresh();
                            } catch (error) {
                              alert("Failed to restore payment");
                            }
                          }}
                          className="p-1.5 rounded-md hover:bg-slate-100 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
                          aria-label="Restore payment"
                          title="Restore payment"
                        >
                          <ArchiveRestore className="h-4 w-4 text-slate-600" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
            </div>
        </HorizontalScrollArea>
        </DataTableShell>
        </div>
      )}
    </div>
  );
}
