"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { sendReminderAction } from "@/app/[workspaceId]/reminders/actions";
import { logManualContactAction } from "../actions";
import { useToast } from "@/components/ui/use-toast";
import { formatMoney } from "@/lib/utils/format-money";

type CollectionContactButtonProps = {
  workspaceId: string;
  invoiceId: string;
  clientId: string | null;
  clientName: string | null;
  email: string | null;
  outstanding: number;
  overdueDays: number;
};

export function CollectionContactButton({
  workspaceId,
  invoiceId,
  clientId,
  clientName,
  email,
  outstanding,
  overdueDays,
}: CollectionContactButtonProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, setIsPending] = useState(false);

  const safeEmail = email?.trim() || null;

  const runLoggedAction = async (action: "send_email_reminder" | "copy_email" | "mark_contacted", status: "sent" | "manual") => {
    await logManualContactAction({
      workspaceId,
      invoiceId,
      clientId,
      action,
      status,
    });
  };

  const handleSendEmailReminder = async () => {
    if (!safeEmail || isPending) return;
    setIsPending(true);
    try {
      const res = await sendReminderAction({ workspaceId, invoiceId });
      const actionStatus: "sent" | "manual" = res.ok && res.status === "sent" ? "sent" : "manual";
      await runLoggedAction("send_email_reminder", actionStatus);

      if (res.ok && res.status === "sent") {
        toast({
          title: "Reminder sent",
          description: clientName ?? undefined,
        });
      } else {
        toast({
          title: "Reminder not sent",
          description: res.message || "Could not send reminder.",
          variant: "destructive",
        });
      }
      router.refresh();
    } catch (error) {
      toast({
        title: "Failed to send reminder",
        description: error instanceof Error ? error.message : "Unexpected error",
        variant: "destructive",
      });
    } finally {
      setIsPending(false);
    }
  };

  const handleCopyEmail = async () => {
    if (!safeEmail || isPending) return;
    setIsPending(true);
    try {
      await navigator.clipboard.writeText(safeEmail);
      await runLoggedAction("copy_email", "manual");
      toast({ title: "Email copied", description: safeEmail });
      router.refresh();
    } catch (error) {
      toast({
        title: "Failed to copy email",
        description: error instanceof Error ? error.message : "Unexpected error",
        variant: "destructive",
      });
    } finally {
      setIsPending(false);
    }
  };

  const handleMarkContacted = async () => {
    if (isPending) return;
    setIsPending(true);
    try {
      await runLoggedAction("mark_contacted", "manual");
      toast({
        title: "Marked as contacted",
        description: clientName ?? undefined,
      });
      router.refresh();
    } catch (error) {
      toast({
        title: "Failed to mark contacted",
        description: error instanceof Error ? error.message : "Unexpected error",
        variant: "destructive",
      });
    } finally {
      setIsPending(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="text-blue-600 text-sm hover:underline"
      >
        Contact
      </button>

      {isOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white shadow-lg">
            <div className="border-b border-slate-200 px-4 py-3">
              <h3 className="text-sm font-semibold text-slate-900">Contact client</h3>
            </div>

            <div className="space-y-2 p-4 text-sm">
              <p><span className="font-medium text-slate-700">Client:</span> {clientName || "—"}</p>
              <p><span className="font-medium text-slate-700">Email:</span> {safeEmail || "—"}</p>
              <p><span className="font-medium text-slate-700">Outstanding:</span> {formatMoney(outstanding || 0, "USD")}</p>
              <p><span className="font-medium text-slate-700">Overdue days:</span> {Math.max(0, overdueDays || 0)}</p>
            </div>

            <div className="grid grid-cols-1 gap-2 border-t border-slate-200 px-4 py-3">
              <button
                type="button"
                onClick={handleSendEmailReminder}
                disabled={isPending || !safeEmail}
                className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isPending ? "Working..." : "Send Email Reminder"}
              </button>
              <button
                type="button"
                onClick={handleCopyEmail}
                disabled={isPending || !safeEmail}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Copy Email
              </button>
              <button
                type="button"
                onClick={handleMarkContacted}
                disabled={isPending}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Mark as Contacted
              </button>
            </div>

            <div className="border-t border-slate-200 px-4 py-3">
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                disabled={isPending}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
