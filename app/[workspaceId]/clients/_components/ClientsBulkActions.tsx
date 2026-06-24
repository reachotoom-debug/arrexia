"use client";

import * as React from "react";
import { archiveClient, unarchiveClient } from "../_actions/clientActions";
import { useToast } from "@/components/ui/use-toast";

interface Client {
  id: string;
  archived_at: string | null;
}

interface ClientsBulkActionsProps {
  workspaceId: string;
  clients: Client[];
  selectedIds: Set<string>;
  onSelectionChange: (selectedIds: Set<string>) => void;
}

export function ClientsBulkActions({
  workspaceId,
  clients,
  selectedIds,
  onSelectionChange,
}: ClientsBulkActionsProps) {
  const [pending, startTransition] = React.useTransition();
  const { toast } = useToast();

  const handleBulkArchive = async () => {
    if (selectedIds.size === 0) return;

    const ids = Array.from(selectedIds);
    let successCount = 0;
    let failureCount = 0;
    const errors: string[] = [];

    startTransition(async () => {
      for (const clientId of ids) {
        const result = await archiveClient(workspaceId, clientId);
        if (result.ok) {
          successCount++;
        } else {
          failureCount++;
          errors.push(result.error);
        }
      }

      if (failureCount === 0) {
        toast({
          title: `Archived ${successCount} client${successCount !== 1 ? "s" : ""}`,
        });
        onSelectionChange(new Set());
      } else {
        toast({
          variant: "destructive",
          title: `Archived ${successCount}, failed ${failureCount}`,
          description: errors.slice(0, 3).join("; "),
        });
      }
    });
  };

  const handleBulkUnarchive = async () => {
    if (selectedIds.size === 0) return;

    const ids = Array.from(selectedIds);
    let successCount = 0;
    let failureCount = 0;
    const errors: string[] = [];

    startTransition(async () => {
      for (const clientId of ids) {
        const result = await unarchiveClient(workspaceId, clientId);
        if (result.ok) {
          successCount++;
        } else {
          failureCount++;
          errors.push(result.error);
        }
      }

      if (failureCount === 0) {
        toast({
          title: `Unarchived ${successCount} client${successCount !== 1 ? "s" : ""}`,
        });
        onSelectionChange(new Set());
      } else {
        toast({
          variant: "destructive",
          title: `Unarchived ${successCount}, failed ${failureCount}`,
          description: errors.slice(0, 3).join("; "),
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

  const selectedClients = clients.filter((c) => selectedIds.has(c.id));
  const allArchived = selectedClients.every((c) => Boolean(c.archived_at));
  const allUnarchived = selectedClients.every((c) => !c.archived_at);

  return (
    <div className="sticky top-0 z-30 bg-white border-b border-slate-200 shadow-sm px-4 py-3 flex items-center justify-between">
      <div className="flex items-center gap-4">
        <span className="text-sm font-medium text-slate-700">
          {selectedIds.size} client{selectedIds.size !== 1 ? "s" : ""} selected
        </span>
        <div className="flex items-center gap-2">
          {allUnarchived && (
            <button
              onClick={handleBulkArchive}
              disabled={pending}
              className="px-3 py-1.5 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {pending ? "Archiving..." : "Archive selected"}
            </button>
          )}
          {allArchived && (
            <button
              onClick={handleBulkUnarchive}
              disabled={pending}
              className="px-3 py-1.5 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {pending ? "Unarchiving..." : "Unarchive selected"}
            </button>
          )}
          {!allArchived && !allUnarchived && (
            <>
              <button
                onClick={handleBulkArchive}
                disabled={pending}
                className="px-3 py-1.5 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {pending ? "Archiving..." : "Archive selected"}
              </button>
              <button
                onClick={handleBulkUnarchive}
                disabled={pending}
                className="px-3 py-1.5 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {pending ? "Unarchiving..." : "Unarchive selected"}
              </button>
            </>
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
  );
}
