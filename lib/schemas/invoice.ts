import { z } from "zod";

export const invoiceItemSchema = z.object({
  name: z.string().min(1, "Item name is required"),
  description: z.string().optional().or(z.literal("")),
  quantity: z.number().positive("Quantity must be greater than 0"),
  unit_price: z.number().nonnegative("Unit price must be >= 0"),
  position: z.number().optional(),
});

export const invoiceSchema = z.object({
  client_id: z.string().uuid("Invalid client"),
  invoice_number: z.string().min(1, "Invoice number is required"),
  issue_date: z.string().min(1, "Issue date is required"),
  due_date: z.string().min(1, "Due date is required"),
  currency: z.string().min(1, "Currency is required"),
  notes: z.string().optional().or(z.literal("")),
  po_number: z.string().optional().or(z.literal("")),
  status: z
    .enum(["draft", "sent", "overdue", "paid", "partially_paid", "void"])
    .default("draft"),
  items: z.array(invoiceItemSchema).min(1, "At least one item is required"),
});

export type InvoiceFormValues = z.infer<typeof invoiceSchema>;
export type InvoiceItemFormValues = z.infer<typeof invoiceItemSchema>;
