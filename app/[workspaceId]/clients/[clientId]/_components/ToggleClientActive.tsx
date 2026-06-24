"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toggleClientActive } from "../../actions";
import { getClientOutstanding } from "../../_actions/getClientOutstanding";
import { ArchiveConfirmDialog } from "../../_components/ArchiveConfirmDialog";
import { useToast } from "@/components/ui/use-toast";

interface ToggleClientActiveProps {
  workspaceId: string;
  clientId: string;
  currentActive: boolean;
}

export function ToggleClientActive({
  workspaceId,
  clientId,
  currentActive,
}: ToggleClientActiveProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [outstanding, setOutstanding] = useState<number>(0);
  const { toast } = useToast();

  const performToggle = async (shouldBeActive: boolean) => {
    setIsLoading(true);
    try {
      await toggleClientActive(workspaceId, clientId, shouldBeActive);
      router.refresh();
      toast({
        title: shouldBeActive ? "Client activated" : "Client inactivated",
      });
    } catch (error) {
      console.error("Failed to toggle client active status:", error);
      toast({
        variant: "destructive",
        title: "Update failed",
        description: error instanceof Error ? error.message : "Failed to update client status. Please try again.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggle = async () => {
    if (isLoading) return;
    
    // If activating, no need to check outstanding
    if (currentActive === false) {
      await performToggle(true);
      return;
    }

    // If inactivating, check outstanding balance first
    const outstandingResult = await getClientOutstanding(workspaceId, clientId);
    
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
      setOutstanding(outstandingResult.outstanding);
      setShowConfirm(true);
    } else {
      // No outstanding, proceed directly
      await performToggle(false);
    }
  };

  const handleConfirm = () => {
    setShowConfirm(false);
    performToggle(false);
  };

  const handleCancel = () => {
    setShowConfirm(false);
  };

  return (
    <>
      <button
        type="button"
        onClick={handleToggle}
        disabled={isLoading}
        className="inline-flex items-center rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
        title={currentActive ? "Mark as inactive" : "Mark as active"}
      >
        {isLoading ? (
          "Updating..."
        ) : currentActive ? (
          "Mark Inactive"
        ) : (
          "Mark Active"
        )}
      </button>
      {showConfirm && (
        <ArchiveConfirmDialog
          isOpen={showConfirm}
          onClose={handleCancel}
          onConfirm={handleConfirm}
          outstanding={outstanding}
          workspaceId={workspaceId}
          clientId={clientId}
          action="inactivate"
        />
      )}
    </>
  );
}
