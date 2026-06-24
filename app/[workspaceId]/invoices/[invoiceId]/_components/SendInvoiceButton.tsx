"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/use-toast";
import { getSandboxRecipientWarning } from "@/lib/email/constants";

interface SendInvoiceButtonProps {
  workspaceId: string;
  invoiceId: string;
  clientEmail: string | null | undefined;
  invoiceNumber: string;
  sandboxMode?: boolean;
  sandboxTestRecipientEmail?: string | null;
}

type SendInvoiceResponse = {
  ok?: boolean;
  success?: boolean;
  message?: string;
  messageId?: string;
  error?: string;
};

async function parseSendInvoiceResponse(res: Response): Promise<SendInvoiceResponse> {
  const contentType = res.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    return (await res.json()) as SendInvoiceResponse;
  }

  const text = await res.text();
  const preview = text.replace(/\s+/g, " ").trim().slice(0, 160);
  throw new Error(
    preview
      ? `Unexpected response (${res.status}): ${preview}`
      : `Unexpected response (${res.status}). Please try again.`
  );
}

export function SendInvoiceButton({
  workspaceId,
  invoiceId,
  clientEmail,
  invoiceNumber,
  sandboxMode = false,
  sandboxTestRecipientEmail = null,
}: SendInvoiceButtonProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [isSending, setIsSending] = useState(false);

  const sandboxWarning = useMemo(
    () =>
      getSandboxRecipientWarning(clientEmail, sandboxTestRecipientEmail, sandboxMode),
    [sandboxMode, clientEmail, sandboxTestRecipientEmail]
  );

  const handleSendInvoice = async () => {
    if (!clientEmail) {
      toast({
        variant: "destructive",
        title: "Failed to send invoice email.",
        description: "Client email is required to send invoice.",
      });
      return;
    }

    if (sandboxWarning) {
      toast({
        variant: "destructive",
        title: "Failed to send invoice email.",
        description: sandboxWarning,
      });
      return;
    }

    setIsSending(true);

    try {
      const res = await fetch(
        `/api/workspaces/${workspaceId}/invoices/${invoiceId}/send`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ toEmail: clientEmail }),
        }
      );

      const data = await parseSendInvoiceResponse(res);

      if (!res.ok || data.ok === false || data.success === false) {
        toast({
          variant: "destructive",
          title: "Failed to send invoice email.",
          description: data.error || data.message || "Please try again.",
        });
        return;
      }

      toast({
        title: "Invoice email sent successfully.",
        description: `The invoice was sent to ${clientEmail}.`,
      });
      router.refresh();
    } catch (e) {
      console.error("[SendInvoiceButton] send error", e);
      toast({
        variant: "destructive",
        title: "Failed to send invoice email.",
        description:
          e instanceof Error ? e.message : "Please try again.",
      });
    } finally {
      setIsSending(false);
    }
  };

  const isDisabled = !clientEmail || isSending || Boolean(sandboxWarning);

  return (
    <div className="relative">
      <button
        onClick={handleSendInvoice}
        disabled={isDisabled}
        className={`inline-flex items-center rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
          isDisabled
            ? "border border-slate-200 bg-slate-50 text-slate-400 cursor-not-allowed"
            : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
        }`}
        title={
          sandboxWarning
            ? sandboxWarning
            : !clientEmail
            ? "Client email is required to send invoice"
            : isSending
            ? "Sending invoice..."
            : `Send invoice to ${clientEmail}`
        }
      >
        {isSending ? "Sending..." : "Send Invoice"}
      </button>
      {sandboxWarning && (
        <p className="absolute top-full left-0 mt-1 max-w-xs rounded-md bg-amber-50 border border-amber-200 px-2 py-1 text-xs text-amber-800 z-10">
          {sandboxWarning}
        </p>
      )}
    </div>
  );
}
