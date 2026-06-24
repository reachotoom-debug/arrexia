import { z } from "zod";
import { parseMMDDYYYY, generateTransactionId } from "./import-utils";

/**
 * Zod schema for payment import row validation
 */
export const PaymentImportRowSchema = z.object({
  row_id: z.number().int().positive(),
  invoice_number: z.string().min(1, "Invoice number is required"),
  amount: z.number().positive("Amount must be greater than 0"),
  currency: z.string().min(1, "Currency is required"),
  payment_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
  method: z.enum(["cash", "bank_transfer", "card", "check", "other"]).nullable(),
  status: z.enum(["completed", "pending", "failed", "refunded"]).default("completed"),
  transaction_id: z.string(),
  notes: z.string().nullable(),
  payment_provider: z.string().nullable(),
  // Computed fields (not from CSV)
  invoice_id: z.string().uuid().nullable(),
  client_id: z.string().uuid().nullable(),
  is_duplicate: z.boolean(),
  is_valid: z.boolean(),
  error_message: z.string().nullable(),
});

export type PaymentImportRow = z.infer<typeof PaymentImportRowSchema>;

/**
 * Raw CSV row data (before validation)
 */
export type RawPaymentImportRow = {
  row_id: number;
  "Payment Date": string;
  Amount: string;
  Currency: string;
  Method: string;
  Provider: string;
  Status: string;
  "Invoice Number": string;
  "Client Name": string;
  "Transaction ID": string;
  "Created At": string;
  "Archived At": string;
  rowOriginal: string; // Original row string for hash generation
};

/**
 * Convert raw CSV row to validated payment import row
 */
export function validatePaymentImportRow(
  raw: RawPaymentImportRow,
  rowOriginal: string
): {
  row: PaymentImportRow;
  errors: string[];
} {
  const errors: string[] = [];

  // Parse payment date (MM/DD/YYYY -> YYYY-MM-DD)
  let paymentDateISO: string;
  try {
    paymentDateISO = parseMMDDYYYY(raw["Payment Date"]);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : "Invalid payment date");
    paymentDateISO = "";
  }

  // Parse amount
  let amount: number;
  try {
    const amountStr = raw.Amount.trim();
    if (!amountStr) {
      errors.push("Amount is required");
      amount = 0;
    } else {
      amount = parseFloat(amountStr);
      if (isNaN(amount) || amount <= 0) {
        errors.push("Amount must be a positive number");
        amount = 0;
      }
    }
  } catch (error) {
    errors.push("Invalid amount format");
    amount = 0;
  }

  // Currency
  const currency = raw.Currency.trim();
  if (!currency) {
    errors.push("Currency is required");
  }

  // Invoice number
  const invoiceNumber = raw["Invoice Number"].trim();
  if (!invoiceNumber) {
    errors.push("Invoice number is required");
  }

  // Method (optional, but validate if provided)
  let method: "cash" | "bank_transfer" | "card" | "check" | "other" | null = null;
  const methodStr = raw.Method.trim().toLowerCase();
  if (methodStr) {
    if (["cash", "bank_transfer", "card", "check", "other"].includes(methodStr)) {
      method = methodStr as "cash" | "bank_transfer" | "card" | "check" | "other";
    } else {
      // Not a hard error, but note it
      errors.push(`Unknown payment method: ${raw.Method}. Will be set to null.`);
    }
  }

  // Status (default to "completed" if blank)
  let status: "completed" | "pending" | "failed" | "refunded" = "completed";
  const statusStr = raw.Status.trim().toLowerCase();
  if (statusStr) {
    if (["completed", "pending", "failed", "refunded"].includes(statusStr)) {
      status = statusStr as typeof status;
    } else {
      errors.push(`Invalid status: ${raw.Status}. Must be one of: completed, pending, failed, refunded`);
    }
  }

  // Transaction ID - generate if blank
  let transactionId = raw["Transaction ID"].trim();
  if (!transactionId && invoiceNumber && paymentDateISO && amount > 0) {
    transactionId = generateTransactionId({
      invoice_number: invoiceNumber,
      payment_date_iso: paymentDateISO,
      amount,
      method,
      rowOriginal,
    });
  } else if (!transactionId) {
    errors.push("Transaction ID is required (cannot generate without invoice number, date, and amount)");
  }

  // Notes and provider (optional)
  // Note: Notes column doesn't exist in the export, so we'll extract it if a "Notes" column exists
  // For now, we'll set it to null since it's not in the export format
  const notes = null; // Notes column is not in the export format
  const paymentProvider = raw.Provider?.trim() || null;

  // Build validated row (validation will be completed after invoice lookup)
  const row: PaymentImportRow = {
    row_id: raw.row_id,
    invoice_number: invoiceNumber,
    amount,
    currency,
    payment_date: paymentDateISO,
    method,
    status,
    transaction_id: transactionId,
    notes,
    payment_provider: paymentProvider || null,
    invoice_id: null, // Will be resolved in preview
    client_id: null, // Will be resolved from invoice
    is_duplicate: false, // Will be set in preview
    is_valid: errors.length === 0,
    error_message: errors.length > 0 ? errors.join("; ") : null,
  };

  return { row, errors };
}

