import type { PrintableInvoice } from "./invoice-pdf-shared";

export type { PrintableInvoice } from "./invoice-pdf-shared";

/**
 * Server-only PDF generation. Loads @react-pdf/renderer lazily so invoice
 * pages and client components never pull the PDF renderer into their chunks.
 */
export async function generateInvoicePdf(
  invoice: PrintableInvoice
): Promise<Buffer> {
  const [{ renderToBuffer }, { InvoicePdfDocument }, { ensureInvoicePdfFonts }] =
    await Promise.all([
      import("@react-pdf/renderer"),
      import("./InvoicePdfDocument"),
      import("./pdf-fonts"),
    ]);

  ensureInvoicePdfFonts();
  let logoSrc: string | null = null;
  if (invoice.logoUrl) {
    try {
      const logoResponse = await fetch(invoice.logoUrl);
      if (logoResponse.ok) {
        const logoBytes = Buffer.from(await logoResponse.arrayBuffer());
        const ct =
          logoResponse.headers.get("content-type") || "application/octet-stream";
        const isPng =
          ct.includes("png") || invoice.logoUrl.toLowerCase().endsWith(".png");
        const isJpeg =
          ct.includes("jpeg") ||
          ct.includes("jpg") ||
          invoice.logoUrl.toLowerCase().endsWith(".jpg") ||
          invoice.logoUrl.toLowerCase().endsWith(".jpeg");
        const mime = isPng
          ? "image/png"
          : isJpeg
            ? "image/jpeg"
            : ct.split(";")[0]?.trim() || "application/octet-stream";
        logoSrc = `data:${mime};base64,${logoBytes.toString("base64")}`;
      }
    } catch (e) {
      console.warn("[generateInvoicePdf] logo:", e);
    }
  }

  const element = (
    <InvoicePdfDocument invoice={invoice} logoSrc={logoSrc} />
  );
  const rendered = await renderToBuffer(element);
  return Buffer.isBuffer(rendered) ? rendered : Buffer.from(rendered);
}
