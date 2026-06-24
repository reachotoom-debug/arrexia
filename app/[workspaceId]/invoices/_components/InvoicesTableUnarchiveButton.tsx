"use client";

import * as React from "react";
import { useTransition } from "react";
import { secondaryToolbarClass } from "@/components/ui/cta-styles";
import { useToast } from "@/components/ui/use-toast";
import { bulkUnarchiveInvoices } from "../actions";
import { useRouter } from "next/navigation";

interface Invoice {
  id: string;
  archived_at: string | null;
}

interface InvoicesTableUnarchiveButtonProps {
  workspaceId: string;
  invoices: Invoice[];
  searchParams: Record<string, string | string[] | undefined>;
}

// Context to share selection state from InvoicesTable
export const SelectionContext = React.createContext<{
  selectedIds: Set<string>;
  setSelectedIds: React.Dispatch<React.SetStateAction<Set<string>>>;
} | null>(null);

export const SelectionProvider = SelectionContext.Provider;

export function useSelection() {
  return React.useContext(SelectionContext);
}

export function InvoicesTableUnarchiveButton({
  workspaceId,
  invoices,
  searchParams,
}: InvoicesTableUnarchiveButtonProps) {
  const selection = useSelection();
  const selectedIds = selection?.selectedIds ?? new Set();
  const setSelectedIds = selection?.setSelectedIds ?? (() => {});
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();
  const router = useRouter();

  // Check if we're viewing archived invoices
  // Since invoices_view filters out archived invoices, if we have invoices with archived_at set,
  // we're viewing archived invoices. Otherwise, check searchParams for archived flag.
  const statusParam = Array.isArray(searchParams.status)
    ? searchParams.status[0]
    : searchParams.status;
  const hasArchivedInvoices = invoices.some((inv) => Boolean(inv.archived_at));
  const isArchivedView =
    hasArchivedInvoices || statusParam === "archived" || searchParams.archived === "1";

  const hasSelection = selectedIds.size > 0;

  if (!isArchivedView || !hasSelection) {
    return null;
  }

  const handleUnarchive = () => {
    const count = selectedIds.size;
    if (count === 0) return;

    const confirmed = window.confirm(`Unarchive ${count} selected invoice(s)?`);
    if (!confirmed) return;

    startTransition(async () => {
      try {
        const result = await bulkUnarchiveInvoices(workspaceId, Array.from(selectedIds));

        if (result.ok) {
          setSelectedIds(new Set());
          toast({
            title: "Invoices unarchived",
            description: `Successfully unarchived ${result.count} invoice${result.count !== 1 ? "s" : ""}.`,
          });
          router.refresh();
        } else {
          toast({
            variant: "destructive",
            title: "Error unarchiving invoices",
            description: result.message || "Please try again.",
          });
        }
      } catch (err) {
        console.error("bulkUnarchiveInvoices error", err);
        toast({
          variant: "destructive",
          title: "Error unarchiving invoices",
          description: "Please try again.",
        });
      }
    });
  };

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={handleUnarchive}
      className={secondaryToolbarClass}
    >
      {isPending ? "Unarchiving..." : "Unarchive selected"}
    </button>
  );
}
