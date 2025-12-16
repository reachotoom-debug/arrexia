"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { EmptyState } from "@/components/ui/state";
import type { PaymentSort, PaymentStatus } from "../_lib/getPayments";

interface PaymentRow {
  id: string;
  payment_date: string; // ISO string
  amount: number | string;
  currency: string | null;
  method: string | null;
  status: string; // "completed" | "pending" | "failed" | "refunded" | etc.
  transaction_id: string | null;
  payment_provider: string | null;
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
  payments, 
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

  const visiblePayments = payments ?? [];

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

  const formatMoney = (amount: number, currency: string = "USD") => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
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
      {/* Sort Preset Chips */}
      <div className="flex flex-wrap gap-2">
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

      {/* Top controls row */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Status chips */}
        <div className="flex flex-wrap gap-2">
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

        {/* Search + Reset */}
        <div className="flex flex-wrap items-center gap-2">
          <form onSubmit={handleSearchSubmit} className="flex gap-2">
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
            />
          </div>
        ) : (
          <div className="p-8">
            <EmptyState
              title="No payments recorded"
              message="Record a payment against an invoice to see it here."
            />
          </div>
        )
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full table-fixed divide-y divide-slate-100 text-sm">
            <thead className="bg-slate-50/60 text-xs font-medium uppercase text-slate-500">
              <tr>
                <th className="w-[120px] px-4 py-3 text-left">Date</th>
                <th className="w-[180px] px-4 py-3 text-left">Client</th>
                <th className="w-[120px] px-4 py-3 text-left">Invoice #</th>
                <th className="w-[120px] px-4 py-3 text-right">Amount</th>
                <th className="w-[100px] px-4 py-3 text-left">Method</th>
                <th className="w-[120px] px-4 py-3 text-left">Provider</th>
                <th className="w-[110px] px-4 py-3 text-left">Status</th>
                <th className="w-[80px] px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {visiblePayments.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50">
                  <td className="px-4 py-4 text-sm text-slate-700 whitespace-nowrap">
                    {formatDate(p.payment_date)}
                  </td>
                  <td className="px-4 py-4 text-slate-800">
                    <div className="truncate" title={p.invoices?.clients?.name ?? p.clients?.name ?? "—"}>
                      {p.invoices?.clients?.name ?? p.clients?.name ?? "—"}
                    </div>
                  </td>
                  <td className="px-4 py-4 text-slate-800 whitespace-nowrap">
                    {p.invoices?.invoice_number ?? "—"}
                  </td>
                  <td className="px-4 py-4 text-right font-medium text-slate-900 tabular-nums whitespace-nowrap">
                    {formatMoney(Number(p.amount), p.currency || "USD")}
                  </td>
                  <td className="px-4 py-4 text-sm text-slate-700 capitalize whitespace-nowrap">
                    {p.method ?? "—"}
                  </td>
                  <td className="px-4 py-4 text-sm text-slate-500 whitespace-nowrap">
                    {p.payment_provider ?? "—"}
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap">
                    <span
                      className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium capitalize ${getStatusBadge(
                        p.status
                      )}`}
                    >
                      {p.status}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-right whitespace-nowrap">
                    <div className="relative inline-block" ref={(el) => { dropdownRefs.current[p.id] = el; }}>
                      <button
                        type="button"
                        onClick={() => setOpenDropdownId(openDropdownId === p.id ? null : p.id)}
                        className="inline-flex items-center justify-center rounded-md p-1.5 text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        aria-label="Actions"
                      >
                        <svg
                          className="h-5 w-5"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"
                          />
                        </svg>
                      </button>
                      {openDropdownId === p.id && (
                        <div className="absolute right-0 z-10 mt-2 w-48 origin-top-right rounded-md bg-white shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none">
                          <div className="py-1">
                            <button
                              onClick={() => {
                                router.push(`/${workspaceId}/payments/${p.id}`);
                                setOpenDropdownId(null);
                              }}
                              className="block w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-100"
                            >
                              View payment
                            </button>
                            <button
                              onClick={() => {
                                router.push(`/${workspaceId}/payments/${p.id}/edit`);
                                setOpenDropdownId(null);
                              }}
                              className="block w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-100"
                            >
                              Edit payment
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
