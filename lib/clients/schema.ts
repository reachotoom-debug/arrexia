import { z } from "zod";

export const ClientFormSchema = z.object({
  name: z.string().min(1, "Client name is required"),
  email: z
    .string()
    .email("Invalid email address")
    .optional()
    .nullable(),
  phone: z.string().optional().nullable(), // phone / WhatsApp
  company: z.string().optional().nullable(),
  country: z.string().min(1, "Country is required"),
  paymentTerms: z.string().min(1, "Payment terms are required"),
  status: z.enum(["active", "inactive"]),
  notes: z.string().optional().nullable(),
});

export type ClientFormValues = z.infer<typeof ClientFormSchema>;

