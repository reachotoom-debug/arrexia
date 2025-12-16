import { z } from "zod";

export const ClientFormSchema = z.object({
  name: z.string().min(1, "Client name is required"),
  email: z.string().email("Invalid email").optional().nullable(),
  phone: z.string().optional().nullable(),
  company: z.string().optional().nullable(),
  country: z.string().min(1, "Country is required"),
  paymentTerms: z.string().min(1, "Payment terms are required"),
  status: z.enum(["active", "inactive"]).default("active"),
  notes: z.string().optional().nullable(),
});

export type ClientFormValues = z.infer<typeof ClientFormSchema>;
