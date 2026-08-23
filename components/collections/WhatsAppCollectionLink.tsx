"use client";

import { useState, useTransition } from "react";
import clsx from "clsx";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { resolvePublicInvoiceUrlAction } from "@/app/[workspaceId]/invoices/publicInvoiceActions";
import { buildCollectionWhatsAppMessage } from "@/lib/whatsapp/buildCollectionWhatsAppMessage";
import { buildWhatsAppClickToChatUrl } from "@/lib/whatsapp/buildWhatsAppClickToChatUrl";

type WhatsAppCollectionLinkProps = {
  workspaceId: string;
  invoiceId: string;
  phone: string | null | undefined;
  clientCountry?: string | null;
  clientName: string | null;
  businessName: string | null;
  invoiceNumber: string | null;
  outstanding: number;
  currency: string | null;
  dueDate: string | null;
  daysOverdue: number;
  /** Workspace calendar date (YYYY-MM-DD) from server-side evaluation. Required when daysOverdue is 0. */
  evaluationDate?: string;
  /** Pre-resolved public invoice URL when available from server loaders. */
  publicInvoiceUrl?: string | null;
  variant?: "button" | "link";
};

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={className}
      fill="currentColor"
    >
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

export function WhatsAppCollectionLink({
  workspaceId,
  invoiceId,
  phone,
  clientCountry,
  clientName,
  businessName,
  invoiceNumber,
  outstanding,
  currency,
  dueDate,
  daysOverdue,
  evaluationDate,
  publicInvoiceUrl,
  variant = "link",
}: WhatsAppCollectionLinkProps) {
  const [isPending, startTransition] = useTransition();
  const phoneUrl = buildWhatsAppClickToChatUrl({
    phone,
    clientCountry,
    message: buildCollectionWhatsAppMessage({
      clientName,
      businessName,
      invoiceNumber,
      outstanding,
      currency,
      dueDate,
      daysOverdue,
      evaluationDate,
      publicInvoiceUrl,
    }),
  });
  const isDisabled = !phoneUrl || isPending;

  const tooltipText = !phoneUrl
    ? "Client WhatsApp number missing or unusable"
    : isPending
      ? "Preparing message…"
      : "Open WhatsApp with a prefilled message (you send manually)";

  const handleClick = () => {
    if (!phoneUrl || isPending) return;

    startTransition(async () => {
      let resolvedUrl = publicInvoiceUrl?.trim() || null;
      if (!resolvedUrl) {
        resolvedUrl = await resolvePublicInvoiceUrlAction(workspaceId, invoiceId);
      }

      const message = buildCollectionWhatsAppMessage({
        clientName,
        businessName,
        invoiceNumber,
        outstanding,
        currency,
        dueDate,
        daysOverdue,
        evaluationDate,
        publicInvoiceUrl: resolvedUrl,
      });

      const url = buildWhatsAppClickToChatUrl({ phone, clientCountry, message });
      if (!url) return;
      window.open(url, "_blank", "noopener,noreferrer");
    });
  };

  const buttonClassName =
    variant === "button"
      ? clsx(
          "inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-1.5 text-xs font-semibold shadow-sm transition-colors",
          isDisabled
            ? "cursor-not-allowed bg-slate-100 text-slate-400"
            : "bg-emerald-600 text-white hover:bg-emerald-700"
        )
      : clsx(
          "inline-flex items-center gap-1.5 text-sm font-medium",
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
            <WhatsAppIcon className="h-3.5 w-3.5 shrink-0" />
            <span>WhatsApp</span>
          </button>
        </TooltipTrigger>
        <TooltipContent>
          <p>{tooltipText}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
