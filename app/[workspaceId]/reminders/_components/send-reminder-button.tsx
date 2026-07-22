"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Send, Loader2, CheckCircle2 } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { sendReminderAction } from "@/app/[workspaceId]/reminders/actions";

type SendReminderButtonProps = {
  workspaceId: string;
  invoiceId: string;
  invoiceNumber?: string | null;
  clientName?: string | null;
  clientEmail?: string | null;
  templateId?: string | null;
  ruleId?: string | null;
  scheduledDate?: string | null;
};

type ButtonStatus = "idle" | "loading" | "sent" | "skipped";

export function SendReminderButton({
  workspaceId,
  invoiceId,
  invoiceNumber,
  clientName,
  clientEmail,
  templateId,
  ruleId,
  scheduledDate,
}: SendReminderButtonProps) {
  const [status, setStatus] = useState<ButtonStatus>("idle");
  const [skipReason, setSkipReason] = useState<string | null>(null);
  const router = useRouter();
  const { toast } = useToast();
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  const isLoading = status === "loading";
  const isCompleted = status === "sent" || status === "skipped";

  // Check if button should be disabled (client email missing - email settings check happens server-side)
  const isDisabled = isLoading || isCompleted || !clientEmail;

  const handleClick = async () => {
    // Prevent double-click: if already loading or disabled, ignore
    if (isLoading || isDisabled) return;

    // Clear any existing debounce timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Set loading state
    setStatus("loading");

    // Debounce: prevent rapid successive clicks for 4 seconds
    debounceTimerRef.current = setTimeout(() => {
      debounceTimerRef.current = null;
    }, 4000);

    try {
      const res = await sendReminderAction({
        workspaceId,
        invoiceId,
        explicitTemplateId: templateId ?? null,
        ruleId: ruleId ?? null,
        scheduledDate: scheduledDate ?? null,
      });

      if (res.ok && res.status === "sent") {
        // Success: mark as sent and show toast
        setStatus("sent");

        // Success toast with client name and invoice number
        const description = [clientName, invoiceNumber]
          .filter(Boolean)
          .join(" • ") || undefined;

        toast({
          title: "Reminder sent",
          description,
          variant: "default",
        });
      } else if (res.status === "skipped") {
        // Skipped: disable button and store reason
        setStatus("skipped");
        setSkipReason(res.error || res.message || "Reminder was skipped.");

        toast({
          title: "Reminder skipped",
          description: res.error || res.message || "Reminder was not sent.",
          variant: "default",
        });
      } else {
        // Failed: keep button enabled, show error toast
        setStatus("idle");

        toast({
          title: "Failed to send reminder",
          description: res.error || res.message || "Please try again.",
          variant: "destructive",
        });
      }

      // Always refresh server data so History tab updates
      router.refresh();
    } catch (error) {
      // Failed: stop loading, keep button enabled
      setStatus("idle");

      toast({
        title: "Failed to send reminder",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });

      // Still refresh to ensure state is consistent
      router.refresh();
    }
    // Note: status is set in all branches above (sent, skipped, idle),
    // ensuring loading state is always cleared. No finally block needed
    // since React state updates are handled in the try/catch branches.
  };

  // Determine tooltip text based on status
  let tooltipText = "Send reminder";
  if (!clientEmail) {
    tooltipText = "Client email missing";
  } else if (isLoading) {
    tooltipText = "Sending...";
  } else if (status === "sent") {
    tooltipText = "Sent";
  } else if (status === "skipped") {
    tooltipText = skipReason || "Skipped";
  }

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size={status === "sent" ? "sm" : "icon"}
            onClick={handleClick}
            disabled={isDisabled}
            aria-label="Send reminder"
            className={status === "sent" ? "h-8 px-2" : "h-8 w-8"}
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : status === "sent" ? (
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                <span className="text-xs text-emerald-600 font-medium">Sent</span>
              </div>
            ) : status === "skipped" ? (
              <Send className="h-4 w-4 text-slate-400" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>{tooltipText}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

