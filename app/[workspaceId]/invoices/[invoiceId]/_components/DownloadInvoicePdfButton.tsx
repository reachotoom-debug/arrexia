"use client";

import { useState, useCallback, useRef } from "react";

type DownloadInvoicePdfButtonProps = {
  /** Absolute path to the PDF route, e.g. /{workspaceId}/invoices/{id}/pdf */
  pdfHref: string;
  /** Suggested download filename */
  fileName: string;
  className?: string;
};

/**
 * Fetches the PDF and triggers a file download without Next.js client navigation
 * (avoids RSC / soft-navigate to a binary response, which can leave the page stuck loading).
 */
export function DownloadInvoicePdfButton({
  pdfHref,
  fileName,
  className,
}: DownloadInvoicePdfButtonProps) {
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const downloadingRef = useRef(false);

  const handleDownloadPdf = useCallback(async () => {
    if (downloadingRef.current) return;
    downloadingRef.current = true;

    setIsDownloadingPdf(true);
    try {
      const res = await fetch(pdfHref, {
        method: "GET",
        credentials: "same-origin",
      });
      if (!res.ok) {
        throw new Error(`PDF request failed: ${res.status}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName.replace(/[^\w.\-]+/g, "_");
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Failed to download invoice PDF:", err);
    } finally {
      downloadingRef.current = false;
      setIsDownloadingPdf(false);
    }
  }, [pdfHref, fileName]);

  return (
    <button
      type="button"
      onClick={handleDownloadPdf}
      disabled={isDownloadingPdf}
      className={className}
    >
      {isDownloadingPdf ? "Downloading…" : "Download PDF"}
    </button>
  );
}
