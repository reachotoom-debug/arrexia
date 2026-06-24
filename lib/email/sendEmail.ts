import "server-only";

import {
  SANDBOX_FROM_EMAIL,
  SANDBOX_RECIPIENT_MISSING_MESSAGE,
  formatSandboxRecipientWarning,
  isSandboxRecipientAllowed,
  normalizeEmailAddress,
} from "@/lib/email/constants";

export {
  SANDBOX_RECIPIENT_MISSING_MESSAGE,
  formatSandboxRecipientWarning,
  isSandboxRecipientAllowed,
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

const DEFAULT_FROM_NAME = "FlowCollect";
const DEFAULT_FROM_EMAIL = SANDBOX_FROM_EMAIL;
const EMAIL_TIMEOUT_MS = 9000;
const ATTACHMENT_EMAIL_TIMEOUT_MS = 60000;

function normalizeEmail(email: string): string {
  return normalizeEmailAddress(email);
}

function emailDomain(email: string): string | null {
  const at = email.lastIndexOf("@");
  if (at === -1) {
    return null;
  }
  return email.slice(at + 1).toLowerCase();
}

function configuredFromEmail(): string {
  return process.env.EMAIL_FROM?.trim() || DEFAULT_FROM_EMAIL;
}

export function isSandboxSenderActive(): boolean {
  return normalizeEmail(configuredFromEmail()) === normalizeEmail(SANDBOX_FROM_EMAIL);
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

/**
 * Resolve the actual From email address for Resend sends.
 *
 * Priority:
 * 1. Sandbox (EMAIL_FROM=onboarding@resend.dev): always onboarding@resend.dev
 * 2. Production: EMAIL_FROM
 * 3. Workspace from_email only when it shares the EMAIL_FROM domain (verified domain)
 */
export function resolveFromEmail(options?: { fromEmail?: string | null }): string {
  const envFrom = configuredFromEmail();
  const workspaceFrom = options?.fromEmail?.trim() || null;

  if (isSandboxSenderActive()) {
    if (
      workspaceFrom &&
      normalizeEmail(workspaceFrom) !== normalizeEmail(SANDBOX_FROM_EMAIL)
    ) {
      console.info("[email] Ignoring workspace from_email because sandbox sender is active");
    }
    return SANDBOX_FROM_EMAIL;
  }

  if (workspaceFrom) {
    const envDomain = emailDomain(envFrom);
    const workspaceDomain = emailDomain(workspaceFrom);
    if (envDomain && workspaceDomain === envDomain) {
      return workspaceFrom;
    }
    if (normalizeEmail(workspaceFrom) !== normalizeEmail(envFrom)) {
      console.info(
        "[email] Ignoring workspace from_email because it is not on the configured sender domain"
      );
    }
  }

  return envFrom;
}

export function resolveFromAddress(options?: {
  from?: string;
  fromName?: string | null;
  fromEmail?: string | null;
}): string {
  if (options?.from?.trim()) {
    return options.from.trim();
  }

  const name = options?.fromName?.trim() || DEFAULT_FROM_NAME;
  const email = resolveFromEmail({ fromEmail: options?.fromEmail });

  return `${name} <${email}>`;
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

  const { Resend } = await import("resend");
  const resend = new Resend(apiKey);

  const from = resolveFromAddress(input);
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
