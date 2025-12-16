"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import Link from "next/link";
import { SortableHeader } from "@/components/shared/sortable-header";
import { ResetFiltersButton } from "@/components/shared/reset-filters-button";

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
}

type PaymentStatusParam = "all" | "completed" | "pending" | "failed" | "refunded";
type PaymentListViewParam = "default" | "recent-first" | "largest-first" | "failed-first";
type PaymentSortKey = "payment_date" | "amount" | "method" | "payment_provider" | "client_name" | "invoice_number" | null;

interface PaymentsTableProps {
  rows: PaymentRow[];
  workspaceId: string;
  searchParams: Record<string, string | string[] | undefined>;
  currentPage: number;
  totalPages: number;
  totalCount: number;
  view: PaymentListViewParam;
  status: PaymentStatusParam;
  sort: PaymentSortKey;
  dir: "asc" | "desc";
  q: string;
}

const SORT_PRESETS: { key: PaymentListViewParam; label: string }[] = [
  { key: "default", label: "Default View" },
  { key: "recent-first", label: "Recent first" },
  { key: "largest-first", label: "Largest first" },
  { key: "failed-first", label: "Failed first" },
];

const STATUS_FILTERS: { key: PaymentStatusParam; label: string }[] = [
  { key: "all", label: "All" },
  { key: "completed", label: "Completed" },
  { key: "pending", label: "Pending" },
  { key: "failed", label: "Failed" },
  { key: "refunded", label: "Refunded" },
];

/**
 * Build URL for payments page with query parameters
 * Helper function that matches buildPaymentsUrl from page.tsx
 */
function buildPaymentsUrl(
  workspaceId: string,
  currentParams: Record<string, string | string[] | undefined>,
  overrides: {
    page?: number;
    status?: PaymentStatusParam | undefined;
    view?: PaymentListViewParam | undefined;
    q?: string | undefined;
    sort?: PaymentSortKey | null | undefined;
    dir?: "asc" | "desc" | undefined;
  }
): string {
  const urlParams = new URLSearchParams();

  // Start from current params (excluding page/pageSize - we'll handle them separately)
  const meaningfulParams = ["status", "view", "q", "sort", "dir", "pageSize"];
  meaningfulParams.forEach((key) => {
    const value = currentParams[key];
    if (value) {
      const strValue = Array.isArray(value) ? value[0] : value;
      if (strValue) {
        urlParams.set(key, strValue);
      }
    }
  });

  // Apply overrides - undefined means delete the param, null for sort means remove it
  Object.entries(overrides).forEach(([key, value]) => {
    if (value === undefined || value === null) {
      urlParams.delete(key);
    } else {
      urlParams.set(key, String(value));
    }
  });

  // Determine if we should reset to page 1
  const changingNonPageParam = 
    overrides.status !== undefined ||
    overrides.view !== undefined ||
    overrides.q !== undefined ||
    overrides.sort !== undefined ||
    overrides.dir !== undefined;

  if (changingNonPageParam) {
    urlParams.delete("page");
  } else if (overrides.page !== undefined) {
    if (overrides.page > 1) {
      urlParams.set("page", overrides.page.toString());
    } else {
      urlParams.delete("page");
    }
  } else {
    const currentPage = Array.isArray(currentParams.page) 
      ? currentParams.page[0] 
      : currentParams.page;
    if (currentPage && parseInt(currentPage, 10) > 1) {
      urlParams.set("page", currentPage);
    }
  }

  // Remove default values from URL
  if (urlParams.get("status") === "all") {
    urlParams.delete("status");
  }
  if (urlParams.get("view") === "default") {
    urlParams.delete("view");
  }
  if (urlParams.get("dir") === "desc" && !urlParams.get("sort")) {
    urlParams.delete("dir");
  }
  if (urlParams.get("page") === "1") {
    urlParams.delete("page");
  }

  const queryString = urlParams.toString();
  return `/${workspaceId}/payments${queryString ? `?${queryString}` : ""}`;
}

