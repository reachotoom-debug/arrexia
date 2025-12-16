/**
 * Zod schemas for reminder templates and rules
 * Used for validation in server actions and forms
 */

import { z } from "zod";

/**
 * Schema for reminder template form input
 */
export const ReminderTemplateSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(120, "Name must be at most 120 characters"),
  description: z.string().max(500, "Description must be at most 500 characters").optional().or(z.literal("")).nullable(),
  channel: z.union([z.literal("email"), z.literal("whatsapp")]),
  subject: z.string().min(2, "Subject must be at least 2 characters").max(200, "Subject must be at most 200 characters"),
  body: z.string().min(2, "Body must be at least 2 characters"),
  isEnabled: z.boolean().default(true),
  isDefault: z.boolean().default(false),
});

export type ReminderTemplateInput = z.infer<typeof ReminderTemplateSchema>;

/**
 * Schema for reminder rule form input
 */
export const ReminderRuleSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  triggerType: z.enum(["before_due", "on_due", "after_due"]),
  offsetDays: z.coerce.number().int().min(0, "Offset days must be non-negative").max(365, "Offset days must be at most 365"),
  forStatus: z.enum(["any", "sent", "partially_paid", "overdue", "draft"]),
  templateId: z.string().uuid("Invalid template ID"),
  isEnabled: z.boolean().default(true),
});

export type ReminderRuleInput = z.infer<typeof ReminderRuleSchema>;
