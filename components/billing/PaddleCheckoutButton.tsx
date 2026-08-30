"use client";

import { useState } from "react";
import { useToast } from "@/components/ui/use-toast";
import type { BillingInterval } from "@/lib/billing/plans";
import {
  getOpenPaddleCheckoutUxMessage,
  openPaddleCheckout,
} from "@/lib/billing/paddle/openPaddleCheckout";
import type { PaddleCheckoutPlan } from "@/lib/billing/paddle/types";

type PaddleCheckoutButtonProps = {
  plan: PaddleCheckoutPlan;
  interval: BillingInterval;
  workspaceId: string;
  customerId?: string | null;
  customerEmail?: string | null;
  label: string;
  className?: string;
  disabled?: boolean;
  disabledReason?: string;
};

export function PaddleCheckoutButton({
  plan,
  interval,
  workspaceId,
  customerId,
  customerEmail,
  label,
  className,
  disabled = false,
  disabledReason,
}: PaddleCheckoutButtonProps) {
  const { toast } = useToast();
  const [isOpening, setIsOpening] = useState(false);

  async function handleClick() {
    if (disabled || isOpening) {
      return;
    }

    setIsOpening(true);
    try {
      const result = await openPaddleCheckout({
        plan,
        interval,
        workspaceId,
        customerId: customerId ?? undefined,
        customerEmail: customerEmail ?? undefined,
        onUxEvent: (phase) => {
          if (phase === "opened") {
            return;
          }

          toast({
            title:
              phase === "completed"
                ? "Payment received"
                : phase === "error"
                  ? "Checkout issue"
                  : undefined,
            description: getOpenPaddleCheckoutUxMessage(phase),
            variant: phase === "error" ? "destructive" : "default",
          });
        },
      });

      if (!result.ok) {
        toast({
          title: "Checkout unavailable",
          description: result.message,
          variant: "destructive",
        });
      }
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
      className={
        className ??
        "mt-auto inline-flex items-center justify-center rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-600"
      }
    >
      {isOpening ? "Opening checkout…" : label}
    </button>
  );
}
