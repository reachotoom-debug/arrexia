import { z } from "zod";

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email()
  .max(320);

export function normalizeNewsletterEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export function isValidNewsletterEmail(raw: string): boolean {
  return emailSchema.safeParse(normalizeNewsletterEmail(raw)).success;
}

export function parseNewsletterEmail(raw: string): string | null {
  const parsed = emailSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}
