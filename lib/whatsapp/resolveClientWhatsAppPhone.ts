/**
 * Resolve the client phone used for WhatsApp click-to-chat.
 * Convention: import-normalized `whatsapp_phone` takes precedence over manual `whatsapp`.
 */
export function resolveClientWhatsAppPhone(
  whatsappPhone: string | null | undefined,
  whatsapp: string | null | undefined
): string | null {
  const phone = whatsappPhone?.trim() || whatsapp?.trim() || null;
  return phone || null;
}
