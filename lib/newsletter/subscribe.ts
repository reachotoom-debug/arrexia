import {
  NEWSLETTER_DUPLICATE_MESSAGE,
  NEWSLETTER_GENERIC_ERROR_MESSAGE,
  NEWSLETTER_INVALID_EMAIL_MESSAGE,
  NEWSLETTER_SUCCESS_MESSAGE,
} from "@/lib/newsletter/constants";
import { sendNewsletterWelcomeEmail } from "@/lib/newsletter/sendWelcomeEmail";
import { parseNewsletterEmail } from "@/lib/newsletter/validate";
import { supabaseAdmin } from "@/lib/supabase/admin";

export type NewsletterSignupTone = "success" | "duplicate" | "error";

export type NewsletterSignupResult = {
  ok: boolean;
  message: string;
  tone: NewsletterSignupTone;
};

type SubscribeNewsletterInput = {
  email: string;
  source?: string | null;
};

export async function subscribeNewsletter(
  input: SubscribeNewsletterInput,
): Promise<NewsletterSignupResult> {
  const email = parseNewsletterEmail(input.email);

  if (!email) {
    return {
      ok: false,
      message: NEWSLETTER_INVALID_EMAIL_MESSAGE,
      tone: "error",
    };
  }

  const source = input.source?.trim() || null;

  try {
    const supabase = supabaseAdmin();
    const { error } = await supabase.from("newsletter_subscribers").insert({
      email,
      source,
      status: "active",
    });

    if (error) {
      if (error.code === "23505") {
        return {
          ok: true,
          message: NEWSLETTER_DUPLICATE_MESSAGE,
          tone: "duplicate",
        };
      }

      console.error("[newsletter] insert failed:", error.message);
      return {
        ok: false,
        message: NEWSLETTER_GENERIC_ERROR_MESSAGE,
        tone: "error",
      };
    }

    await sendNewsletterWelcomeEmail(email);

    return {
      ok: true,
      message: NEWSLETTER_SUCCESS_MESSAGE,
      tone: "success",
    };
  } catch (error) {
    console.error("[newsletter] subscribe failed:", error);
    return {
      ok: false,
      message: NEWSLETTER_GENERIC_ERROR_MESSAGE,
      tone: "error",
    };
  }
}
