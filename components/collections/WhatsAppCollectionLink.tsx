"use client";

import clsx from "clsx";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { buildCollectionWhatsAppMessage } from "@/lib/whatsapp/buildCollectionWhatsAppMessage";
import { buildWhatsAppClickToChatUrl } from "@/lib/whatsapp/buildWhatsAppClickToChatUrl";

type WhatsAppCollectionLinkProps = {
  phone: string | null | undefined;
  clientName: string | null;
  invoiceNumber: string | null;
  outstanding: number;
  currency: string | null;
  dueDate: string | null;
  daysOverdue: number;
  variant?: "button" | "link";
};

export function WhatsAppCollectionLink({
  phone,
  clientName,
  invoiceNumber,
  outstanding,
  currency,
  dueDate,
  daysOverdue,
  variant = "link",
}: WhatsAppCollectionLinkProps) {
  const message = buildCollectionWhatsAppMessage({
    clientName,
    invoiceNumber,
    outstanding,
    currency,
    dueDate,
    daysOverdue,
  });
  const url = buildWhatsAppClickToChatUrl({ phone, message });
  const isDisabled = !url;

  const tooltipText = isDisabled
    ? "Client WhatsApp number missing or unusable"
    : "Open WhatsApp with a prefilled message (you send manually)";

  const handleClick = () => {
    if (!url) return;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const buttonClassName =
    variant === "button"
      ? clsx(
          "inline-flex items-center whitespace-nowrap rounded-md px-2.5 py-1.5 text-xs font-semibold shadow-sm transition-colors",
          isDisabled
            ? "cursor-not-allowed bg-slate-100 text-slate-400"
            : "bg-emerald-600 text-white hover:bg-emerald-700"
        )
      : clsx(
          "text-sm font-medium",
          isDisabled
            ? "cursor-not-allowed text-slate-400"
            : "text-emerald-600 hover:text-emerald-800 hover:underline"
        );

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={handleClick}
            disabled={isDisabled}
            aria-label="WhatsApp"
            className={buttonClassName}
          >
            WhatsApp
          </button>
        </TooltipTrigger>
        <TooltipContent>
          <p>{tooltipText}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
