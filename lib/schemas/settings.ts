import { z } from "zod";

// Workspace Profile Schema
export const workspaceProfileSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(120, "Name must be at most 120 characters"),
  logoUrl: z
    .string()
    .max(500, "URL must be at most 500 characters")
    .refine(
      (val) => val === "" || z.string().url().safeParse(val).success,
      { message: "Invalid URL" }
    )
    .optional()
    .transform((val) => (val === "" || val === undefined || val === null ? null : val)),
  phone: z.string().max(50, "Phone must be at most 50 characters").optional().or(z.literal("")),
  country: z.string().max(100, "Country must be at most 100 characters").optional().or(z.literal("")),
  taxNumber: z.string().max(100, "Tax number must be at most 100 characters").optional().or(z.literal("")),
  email: z.string().email("Invalid email").max(320, "Email must be at most 320 characters").optional().or(z.literal("")),
  website: z.string().url("Invalid URL").max(500, "URL must be at most 500 characters").optional().or(z.literal("")),
  addressLine1: z.string().max(255, "Address line 1 must be at most 255 characters").optional().or(z.literal("")),
  addressLine2: z.string().max(255, "Address line 2 must be at most 255 characters").optional().or(z.literal("")),
  city: z.string().max(100, "City must be at most 100 characters").optional().or(z.literal("")),
  state: z.string().max(100, "State must be at most 100 characters").optional().or(z.literal("")),
  postalCode: z.string().max(20, "Postal code must be at most 20 characters").optional().or(z.literal("")),
});

export type WorkspaceProfileFormValues = z.infer<typeof workspaceProfileSchema>;

// Email & Sending Schema
export const emailSettingsSchema = z.object({
  provider: z.union([z.literal("resend"), z.literal("smtp")]),
  fromName: z.string().min(1, "From name is required").max(120, "From name must be at most 120 characters"),
  fromEmail: z.string().email("Invalid email").max(320, "Email must be at most 320 characters"),
  smtpHost: z.string().max(255, "Host must be at most 255 characters").optional().or(z.literal("")),
  smtpPort: z
    .string()
    .optional()
    .or(z.literal(""))
    .transform((v) => (v ? Number(v) : null))
    .refine((v) => v === null || (Number.isInteger(v) && v > 0 && v < 65536), {
      message: "Invalid port",
    }),
  smtpUser: z.string().max(255, "Username must be at most 255 characters").optional().or(z.literal("")),
  smtpPassword: z.string().max(255, "Password must be at most 255 characters").optional().or(z.literal("")), // only when user changes it
  smtpUseTls: z.boolean().optional(),
});

export type EmailSettingsFormValues = z.infer<typeof emailSettingsSchema>;

// Reminders Schema (only fields that exist in DB)
export const reminderSettingsSchema = z.object({
  enableAutomatic: z.boolean(),
  afterDueDays: z.coerce.number().int().min(0, "Days must be non-negative").max(365, "Days must be at most 365"),
  beforeDueDays: z.coerce.number().int().min(0, "Days must be non-negative").max(365, "Days must be at most 365"),
  defaultChannel: z.union([z.literal("email"), z.literal("whatsapp")]),
});

export type ReminderChannel = "email" | "whatsapp";

export type ReminderSettingsFormValues = z.infer<typeof reminderSettingsSchema>;

// Payments Schema
export const paymentSettingsSchema = z.object({
  defaultCurrency: z.string().min(3, "Currency code must be 3 characters").max(3, "Currency code must be 3 characters"), // ISO 4217
  defaultPaymentTermsDays: z.coerce.number().int().min(0, "Days must be non-negative").max(365, "Days must be at most 365"),
});

export type PaymentSettingsFormValues = z.infer<typeof paymentSettingsSchema>;
