"use client";

import * as React from "react";
import { archiveClient, unarchiveClient } from "../_actions/clientActions";
import { getClientOutstanding } from "../_actions/getClientOutstanding";
import { useToast } from "@/components/ui/use-toast";
import { ArchiveConfirmDialog } from "./ArchiveConfirmDialog";

type Props = {
  workspaceId: string;
  clientId: string;
  initialArchived: boolean;
  disabled?: boolean; // optional
};

export function ArchiveCheckbox({ workspaceId, clientId, initialArchived, disabled }: Props) {
  const [checked, setChecked] = React.useState<boolean>(initialArchived);
  const [pending, startTransition] = React.useTransition();
  const [showConfirm, setShowConfirm] = React.useState(false);
  const [outstanding, setOutstanding] = React.useState<number>(0);
  const [pendingAction, setPendingAction] = React.useState<boolean | null>(null);
  const { toast } = useToast();

  // Keep in sync if parent rerenders with new value
  React.useEffect(() => setChecked(initialArchived), [initialArchived]);

  const performArchive = async (shouldArchive: boolean) => {
    console.log("[ArchiveCheckbox] performArchive: starting", { 
      workspaceId, 
      clientId, 
      shouldArchive 
    });
    
    const res = shouldArchive
      ? await archiveClient(workspaceId, clientId)
      : await unarchiveClient(workspaceId, clientId);

    console.log("[ArchiveCheckbox] performArchive: result", { 
      workspaceId, 
      clientId, 
      shouldArchive,
      ok: res.ok,
      error: res.ok ? undefined : res.error,
    });

    if (!res.ok) {
      // revert optimistic change
      setChecked(!shouldArchive);
      toast({
        variant: "destructive",
        title: "Update failed",
        description: res.error,
      });
      return;
    }

    toast({
      title: shouldArchive ? "Client archived" : "Client unarchived",
    });
  };

  const onChange = (next: boolean) => {
    // If unarchiving, no need to check outstanding
    if (!next) {
      setChecked(next); // optimistic
      startTransition(async () => {
        await performArchive(false);
      });
      return;
    }

    // If archiving, check outstanding balance first
    startTransition(async () => {
      console.log("[ArchiveCheckbox] onChange: checking outstanding", { workspaceId, clientId });
      const outstandingResult = await getClientOutstanding(workspaceId, clientId);
      
      console.log("[ArchiveCheckbox] onChange: outstanding result", { 
        workspaceId, 
        clientId, 
        ok: outstandingResult.ok,
        outstanding: outstandingResult.ok ? outstandingResult.outstanding : undefined,
        error: outstandingResult.ok ? undefined : outstandingResult.error,
      });
      
      if (!outstandingResult.ok) {
        toast({
          variant: "destructive",
          title: "Error",
          description: outstandingResult.error,
        });
        return;
      }

      if (outstandingResult.outstanding > 0) {
        // Show confirmation dialog
        console.log("[ArchiveCheckbox] onChange: showing confirmation dialog", { 
          workspaceId, 
          clientId, 
          outstanding: outstandingResult.outstanding 
        });
        setOutstanding(outstandingResult.outstanding);
        setPendingAction(true);
        setShowConfirm(true);
      } else {
        // No outstanding, proceed directly
        console.log("[ArchiveCheckbox] onChange: no outstanding, archiving directly", { 
          workspaceId, 
          clientId 
        });
        setChecked(next); // optimistic
        await performArchive(true);
      }
    });
  };

  const handleConfirm = () => {
    setShowConfirm(false);
    setChecked(true); // optimistic
    startTransition(async () => {
      console.log("[ArchiveCheckbox] handleConfirm: calling archiveClient", { workspaceId, clientId });
      const result = await performArchive(true);
      console.log("[ArchiveCheckbox] handleConfirm: archiveClient result", { 
        workspaceId, 
        clientId, 
        ok: result === undefined ? "void" : "unknown" 
      });
      setPendingAction(null);
    });
  };

  const handleCancel = () => {
    setShowConfirm(false);
    setPendingAction(null);
    // Don't change checked state - user cancelled
  };

  return (
    <>
      <div onClick={(e) => e.stopPropagation()}>
        <input
          type="checkbox"
          aria-label="Archive client"
          checked={checked}
          disabled={disabled || pending}
          onChange={(e) => onChange(e.target.checked)}
          className="h-4 w-4 cursor-pointer accent-foreground disabled:cursor-not-allowed"
        />
      </div>
      {showConfirm && pendingAction !== null && (
        <ArchiveConfirmDialog
          isOpen={showConfirm}
          onClose={handleCancel}
          onConfirm={handleConfirm}
          outstanding={outstanding}
          workspaceId={workspaceId}
          clientId={clientId}
          action="archive"
        />
      )}
    </>
  );
}
