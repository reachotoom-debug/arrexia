import { renderNewsletterWelcomeEmail } from "@/lib/email/templates";
import { sendEmail } from "@/lib/email/sendEmail";
import { NEWSLETTER_WELCOME_SUBJECT } from "@/lib/newsletter/constants";

export async function sendNewsletterWelcomeEmail(to: string): Promise<void> {
  const { html, text } = renderNewsletterWelcomeEmail();

  const result = await sendEmail({
    to,
    subject: NEWSLETTER_WELCOME_SUBJECT,
    html,
    text,
  });

  if (!result.success) {
    console.error("[newsletter] welcome email failed:", result.error);
  }
}
