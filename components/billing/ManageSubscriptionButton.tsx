"use client";

import { useState } from "react";
import { useToast } from "@/components/ui/use-toast";
import { openPaddleCustomerPortal } from "@/app/[workspaceId]/settings/billingActions";

type ManageSubscriptionButtonProps = {
  workspaceId: string;
  disabled?: boolean;
  disabledReason?: string;
};

export function ManageSubscriptionButton({
  workspaceId,
  disabled = false,
  disabledReason,
}: ManageSubscriptionButtonProps) {
  const { toast } = useToast();
  const [isOpening, setIsOpening] = useState(false);

  async function handleClick() {
    if (disabled || isOpening) {
      return;
    }

    setIsOpening(true);
    try {
      const result = await openPaddleCustomerPortal(workspaceId);
      if (!result.ok) {
        toast({
          title: "Subscription management unavailable",
          description: result.error,
          variant: "destructive",
        });
        return;
      }

      window.location.href = result.url;
    } finally {
      setIsOpening(false);
    }
  }

  return (
    <button
      type="button"
      title={disabledReason}
      disabled={disabled || isOpening}
      onClick={handleClick}
      className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
    >
      {isOpening ? "Opening…" : "Manage subscription"}
    </button>
  );
}
