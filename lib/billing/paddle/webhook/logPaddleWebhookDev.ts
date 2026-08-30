/** Dev-only structured logging for Paddle webhook verification failures (no secrets). */
export function logPaddleWebhookVerifyDev(payload: {
  webhookSecretPresent: boolean;
  signaturePresent: boolean;
  rawBodyByteLength: number;
  verificationErrorName?: string;
  verificationErrorMessage?: string;
  eventParsed?: boolean;
}): void {
  if (process.env.NODE_ENV !== "development") return;
  console.error("[paddle/webhook/verify]", payload);
}
