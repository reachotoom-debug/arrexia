import { z } from "zod";

export const reminderSchema = z.object({
  name: z.string().min(1, "Name is required"),
  type: z.enum(["before_due", "after_due", "on_due"]),
  offset_days: z.number().int("Offset must be an integer"),
  channel: z.enum(["email", "whatsapp", "sms"]),
  active: z.boolean().default(true),
});

export type ReminderFormValues = z.infer<typeof reminderSchema>;

