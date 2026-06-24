"use client";

import * as React from "react";
import { bulkArchiveInvoices, bulkUnarchiveInvoices } from "../actions";
import { useToast } from "@/components/ui/use-toast";
import { useRouter } from "next/navigation";
import { AlertDialog } from "@/components/ui/alert-dialog";
import { formatCurrency } from "@/lib/format/currency";

interface Invoice {
  id: string;
  archived_at: string | null;
  outstanding: number;
  currency: string;
}

interface InvoicesBulkActionsProps {
  workspaceId: string;
  invoices: Invoice[];
  selectedIds: Set<string>;
  onSelectionChange: (selectedIds: Set<string>) => void;
  onInvoicesChange: (invoices: Invoice[]) => void;
  isArchivedView?: boolean;
}

export function InvoicesBulkActions({
  workspaceId,
  invoices,
  selectedIds,
  onSelectionChange,
  onInvoicesChange,
  isArchivedView = false,
}: InvoicesBulkActionsProps) {
  const [pending, startTransition] = React.useTransition();
  const [showArchiveConfirm, setShowArchiveConfirm] = React.useState(false);
  const { toast } = useToast();
  const router = useRouter();

  const handleBulkArchiveClick = () => {
    if (selectedIds.size === 0) return;

    // Check if any selected invoices have outstanding > 0
    const selectedInvoices = invoices.filter((inv) => selectedIds.has(inv.id));
    const hasOutstanding = selectedInvoices.some((inv) => (inv.outstanding ?? 0) > 0);

    if (hasOutstanding) {
      setShowArchiveConfirm(true);
    } else {
      handleBulkArchive();
    }
  };

  const handleBulkArchive = async () => {
    if (selectedIds.size === 0) return;

    const ids = Array.from(selectedIds);

    startTransition(async () => {
      const result = await bulkArchiveInvoices(workspaceId, ids);
      
      if (result.ok) {
        toast({
          title: `Archived ${result.count} invoice${result.count !== 1 ? "s" : ""}`,
        });
        onSelectionChange(new Set());
        router.refresh();
      } else {
        toast({
          variant: "destructive",
          title: "Archive failed",
          description: result.message || "Failed to archive invoices",
        });
      }
      setShowArchiveConfirm(false);
    });
  };

  const handleBulkUnarchive = async () => {
    if (selectedIds.size === 0) return;

    const ids = Array.from(selectedIds);

    startTransition(async () => {
      const result = await bulkUnarchiveInvoices(workspaceId, ids);
      
      if (result.ok) {
        toast({
          title: `Unarchived ${result.count} invoice${result.count !== 1 ? "s" : ""}`,
        });
        
        // Clear selection immediately
        onSelectionChange(new Set());
        
        // Optimistically remove unarchived invoices from current list to prevent flicker
        // (unarchive button only shows on archived tab, so we can safely filter)
        onInvoicesChange(invoices.filter((inv) => !ids.includes(inv.id)));
        
        // Refresh to fetch updated data from server
        router.refresh();
      } else {
        toast({
          variant: "destructive",
          title: "Unarchive failed",
          description: result.message || "Failed to unarchive invoices",
        });
      }
    });
  };

  const handleClear = () => {
    onSelectionChange(new Set());
  };

  if (selectedIds.size === 0) {
    return null;
  }

  const selectedInvoices = invoices.filter((inv) => selectedIds.has(inv.id));

  // Calculate total outstanding for confirmation dialog
  const totalOutstanding = selectedInvoices
    .filter((inv) => (inv.outstanding ?? 0) > 0)
    .reduce((sum, inv) => sum + (inv.outstanding ?? 0), 0);
  // Use first selected invoice's currency for bulk action display
  const bulkCurrency = selectedInvoices[0]?.currency;

  return (
    <>
      <div className="sticky top-0 z-30 bg-white border-b border-slate-200 shadow-sm px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <span className="text-sm font-medium text-slate-700">
            {selectedIds.size} invoice{selectedIds.size !== 1 ? "s" : ""} selected
          </span>
          <div className="flex items-center gap-2">
            {!isArchivedView && (
              <button
                onClick={handleBulkArchiveClick}
                disabled={pending}
                className="px-3 py-1.5 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {pending ? "Archiving..." : "Archive selected"}
              </button>
            )}
            {isArchivedView && (
              <button
                onClick={handleBulkUnarchive}
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

      <AlertDialog
        open={showArchiveConfirm}
        onOpenChange={setShowArchiveConfirm}
        title="Archive invoices with outstanding amounts?"
        description={`The selected invoices have a total outstanding amount of ${formatCurrency(totalOutstanding, { currency: bulkCurrency })}. Are you sure you want to archive them?`}
        confirmLabel="Continue"
        cancelLabel="Cancel"
        onConfirm={handleBulkArchive}
        variant="default"
      />
    </>
  );
}
