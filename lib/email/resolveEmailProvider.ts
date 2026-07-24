/** Prefer Resend when configured unless workspace explicitly chose SMTP. */
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
