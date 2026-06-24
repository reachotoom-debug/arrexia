"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deleteReminderTemplate } from "../actions";
import { useToast } from "@/components/ui/use-toast";
import { AlertDialog } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";

interface ReminderTemplateDeleteButtonProps {
  workspaceId: string;
  templateId: string;
  templateName: string;
}

export function ReminderTemplateDeleteButton({
  workspaceId,
  templateId,
  templateName,
}: ReminderTemplateDeleteButtonProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDeleteConfirm = async () => {
    setIsDeleting(true);
    try {
      const result = await deleteReminderTemplate(workspaceId, templateId);
      if (result.success) {
        router.refresh();
        toast({
          title: "Template deleted",
          description: "Template deleted successfully",
        });
      } else {
        toast({
          variant: "destructive",
          title: "Error",
          description: result.error || "Failed to delete template",
        });
      }
    } catch (error) {
      console.error("[ReminderTemplateDeleteButton] delete error:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "An error occurred while deleting the template",
      });
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  return (
    <>
      <Button
        variant="outline"
        size="icon"
        onClick={() => setShowDeleteConfirm(true)}
        aria-label={`Delete reminder template ${templateName}`}
        title={`Delete reminder template ${templateName}`}
        className="h-8 w-8 text-red-600 hover:text-red-700"
      >
        <Trash2 className="h-4 w-4" />
      </Button>
      <AlertDialog
        open={showDeleteConfirm}
        onOpenChange={setShowDeleteConfirm}
        title="Delete template?"
        description="This will not affect already sent reminders, but future reminders cannot use this template."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={handleDeleteConfirm}
        variant="destructive"
      />
    </>
  );
}
