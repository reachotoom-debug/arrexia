import "server-only";

import {
  SANDBOX_RECIPIENT_MISSING_MESSAGE,
  formatSandboxRecipientWarning,
  isSandboxRecipientAllowed,
  normalizeEmailAddress,
  SANDBOX_FROM_EMAIL,
} from "@/lib/email/constants";
import {
  EMAIL_SENDER_MISCONFIGURED_MESSAGE,
  getEmailSender,
  isSandboxEmailSenderActive,
  logEmailSenderDev,
  parseEmailSenderAddress,
  resolveResendSender,
} from "@/lib/email/getEmailSender";

export {
  SANDBOX_RECIPIENT_MISSING_MESSAGE,
  formatSandboxRecipientWarning,
  isSandboxRecipientAllowed,
  getEmailSender,
  EMAIL_SENDER_MISCONFIGURED_MESSAGE,
};

export type EmailAttachment = {
  filename: string;
  content: Buffer | string;
  contentType?: string;
};

export type SendEmailInput = {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  /** Ignored for Resend — use EMAIL_FROM via getEmailSender(). Kept for SMTP callers. */
  from?: string;
  fromName?: string | null;
  fromEmail?: string | null;
  attachments?: EmailAttachment[];
};

export type SendEmailResult = {
  success: boolean;
  messageId?: string;
  error?: string;
};

const EMAIL_TIMEOUT_MS = 9000;
const ATTACHMENT_EMAIL_TIMEOUT_MS = 60000;

export function isSandboxSenderActive(): boolean {
  return isSandboxEmailSenderActive();
}

export function getResendTestRecipientEmail(): string | null {
  const email = process.env.RESEND_TEST_RECIPIENT_EMAIL?.trim();
  return email || null;
}

export function validateSandboxRecipient(recipientEmail: string): string | null {
  if (!isSandboxSenderActive()) {
    return null;
  }

  const testRecipientEmail = getResendTestRecipientEmail();
  if (!testRecipientEmail) {
    return SANDBOX_RECIPIENT_MISSING_MESSAGE;
  }

  if (isSandboxRecipientAllowed(recipientEmail, testRecipientEmail)) {
    return null;
  }

  return formatSandboxRecipientWarning(testRecipientEmail);
}

/** @deprecated Resend uses getEmailSender() only. Kept for compatibility. */
export function resolveFromEmail(_options?: { fromEmail?: string | null }): string {
  return parseEmailSenderAddress(getEmailSender()) ?? SANDBOX_FROM_EMAIL;
}

/** @deprecated Resend uses getEmailSender() only. Kept for compatibility. */
export function resolveFromAddress(_options?: {
  from?: string;
  fromName?: string | null;
  fromEmail?: string | null;
}): string {
  const sender = resolveResendSender();
  return sender.ok ? sender.from : getEmailSender();
}

export function isResendConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim());
}

/** Prefer Resend when configured unless workspace explicitly chose SMTP. */
export function resolveEmailProvider(settingsProvider?: string | null): "resend" | "smtp" {
  if (settingsProvider === "smtp") {
    return "smtp";
  }
  if (isResendConfigured()) {
    return "resend";
  }
  return "smtp";
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    return {
      success: false,
      error: "RESEND_API_KEY is missing. Email sending is not configured.",
    };
  }

  const sender = resolveResendSender();
  if (!sender.ok) {
    return { success: false, error: sender.error };
  }

  const from = sender.from;
  logEmailSenderDev(from);

  const { Resend } = await import("resend");
  const resend = new Resend(apiKey);

  const to = Array.isArray(input.to) ? input.to : [input.to];
  const attachments = input.attachments?.length
    ? input.attachments.map((attachment) => {
        const content = Buffer.isBuffer(attachment.content)
          ? attachment.content
          : Buffer.from(attachment.content);

        return {
          filename: attachment.filename,
          content,
          contentType: attachment.contentType ?? "application/octet-stream",
        };
      })
    : undefined;

  const timeoutMs = attachments?.length ? ATTACHMENT_EMAIL_TIMEOUT_MS : EMAIL_TIMEOUT_MS;

  const sendPromise =
    input.html != null && input.html !== ""
      ? resend.emails.send({
          from,
          to,
          subject: input.subject,
          html: input.html,
          ...(input.text ? { text: input.text } : {}),
          ...(attachments ? { attachments } : {}),
        })
      : resend.emails.send({
          from,
          to,
          subject: input.subject,
          text: input.text ?? "",
          ...(attachments ? { attachments } : {}),
        });

  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(
      () => reject(new Error(`Email send timeout (${Math.round(timeoutMs / 1000)}s)`)),
      timeoutMs
    );
  });

  try {
    const { data, error } = await Promise.race([sendPromise, timeoutPromise]);

    if (error) {
      return {
        success: false,
        error: error.message || "Resend API error",
      };
    }

    return {
      success: true,
      messageId: data?.id,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to send email",
    };
  }
}

/** Small retry for transient Resend/network errors (optional helper). */
export async function sendEmailWithRetry(
  input: SendEmailInput,
  attempts = 2
): Promise<SendEmailResult> {
  let lastResult: SendEmailResult = {
    success: false,
    error: "Failed to send email",
  };

  for (let attempt = 1; attempt <= attempts; attempt++) {
    lastResult = await sendEmail(input);
    if (lastResult.success) {
      return lastResult;
    }
    if (attempt < attempts) {
      await delay(200 * attempt);
    }
  }

  return lastResult;
}
