export const PUBLIC_INVOICE_LINK_LABEL = "View invoice:";

export function formatPublicInvoiceLinkBlock(publicInvoiceUrl: string): string {
  return `${PUBLIC_INVOICE_LINK_LABEL}\n${publicInvoiceUrl.trim()}`;
}

/** Inserts a public view-invoice link before the Powered by Arrexia footer block. */
export function appendPublicInvoiceLinkToCollectionMessage(
  message: string,
  publicInvoiceUrl: string
): string {
  const block = formatPublicInvoiceLinkBlock(publicInvoiceUrl);
  const footerMarker = "Powered by Arrexia";
  const footerIdx = message.indexOf(footerMarker);
  if (footerIdx >= 0) {
    const before = message.slice(0, footerIdx).trimEnd();
    const after = message.slice(footerIdx);
    return `${before}\n\n${block}\n\n${after}`;
  }
  return `${message.trimEnd()}\n\n${block}`;
}
