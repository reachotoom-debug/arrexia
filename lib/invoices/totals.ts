import type { InvoiceItemFormValues } from "./schema";

export function computeInvoiceTotals(
  items: InvoiceItemFormValues[],
  discountPercent: number = 0,
  taxPercent: number = 0
) {
  const subtotal = items.reduce((sum, item) => {
    return sum + item.quantity * item.unit_price;
  }, 0);

  const discountAmount = (subtotal * (discountPercent || 0)) / 100;
  const taxable = subtotal - discountAmount;
  const taxAmount = (taxable * (taxPercent || 0)) / 100;
  const total = taxable + taxAmount;

  return {
    subtotal,
    discountAmount,
    taxAmount,
    total,
  };
}

