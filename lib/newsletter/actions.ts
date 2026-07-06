"use server";

import { NEWSLETTER_SUCCESS_MESSAGE } from "@/lib/newsletter/constants";
import {
  subscribeNewsletter,
  type NewsletterSignupResult,
} from "@/lib/newsletter/subscribe";

export async function subscribeToNewsletter(
  _prevState: NewsletterSignupResult | null,
  formData: FormData,
): Promise<NewsletterSignupResult> {
  const honeypot = formData.get("website")?.toString() ?? "";
  if (honeypot.trim()) {
    return {
      ok: true,
      message: NEWSLETTER_SUCCESS_MESSAGE,
      tone: "success",
    };
  }

  const email = formData.get("email")?.toString() ?? "";
  const source = formData.get("source")?.toString() ?? null;

  return subscribeNewsletter({ email, source });
}
