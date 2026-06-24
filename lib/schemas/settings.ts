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
  // Workspace timezone (IANA). Prefer values from TIMEZONE_OPTIONS, but allow any string.
  timezone: z.string().max(100, "Timezone must be at most 100 characters").optional().or(z.literal("")).transform((v) => (v ? v : null)),
});

export type WorkspaceProfileFormValues = z.infer<typeof workspaceProfileSchema>;

const optionalSmtpText = z
  .union([z.string(), z.null(), z.undefined()])
  .optional()
  .transform((value) => (typeof value === "string" ? value : ""));

const optionalSmtpPort = z
  .union([z.string(), z.number(), z.null(), z.undefined()])
  .optional()
  .transform((value) => {
    if (value === null || value === undefined || value === "") {
      return null;
    }
    const parsed = typeof value === "number" ? value : Number(String(value).trim());
    if (!Number.isInteger(parsed) || parsed <= 0 || parsed >= 65536) {
      return null;
    }
    return parsed;
  });

// Email & Sending Schema
export const emailSettingsSchema = z
  .object({
    provider: z.union([z.literal("resend"), z.literal("smtp")]),
    fromName: z
      .string()
      .min(1, "From name is required")
      .max(120, "From name must be at most 120 characters"),
    fromEmail: z.string().email("Invalid email").max(320, "Email must be at most 320 characters"),
    smtpHost: optionalSmtpText,
    smtpPort: optionalSmtpPort,
    smtpUser: optionalSmtpText,
    smtpPassword: optionalSmtpText,
    smtpUseTls: z.boolean().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.provider !== "smtp") {
      return;
    }

    if (!data.smtpHost.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["smtpHost"],
        message: "SMTP host is required",
      });
    }

    if (!data.smtpPort) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["smtpPort"],
        message: "Invalid port",
      });
    }
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

// Supported currency codes for workspace default currency
const CURRENCY_CODES = ["USD", "EUR", "GBP", "JOD", "AED", "SAR", "EGP"] as const;

// Helper for optional text fields: accepts string, "", undefined, or null; outputs null for empty/falsy
const optionalTextField = (maxLen: number, errorMsg: string) =>
  z.string().max(maxLen, errorMsg).optional().nullable().or(z.literal("")).transform((v) => (v ? v.trim() || null : null));

// Payments Schema
export const paymentSettingsSchema = z.object({
  defaultCurrency: z.enum(CURRENCY_CODES, { message: "Invalid currency code" }),
  // Global payment terms are intentionally hidden in Settings (per-client/per-invoice terms are primary).
  // Keep DB column for compatibility, but do not require it in this form.
  defaultPaymentTermsDays: z.coerce.number().int().min(0, "Days must be non-negative").max(365, "Days must be at most 365").optional(),

  // Branding (workspace-level; do NOT write into invoices rows)
  brandingLogoUrl: z
    .string()
    .max(500, "URL must be at most 500 characters")
    .refine((val) => val === "" || z.string().url().safeParse(val).success, {
      message: "Invalid URL",
    })
    .optional()
    .nullable()
    .transform((val) => (val === "" || val === undefined || val === null ? null : val)),
  workspaceDisplayName: optionalTextField(120, "Workspace name must be at most 120 characters"),
  brandingBusinessLegalName: optionalTextField(160, "Legal name must be at most 160 characters"),
  brandingBusinessAddress: optionalTextField(1000, "Address must be at most 1000 characters"),
  businessEmail: z.string().email("Invalid email").max(320, "Email must be at most 320 characters").optional().nullable().or(z.literal("")).transform((v) => (v ? v : null)),
  brandingBusinessPhone: optionalTextField(50, "Phone must be at most 50 characters"),
  brandingWebsite: optionalTextField(500, "Website must be at most 500 characters"),
  brandingTaxId: optionalTextField(100, "Tax ID must be at most 100 characters"),

  // Payment details (workspace-level)
  paymentBankName: optionalTextField(120, "Bank name must be at most 120 characters"),
  paymentBankAccountName: optionalTextField(120, "Account name must be at most 120 characters"),
  paymentBankAccountNumber: optionalTextField(120, "Account number must be at most 120 characters"),
  paymentBankSwift: optionalTextField(50, "SWIFT must be at most 50 characters"),
  paymentBankIban: optionalTextField(60, "IBAN must be at most 60 characters"),
  paymentPaypalHandle: optionalTextField(200, "PayPal handle must be at most 200 characters"),
  paymentStripeDescriptor: optionalTextField(200, "Stripe descriptor must be at most 200 characters"),
  paymentOtherInstructions: optionalTextField(2000, "Instructions must be at most 2000 characters"),

  // Invoice thank-you text
  invoiceThankYouNote: optionalTextField(2000, "Thank-you note must be at most 2000 characters"),
});

export type PaymentSettingsFormValues = z.infer<typeof paymentSettingsSchema>;
