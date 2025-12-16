import { z } from "zod";

export const paymentSchema = z.object({
  invoice_id: z.string().uuid("Invalid invoice"),
  amount: z.number().positive("Amount must be positive"),
  date: z.string().min(1, "Date is required"),
  method: z.enum(["cash", "bank_transfer", "check", "credit_card", "other"]),
  status: z.enum(["pending", "completed", "failed", "refunded"]).default("completed"),
  transaction_id: z.string().optional().or(z.literal("")),
  notes: z.string().optional().or(z.literal("")),
});

export type PaymentFormValues = z.infer<typeof paymentSchema>;
