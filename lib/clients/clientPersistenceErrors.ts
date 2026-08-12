export const WHATSAPP_DUPLICATE_MESSAGE =
  "This WhatsApp number is already used by another client.";

export const EMAIL_DUPLICATE_MESSAGE =
  "This email is already used by another client.";

type PostgresClientError = {
  code?: string;
  message?: string;
  details?: string | null;
  hint?: string | null;
};

export type ClientFieldErrors = {
  whatsapp?: string;
  email?: string;
};

export type MappedClientPersistenceError =
  | { kind: "fieldErrors"; fieldErrors: ClientFieldErrors }
  | { kind: "generic"; message: string; code?: string };

function errorHaystack(error: PostgresClientError): string {
  return [error.message, error.details, error.hint].filter(Boolean).join(" ");
}

export function isWhatsAppUniqueViolation(error: PostgresClientError): boolean {
  if (error.code !== "23505") {
    return false;
  }

  const haystack = errorHaystack(error);
  return (
    haystack.includes("clients_workspace_whatsapp_phone_unique") ||
    (haystack.includes("whatsapp_phone") && haystack.toLowerCase().includes("unique"))
  );
}

export function isEmailUniqueViolation(error: PostgresClientError): boolean {
  if (error.code !== "23505") {
    return false;
  }

  const haystack = errorHaystack(error);
  return (
    haystack.includes("clients_workspace_email_unique") ||
    haystack.includes("email_lc")
  );
}

export function mapClientPersistenceError(
  error: PostgresClientError
): MappedClientPersistenceError {
  if (isWhatsAppUniqueViolation(error)) {
    return {
      kind: "fieldErrors",
      fieldErrors: { whatsapp: WHATSAPP_DUPLICATE_MESSAGE },
    };
  }

  if (isEmailUniqueViolation(error)) {
    return {
      kind: "fieldErrors",
      fieldErrors: { email: EMAIL_DUPLICATE_MESSAGE },
    };
  }

  return {
    kind: "generic",
    message: error.message ?? "Failed to save client",
    code: error.code,
  };
}