export default function PaymentsTable({
  rows,
  workspaceId,
  searchParams,
  currentPage,
  totalPages,
  totalCount,
  view,
  status,
  sort,
  dir,
  q,
}: PaymentsTableProps) {
  const router = useRouter();
  const pathname = usePathname();
  const urlSearchParams = useSearchParams();
  
  // Local state for search input (controlled component)
  const [searchValue, setSearchValue] = useState(q || "");
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Sync local state with URL param changes (back/forward navigation, reset, etc.)
  useEffect(() => {
    const urlQ = urlSearchParams.get("q") || "";
    // Only update if different to avoid unnecessary re-renders and infinite loops
    if (urlQ !== searchValue) {
      setSearchValue(urlQ);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlSearchParams]);
  
  // Debounced URL update
  useEffect(() => {
    // Clear existing timeout
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }
    
    // Set new timeout to update URL after 350ms
    debounceTimeoutRef.current = setTimeout(() => {
      const trimmedValue = searchValue.trim();
      const currentUrlQ = urlSearchParams.get("q") || "";
      
      // Only update URL if value actually changed (prevents unnecessary updates)
      if (trimmedValue !== currentUrlQ) {
        const params = new URLSearchParams(urlSearchParams.toString());
        
        // Update or remove q param
        if (trimmedValue) {
          params.set("q", trimmedValue);
        } else {
          params.delete("q");
        }
        
        // Always reset to page 1 when search changes
        params.delete("page");
        
        // Update URL without full page refresh
        const queryString = params.toString();
        router.replace(`${pathname}${queryString ? `?${queryString}` : ""}`);
      }
    }, 350);
    
    // Cleanup timeout on unmount or when searchValue changes
    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, [searchValue, pathname, router, urlSearchParams]);
  
  // Handle manual Enter submit (optional, for immediate search)
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Clear debounce timeout to trigger immediate update
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }
    
    const trimmedValue = searchValue.trim();
    const params = new URLSearchParams(urlSearchParams.toString());
    
    if (trimmedValue) {
      params.set("q", trimmedValue);
    } else {
      params.delete("q");
    }
    
    // Always reset to page 1 when search changes
    params.delete("page");
    
    const queryString = params.toString();
    router.replace(`${pathname}${queryString ? `?${queryString}` : ""}`);
  };
  
  // Handle clear button
  const handleClear = () => {
    setSearchValue("");
    const params = new URLSearchParams(urlSearchParams.toString());
    params.delete("q");
    params.delete("page");
    const queryString = params.toString();
    router.replace(`${pathname}${queryString ? `?${queryString}` : ""}`);
  };
  // Format helpers
  const formatMoney = (amount: number, currency: string = "USD") => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

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

  const getViewLabel = (view: PaymentListViewParam): string => {
    switch (view) {
      case "default":
        return "Default sort";
      case "recent-first":
        return "Most recent payments first";
      case "largest-first":
        return "Largest payments first";
      case "failed-first":
        return "Failed payments first";
      default:
        return "Default sort";
    }
  };

  const getSortLabel = (sort: PaymentSortKey): string => {
    if (!sort) return "Default sort";
    switch (sort) {
      case "payment_date":
        return "Date";
      case "client_name":
        return "Client";
      case "invoice_number":
        return "Invoice #";
      case "amount":
        return "Amount";
      case "method":
        return "Method";
      case "payment_provider":
        return "Provider";
      default:
        return "Default sort";
    }
  };

  const sortArrow = (dir: "asc" | "desc"): "↑" | "↓" => {
    return dir === "asc" ? "↑" : "↓";
  };

  return (
    <div className="space-y-4">
      {/* Sort Preset Chips */}
      <div className="flex flex-wrap gap-2">
        {SORT_PRESETS.map((preset) => {
          const isActive = view === preset.key && !sort;
          return (
            <Link
              key={preset.key}
              href={buildPaymentsUrl(workspaceId, searchParams, {
                view: preset.key === "default" ? undefined : preset.key,
                status: "all", // Reset status to "all" when changing view
                sort: null, // Clear sort when using view preset
                dir: undefined,
              })}
              className={
                "inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition " +
                (isActive
                  ? "border-blue-600 bg-blue-50 text-blue-700"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50")
              }
            >
              {preset.label}
            </Link>
          );
        })}
      </div>

      {/* Top controls row */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Status chips */}
        <div className="flex flex-wrap gap-2">
          {STATUS_FILTERS.map((chip) => (
            <Link
              key={chip.key}
              href={buildPaymentsUrl(workspaceId, searchParams, {
                status: chip.key === "all" ? undefined : chip.key,
              })}
              className={
                status === chip.key
                  ? "rounded-full bg-slate-900 px-3 py-1 text-xs font-medium text-white"
                  : "rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-600 hover:bg-slate-50"
              }
            >
              {chip.label}
            </Link>
          ))}
        </div>

        {/* Search + Reset */}
        <div className="flex flex-wrap items-center gap-2">
          <form onSubmit={handleSubmit} className="flex items-center relative">
            <input
              type="text"
              name="q"
              placeholder="Search transaction, client, or invoice..."
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              className="h-9 rounded-lg border border-slate-200 px-3 pr-8 text-sm"
            />
            {searchValue && (
              <button
                type="button"
                onClick={handleClear}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                aria-label="Clear search"
              >
                <svg
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            )}
          </form>
          <ResetFiltersButton basePath={`/${workspaceId}/payments`} />
        </div>
      </div>

      {/* Helper text for active sort/view */}
      <div className="flex items-center gap-2 text-xs text-slate-500">
        {sort ? (
          <>
            <span>Sorted by</span>
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-[11px] font-medium text-slate-700">
              {getSortLabel(sort)} {sortArrow(dir)}
            </span>
          </>
        ) : (
          <>
            <span>Sorted by</span>
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-[11px] font-medium text-slate-700">
              {getViewLabel(view)}
            </span>
          </>
        )}
      </div>

      {/* Table or empty state */}
      {rows.length === 0 ? (
        <div className="p-8">
          <div className="text-center text-slate-500">
            <p className="text-sm font-medium">No payments match your filters</p>
            <p className="text-xs mt-1">Try clearing search or filters to see more payments.</p>
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full table-fixed divide-y divide-slate-100 text-sm">
            <thead className="bg-slate-50/60 text-xs font-medium uppercase text-slate-500">
              <tr>
                <th className="w-[120px] px-4 py-3 text-left">
                  <SortableHeader
                    label="Date"
                    sortKey="payment_date"
                    workspaceId={workspaceId}
                    currentParams={searchParams}
                    basePath={`/${workspaceId}/payments`}
                  />
                </th>
                <th className="w-[180px] px-4 py-3 text-left">
                  <SortableHeader
                    label="Client"
                    sortKey="client_name"
                    workspaceId={workspaceId}
                    currentParams={searchParams}
                    basePath={`/${workspaceId}/payments`}
                  />
                </th>
                <th className="w-[120px] px-4 py-3 text-left">
                  <SortableHeader
                    label="Invoice #"
                    sortKey="invoice_number"
                    workspaceId={workspaceId}
                    currentParams={searchParams}
                    basePath={`/${workspaceId}/payments`}
                  />
                </th>
                <th className="w-[120px] px-4 py-3 text-right">
                  <SortableHeader
                    label="Amount"
                    sortKey="amount"
                    workspaceId={workspaceId}
                    currentParams={searchParams}
                    basePath={`/${workspaceId}/payments`}
                    align="right"
                  />
                </th>
                <th className="w-[100px] px-4 py-3 text-left">
                  <SortableHeader
                    label="Method"
                    sortKey="method"
                    workspaceId={workspaceId}
                    currentParams={searchParams}
                    basePath={`/${workspaceId}/payments`}
                  />
                </th>
                <th className="w-[120px] px-4 py-3 text-left">
                  <SortableHeader
                    label="Provider"
                    sortKey="payment_provider"
                    workspaceId={workspaceId}
                    currentParams={searchParams}
                    basePath={`/${workspaceId}/payments`}
                  />
                </th>
                <th className="w-[110px] px-4 py-3 text-left">Status</th>
                <th className="w-[80px] px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {rows.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50">
                  <td className="px-4 py-4 text-sm text-slate-700 whitespace-nowrap">
                    {formatDate(p.payment_date)}
                  </td>
                  <td className="px-4 py-4 text-slate-800">
                    <div className="truncate" title={p.client_name || "—"}>
                      {p.client_name || "—"}
                    </div>
                  </td>
                  <td className="px-4 py-4 text-slate-800 whitespace-nowrap">
                    {p.invoice_number ? (
                      <Link
                        href={`/${workspaceId}/invoices/${p.invoice_id}`}
                        className="text-blue-600 hover:text-blue-700"
                      >
                        {p.invoice_number}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-4 text-right font-medium text-slate-900 tabular-nums whitespace-nowrap">
                    {formatMoney(p.amount, p.currency)}
                  </td>
                  <td className="px-4 py-4 text-sm text-slate-700 capitalize whitespace-nowrap">
                    {p.method || "—"}
                  </td>
                  <td className="px-4 py-4 text-sm text-slate-500 whitespace-nowrap">
                    {p.payment_provider || "—"}
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
                    <Link
                      href={`/${workspaceId}/payments/${p.id}`}
                      className="text-blue-600 hover:text-blue-700 text-sm font-medium"
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2 text-xs text-slate-600">
          <div>
            Page {currentPage} of {totalPages} · {totalCount} payment{totalCount !== 1 ? "s" : ""}
          </div>
          <div className="flex items-center gap-2">
            {currentPage > 1 && (
              <Link
                href={buildPaymentsUrl(workspaceId, searchParams, {
                  page: currentPage - 1,
                })}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium hover:bg-slate-50"
              >
                Previous
              </Link>
            )}
            {currentPage < totalPages && (
              <Link
                href={buildPaymentsUrl(workspaceId, searchParams, {
                  page: currentPage + 1,
                })}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium hover:bg-slate-50"
              >
                Next
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
