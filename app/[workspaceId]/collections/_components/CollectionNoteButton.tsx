"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { StickyNote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/components/ui/use-toast";
import { updateCollectionsNote } from "../actions";
import { CollectionNoteModal } from "./CollectionNoteModal";

interface CollectionNoteButtonProps {
  invoiceId: string;
  invoiceNumber: string | null;
  clientName: string | null;
  workspaceId: string;
  note: string | null;
}

export function CollectionNoteButton({
  invoiceId,
  invoiceNumber,
  clientName,
  workspaceId,
  note,
}: CollectionNoteButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  const handleSave = async (noteText: string | null) => {
    try {
      await updateCollectionsNote({
        invoiceId,
        workspaceId,
        notes: noteText || null,
      });
      
      toast({
        title: "Note saved",
        description: "Collection note has been saved successfully.",
        variant: "default",
      });
      
      setIsOpen(false);
      router.refresh();
    } catch (error) {
      toast({
        title: "Failed to save note",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
      // Keep modal open on error
    }
  };

  const tooltipText = note ? "View / edit note" : "Add note";

  return (
    <>
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setIsOpen(true)}
              aria-label={tooltipText}
              className="h-8 w-8"
            >
              <StickyNote
                className={`h-4 w-4 ${note ? "text-blue-600" : "text-slate-400"}`}
              />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>{tooltipText}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <CollectionNoteModal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        onSave={handleSave}
        invoiceNumber={invoiceNumber}
        clientName={clientName}
        initialNote={note}
      />
    </>
  );
}

