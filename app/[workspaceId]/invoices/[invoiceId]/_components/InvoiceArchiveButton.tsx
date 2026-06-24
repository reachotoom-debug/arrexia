"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore } from "lucide-react";
import { archiveInvoice, unarchiveInvoice } from "../../actions";
import { useToast } from "@/components/ui/use-toast";
import { AlertDialog } from "@/components/ui/alert-dialog";

interface InvoiceArchiveButtonProps {
  workspaceId: string;
  invoiceId: string;
  isArchived: boolean;
}

export function InvoiceArchiveButton({
  workspaceId,
  invoiceId,
  isArchived,
}: InvoiceArchiveButtonProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [showConfirm, setShowConfirm] = React.useState(false);
  const [pending, startTransition] = React.useTransition();

  const handleConfirm = () => {
    startTransition(async () => {
      const result = isArchived
        ? await unarchiveInvoice(workspaceId, invoiceId)
        : await archiveInvoice(workspaceId, invoiceId);
      
      setShowConfirm(false);
      
      if (result.ok) {
        toast({
          title: isArchived ? "Invoice unarchived" : "Invoice archived",
          description: isArchived
            ? "The invoice has been unarchived and is now visible in your active invoice lists."
            : "The invoice has been archived successfully.",
        });
        router.refresh();
      } else {
        toast({
          variant: "destructive",
          title: isArchived ? "Unarchive failed" : "Archive failed",
          description: result.error || (isArchived ? "Failed to unarchive invoice" : "Failed to archive invoice"),
        });
      }
    });
  };

  const title = isArchived ? "Unarchive invoice?" : "Archive invoice?";
  const description = isArchived
    ? "This invoice will be unarchived and become visible in your active invoice lists."
    : "Archived invoices will be hidden from the main list but can be unarchived later.";
  const confirmLabel = isArchived ? "Unarchive" : "Archive";
  const buttonLabel = isArchived ? "Unarchive Invoice" : "Archive Invoice";

  return (
    <>
      <button
        onClick={() => setShowConfirm(true)}
        disabled={pending}
        className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isArchived ? (
          <ArchiveRestore className="h-4 w-4" />
        ) : (
          <Archive className="h-4 w-4" />
        )}
        {buttonLabel}
      </button>

      <AlertDialog
        open={showConfirm}
        onOpenChange={setShowConfirm}
        title={title}
        description={description}
        confirmLabel={confirmLabel}
        cancelLabel="Cancel"
        onConfirm={handleConfirm}
        variant={isArchived ? "default" : "default"}
      />
    </>
  );
}

