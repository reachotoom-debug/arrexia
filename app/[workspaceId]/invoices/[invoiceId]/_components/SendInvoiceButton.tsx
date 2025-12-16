"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface SendInvoiceButtonProps {
  workspaceId: string;
  invoiceId: string;
  clientEmail: string | null | undefined;
  invoiceNumber: string;
}

export function SendInvoiceButton({
  workspaceId,
  invoiceId,
  clientEmail,
  invoiceNumber,
}: SendInvoiceButtonProps) {
  const router = useRouter();
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSendInvoice = async () => {
    if (!clientEmail) {
      setError("Client email is required to send invoice");
      return;
    }

    setIsSending(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/workspaces/${workspaceId}/invoices/${invoiceId}/send`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ toEmail: clientEmail }),
        }
      );

      const data = await res.json();

      if (!res.ok || !data.success) {
        setError(data.error || "Failed to send invoice");
        // Show error for a few seconds
        setTimeout(() => setError(null), 5000);
      } else {
        // Success - refresh the page to show updated delivery logs
        router.refresh();
        // Show success message briefly
        alert(`Invoice #${invoiceNumber} sent successfully to ${clientEmail}`);
      }
    } catch (e) {
      console.error("[SendInvoiceButton] send error", e);
      setError("Failed to send invoice. Please try again.");
      setTimeout(() => setError(null), 5000);
    } finally {
      setIsSending(false);
    }
  };

  const isDisabled = !clientEmail || isSending;

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
          !clientEmail
            ? "Client email is required to send invoice"
            : isSending
            ? "Sending invoice..."
            : `Send invoice to ${clientEmail}`
        }
      >
        {isSending ? "Sending..." : "Send Invoice"}
      </button>
      {error && (
        <div className="absolute top-full left-0 mt-1 rounded-md bg-red-50 border border-red-200 px-2 py-1 text-xs text-red-700 whitespace-nowrap z-10">
          {error}
        </div>
      )}
    </div>
  );
}
