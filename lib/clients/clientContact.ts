/**
 * V1 client contact presentation contract (no schema change):
 * - Phone → clients.whatsapp
 * - WhatsApp → clients.whatsapp_phone
 * - WhatsApp actions → clients.whatsapp_phone ONLY
 */

export type ClientContactFields = {
  whatsapp?: string | null;
  whatsapp_phone?: string | null;
};

export function getClientPhone(client: ClientContactFields | null | undefined): string | null {
  const value = client?.whatsapp?.trim();
  return value || null;
}

export function getClientWhatsApp(client: ClientContactFields | null | undefined): string | null {
  const value = client?.whatsapp_phone?.trim();
  return value || null;
}

/** Explicit WhatsApp destination for click-to-chat actions (no Phone fallback). */
export function resolveClientWhatsAppPhone(
  whatsappPhone: string | null | undefined
): string | null {
  const value = whatsappPhone?.trim();
  return value || null;
}
