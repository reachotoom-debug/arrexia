export const SANDBOX_FROM_EMAIL = "onboarding@resend.dev";

export const SANDBOX_RECIPIENT_MISSING_MESSAGE =
  "Set RESEND_TEST_RECIPIENT_EMAIL in .env.local to enable sandbox testing.";

export function normalizeEmailAddress(email: string): string {
  return email.trim().toLowerCase();
}

export function formatSandboxRecipientWarning(testRecipientEmail: string): string {
  return `Resend sandbox mode is active. Use this test recipient: ${testRecipientEmail.trim()}`;
}

export function isSandboxRecipientAllowed(
  recipientEmail: string | null | undefined,
  testRecipientEmail: string | null | undefined
): boolean {
  if (!recipientEmail?.trim() || !testRecipientEmail?.trim()) {
    return false;
  }

  return (
    normalizeEmailAddress(recipientEmail) === normalizeEmailAddress(testRecipientEmail)
  );
}

export function getSandboxRecipientWarning(
  recipientEmail: string | null | undefined,
  testRecipientEmail: string | null | undefined,
  sandboxMode: boolean
): string | null {
  if (!sandboxMode || !recipientEmail?.trim()) {
    return null;
  }

  if (!testRecipientEmail?.trim()) {
    return SANDBOX_RECIPIENT_MISSING_MESSAGE;
  }

  if (isSandboxRecipientAllowed(recipientEmail, testRecipientEmail)) {
    return null;
  }

  return formatSandboxRecipientWarning(testRecipientEmail);
}
