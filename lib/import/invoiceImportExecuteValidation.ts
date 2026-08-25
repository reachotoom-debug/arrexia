import type { InvoiceGroupPayload } from "@/app/[workspaceId]/settings/import/_lib/invoicesGroupedFormat";

/**
 * Authoritative server-side validation for invoice import execute.
 * Mirrors RPC line-item rules; DB remains final authority for service-role path.
 */
export function validateInvoiceGroupsForExecute(
  invoiceGroups: InvoiceGroupPayload[]
): string[] {
  const errors: string[] = [];

  for (const group of invoiceGroups) {
    const inv = group.invoice_number || "Unknown";

    if (!group.items?.length) {
      errors.push(`Invoice ${inv}: at least one line item is required`);
      continue;
    }

    let total = 0;

    for (const item of group.items) {
      const qty = item.quantity;
      const price = item.unit_price;

      if (qty == null || !Number.isFinite(qty)) {
        errors.push(`Invoice ${inv}: quantity must be a valid number`);
      } else if (qty <= 0) {
        errors.push(`Invoice ${inv}: quantity must be greater than zero`);
      }

      if (price == null || !Number.isFinite(price)) {
        errors.push(`Invoice ${inv}: unit price must be a valid number`);
      } else if (price <= 0) {
        errors.push(`Invoice ${inv}: unit price must be greater than zero`);
      }

      if (
        Number.isFinite(qty) &&
        Number.isFinite(price) &&
        qty > 0 &&
        price > 0
      ) {
        const lineAmount = qty * price;
        if (!(lineAmount > 0)) {
          errors.push(`Invoice ${inv}: line amount must be greater than zero`);
        }
        total += lineAmount;
      }
    }

    if (!(total > 0)) {
      errors.push(`Invoice ${inv}: must have a positive total (sum of line items)`);
    }
  }

  return errors;
}
