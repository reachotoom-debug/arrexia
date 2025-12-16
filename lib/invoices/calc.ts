import type { InvoiceItemFormValues } from "./schema";

export interface InvoiceItem {
  quantity: number;
  unit_price: number;
}

export interface Payment {
  amount: number;
  status?: string;
}

export interface InvoiceTotals {
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  total: number;
}

export interface OutstandingResult {
  totalPaid: number;
  outstanding: number;
}

/**
 * Calculate invoice totals from line items, discount, and tax
 * @deprecated Use calculateInvoiceMoney instead for proper rounding and percent storage
 */
export function calculateInvoiceTotals(
  items: InvoiceItem[],
  discountPercent: number = 0,
  taxPercent: number = 0
): InvoiceTotals {
  const subtotal = items.reduce((sum, item) => {
    return sum + Number(item.quantity || 0) * Number(item.unit_price || 0);
  }, 0);

  const discountAmount = (subtotal * (discountPercent || 0)) / 100;
  const taxableBase = subtotal - discountAmount;
  const taxAmount = (taxableBase * (taxPercent || 0)) / 100;
  const total = taxableBase + taxAmount;

  return {
    subtotal,
    discountAmount,
    taxAmount,
    total,
  };
}

/**
 * Money calculation input for invoices
 */
export interface InvoiceMoneyInput {
  items: Array<{
    quantity: number;
    unit_price: number;
  }>;
  discountPercent: number; // 0–100
  taxPercent: number; // 0–100
}

/**
 * Money calculation result for invoices
 */
export interface InvoiceMoneyResult {
  subtotal: number;
  discountPercent: number;
  discountAmount: number;
  taxPercent: number;
  taxAmount: number;
  total: number;
}

/**
 * Calculate invoice money values with proper rounding (authoritative calculation model)
 * 
 * Rules:
 * - subtotal = Σ (quantity * unit_price) for all line items
 * - discount_amount = subtotal * (discount_percent / 100)
 * - taxable_amount = subtotal - discount_amount
 * - tax_amount = taxable_amount * (tax_percent / 100)
 * - amount = taxable_amount + tax_amount
 * 
 * All amounts rounded to 2 decimal places for currency precision.
 */
export function calculateInvoiceMoney(input: InvoiceMoneyInput): InvoiceMoneyResult {
  // Calculate subtotal
  const subtotal = input.items.reduce((sum, item) => {
    const qty = Number(item.quantity) || 0;
    const price = Number(item.unit_price) || 0;
    return sum + qty * price;
  }, 0);

  // Get percentages (0-100)
  const discountPercent = Number(input.discountPercent) || 0;
  const taxPercent = Number(input.taxPercent) || 0;

  // Calculate discount amount with rounding to 2 decimal places
  const discountAmountRaw = subtotal * (discountPercent / 100);
  const discountAmount = Math.round(discountAmountRaw * 100) / 100;

  // Calculate taxable amount (subtotal after discount)
  const taxableAmount = subtotal - discountAmount;

  // Calculate tax amount with rounding to 2 decimal places
  const taxAmountRaw = taxableAmount * (taxPercent / 100);
  const taxAmount = Math.round(taxAmountRaw * 100) / 100;

  // Calculate total (taxable_amount + tax_amount)
  const total = taxableAmount + taxAmount;

  return {
    subtotal,
    discountPercent,
    discountAmount,
    taxPercent,
    taxAmount,
    total,
  };
}

/**
 * Calculate outstanding balance from invoice total and payments
 */
export function calculateOutstanding(
  invoiceTotal: number,
  payments: Payment[]
): OutstandingResult {
  const totalPaid = payments
    .filter((p) => p.status === "completed" || p.status === "paid" || !p.status)
    .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);

  const outstanding = invoiceTotal - totalPaid;

  return {
    totalPaid,
    outstanding,
  };
}

