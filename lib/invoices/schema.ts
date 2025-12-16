import { z } from "zod";

export const InvoiceItemSchema = z.object({
  id: z.string().optional(), // only used for editing existing items
  name: z
    .string()
    .min(1, "Item name is required")
    .max(255, "Name is too long"),
  description: z.string().optional(),
  quantity: z
    .number({
      required_error: "Quantity is required",
      invalid_type_error: "Quantity must be a number",
    })
    .positive("Quantity must be greater than 0"),
  unit_price: z
    .number({
      required_error: "Unit price is required",
      invalid_type_error: "Unit price must be a number",
    })
    .nonnegative("Unit price cannot be negative"),
  position: z.number().optional(),
});

export const InvoiceFormSchema = z.object({
  clientId: z
    .string({
      required_error: "Client is required",
    })
    .uuid("Invalid client id"),

  invoiceNumber: z
    .string({
      required_error: "Invoice number is required",
    })
    .regex(/^INV-\d{4}$/, "Invalid invoice format (expected INV-0001)"),

  issueDate: z.string({
    required_error: "Issue date is required",
  }),

  // Due date is optional - server will compute it from issueDate + paymentTerms
  dueDate: z.string().optional(),

  poNumber: z.string().optional(),

  notes: z.string().optional(),

  // User-controlled status: draft | sent | void
  // payment_state is derived, not user-editable
  // Note: is_overdue is deprecated - use dynamic logic: (due_date < today) AND (outstanding_amount > 0)
  status: z.enum(["draft", "sent", "void"], {
    required_error: "Status is required",
  }),

  // Payment terms
  paymentTerms: z.enum([
    "net_7",
    "net_15",
    "net_30",
    "net_45",
    "net_60",
    "due_on_receipt",
    "custom",
  ]),

  // Required when paymentTerms = 'custom'
  paymentTermsDays: z.number().int().min(0).optional(),

  discountPercent: z
    .number()
    .min(0)
    .max(100)
    .default(0)
    .optional(),

  taxPercent: z
    .number()
    .min(0)
    .max(100)
    .default(0)
    .optional(),

  items: z
    .array(InvoiceItemSchema)
    .min(1, "At least one line item is required"),
})
.refine(
  (data) => {
    if (data.paymentTerms === "custom") {
      return data.paymentTermsDays !== undefined && data.paymentTermsDays !== null && data.paymentTermsDays >= 0;
    }
    return true;
  },
  {
    message: "Payment terms days is required when payment terms is custom",
    path: ["paymentTermsDays"],
  }
);

export type InvoiceItemFormValues = z.infer<typeof InvoiceItemSchema>;
export type InvoiceFormValues = z.infer<typeof InvoiceFormSchema>;

