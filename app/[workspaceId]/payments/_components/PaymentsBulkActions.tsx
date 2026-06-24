"use client";

import * as React from "react";
import { bulkArchivePayments, bulkUnarchivePayments } from "../actions";
import { useToast } from "@/components/ui/use-toast";
import { useRouter, useSearchParams } from "next/navigation";
import { PaymentArchiveConfirmDialog } from "./PaymentArchiveConfirmDialog";

type PaymentStatusParam = "all" | "completed" | "pending" | "failed" | "refunded" | "archived";
type PaymentListViewParam = "default" | "recent-first" | "largest-first" | "failed-first";

interface Payment {
  id: string;
  archived_at: string | null;
  amount: number;
  currency: string;
  invoice_id: string | null;
  invoice_number: string | null;
  client_name: string | null;
  payment_date: string;
}

interface PaymentsBulkActionsProps {
  workspaceId: string;
  payments: Payment[];
  selectedIds: Set<string>;
  onSelectionChange: (selectedIds: Set<string>) => void;
  onPaymentsChange: (payments: Payment[]) => void;
  status: "all" | "completed" | "pending" | "failed" | "refunded" | "archived";
}

/**
 * Build URL for payments page with query parameters
 * Preserves current params and applies overrides
 */
function buildPaymentsUrl(
  workspaceId: string,
  currentParams: Record<string, string | string[] | undefined>,
  overrides: {
    status?: PaymentStatusParam | undefined;
    page?: number | undefined;
  }
): string {
  const urlParams = new URLSearchParams();

  // Preserve meaningful params (view, q, sort, dir, pageSize)
  const meaningfulParams = ["view", "q", "sort", "dir", "pageSize"];
  meaningfulParams.forEach((key) => {
    const value = currentParams[key];
    if (value) {
      const strValue = Array.isArray(value) ? value[0] : value;
      if (strValue) {
        urlParams.set(key, strValue);
      }
    }
  });

  // Apply overrides
  if (overrides.status !== undefined) {
    if (overrides.status === "all") {
      urlParams.delete("status");
    } else {
      urlParams.set("status", overrides.status);
    }
  }

  if (overrides.page !== undefined) {
    if (overrides.page === 1) {
      urlParams.delete("page");
    } else {
      urlParams.set("page", overrides.page.toString());
    }
  } else {
    // Reset to page 1 when changing status
    if (overrides.status !== undefined) {
      urlParams.delete("page");
    }
  }

  const queryString = urlParams.toString();
  return `/${workspaceId}/payments${queryString ? `?${queryString}` : ""}`;
}

export function PaymentsBulkActions({
  workspaceId,
  payments,
  selectedIds,
  onSelectionChange,
  onPaymentsChange,
  status,
}: PaymentsBulkActionsProps) {
  const [pending, startTransition] = React.useTransition();
  const [showArchiveConfirm, setShowArchiveConfirm] = React.useState(false);
  const [showUnarchiveConfirm, setShowUnarchiveConfirm] = React.useState(false);
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();

  const handleBulkArchiveClick = () => {
    if (selectedIds.size === 0) return;
    setShowArchiveConfirm(true);
  };

  const handleBulkUnarchiveClick = () => {
    if (selectedIds.size === 0) return;
    setShowUnarchiveConfirm(true);
  };

  const handleBulkArchive = async () => {
    if (selectedIds.size === 0) return;

    const ids = Array.from(selectedIds);

    startTransition(async () => {
      const result = await bulkArchivePayments(workspaceId, ids);
      
      if (result.ok) {
        toast({
          title: `Archived ${result.count} payment${result.count !== 1 ? "s" : ""}`,
        });
        
        // Clear selection immediately
        onSelectionChange(new Set());
        
        // Optimistically remove archived payments from current list to prevent flicker
        // (archive button only shows on active tab, so we can safely filter)
        onPaymentsChange(payments.filter((p) => !ids.includes(p.id)));
        
        // Refresh to fetch updated data from server
        router.refresh();
      } else {
        toast({
          variant: "destructive",
          title: "Archive failed",
          description: result.message || "Failed to archive payments",
        });
      }
      setShowArchiveConfirm(false);
    });
  };

  const handleBulkUnarchive = async () => {
    if (selectedIds.size === 0) return;

    const ids = Array.from(selectedIds);

    startTransition(async () => {
      const result = await bulkUnarchivePayments(workspaceId, ids);
      
      if (result.ok) {
        toast({
          title: `Unarchived ${result.count} payment${result.count !== 1 ? "s" : ""}`,
        });
        
        // Clear selection immediately
        onSelectionChange(new Set());
        
        // If on archived tab, navigate to All tab (preserve other params like view/search/sort/pageSize; reset page=1)
        // This prevents empty-state confusion when all visible rows are unarchived
        if (status === "archived") {
          const currentParams: Record<string, string | string[] | undefined> = {};
          searchParams.forEach((value, key) => {
            currentParams[key] = value;
          });
          const newUrl = buildPaymentsUrl(workspaceId, currentParams, {
            status: "all",
            page: 1,
          });
          router.replace(newUrl);
        }
        
        // Refresh to fetch updated data from server (trigger refetch)
        router.refresh();
      } else {
        toast({
          variant: "destructive",
          title: "Unarchive failed",
          description: result.message || "Failed to unarchive payments",
        });
      }
      setShowUnarchiveConfirm(false);
    });
  };

  const handleClear = () => {
    onSelectionChange(new Set());
  };

  if (selectedIds.size === 0) {
    return null;
  }

  const isArchivedTab = status === "archived";

  // Get selected payment objects (with all required fields for dialog)
  const selectedPayments = payments.filter((p) => selectedIds.has(p.id));

  return (
    <>
      <div className="sticky top-0 z-30 bg-white border-b border-slate-200 shadow-sm px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <span className="text-sm font-medium text-slate-700">
            {selectedIds.size} payment{selectedIds.size !== 1 ? "s" : ""} selected
          </span>
          <div className="flex items-center gap-2">
            {!isArchivedTab && (
              <button
                onClick={handleBulkArchiveClick}
                disabled={pending}
                className="px-3 py-1.5 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {pending ? "Archiving..." : "Archive selected"}
              </button>
            )}
            {isArchivedTab && (
              <button
                onClick={handleBulkUnarchiveClick}
                disabled={pending}
                className="px-3 py-1.5 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {pending ? "Unarchiving..." : "Unarchive selected"}
              </button>
            )}
          </div>
        </div>
        <button
          onClick={handleClear}
          disabled={pending}
          className="text-sm text-slate-600 hover:text-slate-900 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Clear
        </button>
      </div>

      {/* Archive confirmation dialog */}
      <PaymentArchiveConfirmDialog
        open={showArchiveConfirm}
        onOpenChange={setShowArchiveConfirm}
        onConfirm={handleBulkArchive}
        payments={selectedPayments}
        workspaceId={workspaceId}
        isArchive={true}
      />

      {/* Unarchive confirmation dialog */}
      <PaymentArchiveConfirmDialog
        open={showUnarchiveConfirm}
        onOpenChange={setShowUnarchiveConfirm}
        onConfirm={handleBulkUnarchive}
        payments={selectedPayments}
        workspaceId={workspaceId}
        isArchive={false}
      />
    </>
  );
}

