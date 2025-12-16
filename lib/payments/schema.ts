import { z } from "zod";

export const PaymentMethodEnum = z.enum([
  "cash",
  "bank_transfer",
  "card",
  "check",
  "other",
]);

export const PaymentStatusEnum = z.enum([
  "pending",
  "completed",
  "failed",
  "refunded",
]);

export const PaymentFormSchema = z.object({
  clientId: z.string().uuid({ message: "Client is required" }),
  invoiceId: z.string().uuid({ message: "Invoice is required" }),
  amount: z
    .number({ message: "Amount is required" })
    .positive("Amount must be positive"),
  date: z
    .string()
    .min(1, "Date is required")
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
  method: PaymentMethodEnum,
  status: PaymentStatusEnum,
  transactionId: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  payment_provider: z.string().optional(),
});

export type PaymentFormValues = z.infer<typeof PaymentFormSchema>;

