import { z } from "zod";

// Schema for creating new email settings (password required)
export const emailSettingsSchema = z.object({
  from_name: z.string().min(1, "From name is required"),
  from_email: z.string().email("Invalid email address"),
  smtp_host: z.string().min(1, "SMTP host is required"),
  smtp_port: z.number().int().positive("SMTP port must be a positive number"),
  smtp_username: z.string().min(1, "SMTP username is required"),
  smtp_password: z.string().min(1, "SMTP password is required"),
  use_tls: z.boolean().default(true),
});

// Schema for updating existing settings (password optional)
export const emailSettingsUpdateSchema = z.object({
  from_name: z.string().min(1, "From name is required"),
  from_email: z.string().email("Invalid email address"),
  smtp_host: z.string().min(1, "SMTP host is required"),
  smtp_port: z.number().int().positive("SMTP port must be a positive number"),
  smtp_username: z.string().min(1, "SMTP username is required"),
  smtp_password: z.string().optional(), // Optional when updating
  use_tls: z.boolean().default(true),
});

export type EmailSettingsFormValues = z.infer<typeof emailSettingsSchema>;
export type EmailSettingsUpdateFormValues = z.infer<typeof emailSettingsUpdateSchema>;

