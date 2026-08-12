/**
 * Client import V1 contract: normalization, identity matching, and limits.
 * Shared by preview (app) and tested against RPC migration semantics.
 */

import { normalizeEmail, normalizePhone } from "./normalize";
import { resolveClientPaymentTermsPersistence } from "../clients/paymentTermsPersistence";

/** Maximum client data rows per import file (excluding header). */
export const MAX_CLIENT_IMPORT_ROWS = 500;

export const CLIENT_IMPORT_ROW_LIMIT_MESSAGE =
  "This file contains more than 500 clients. Split it into smaller files and import them sequentially.";

export type ClientImportStatus = "active" | "inactive" | "archived";

export type ClientImportRowData = {
  name: string;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  company: string | null;
  country: string | null;
  payment_terms_days: number | null;
  status: ClientImportStatus | null;
  archived_at: string | null;
};

export type WorkspaceClientRecord = {
  id: string;
  email: string | null;
  whatsapp: string | null;
  whatsapp_phone: string | null;
  archived_at: string | null;
};

export type ClientIdentityMatch =
  | { kind: "insert" }
  | { kind: "update"; clientId: string }
  | { kind: "fail"; reason: string };

/**
 * Parse customer-friendly status values to canonical import status.
 */
export function parseClientImportStatus(value: string): ClientImportStatus | null {
  if (!value) return null;
  const lower = value.trim().toLowerCase();

  if (["active", "true", "yes", "1", "enabled"].includes(lower)) {
    return "active";
  }
  if (["inactive", "false", "no", "0", "disabled"].includes(lower)) {
    return "inactive";
  }
  if (lower === "archived") {
    return "archived";
  }
  return null;
}

/**
 * Parse payment terms days from numeric or "Net 30" style strings.
 */
export function parseClientImportPaymentTermsDays(value: string): number | null {
  if (!value) return null;
  const trimmed = value.trim();

  const numericOnly = parseInt(trimmed, 10);
  if (!Number.isNaN(numericOnly) && numericOnly >= 0) {
    return numericOnly;
  }

  const match =
    trimmed.match(/(\d+)\s*(?:days?|net)?/i) || trimmed.match(/net\s*(\d+)/i);
  if (match?.[1]) {
    const days = parseInt(match[1], 10);
    if (!Number.isNaN(days) && days >= 0) {
      return days;
    }
  }
  return null;
}

export function resolveClientImportPaymentTermsPersistence(
  paymentTermsDays: number | null
): { payment_terms: number; payment_terms_days: number } | null {
  if (paymentTermsDays === null) return null;
  return resolveClientPaymentTermsPersistence(String(paymentTermsDays));
}

/**
 * Normalize email for identity comparison (lowercase trimmed).
 */
export function normalizeClientImportEmail(raw: string): string | null {
  return normalizeEmail(raw);
}

/**
 * Normalize phone/WhatsApp using shared import normalizer.
 */
export function normalizeClientImportPhone(raw: string): string | null {
  return normalizePhone(raw);
}

export function buildWorkspaceClientIndexes(clients: WorkspaceClientRecord[]) {
  const activeByEmail = new Map<string, string[]>();
  const archivedEmails = new Set<string>();
  const activeByWhatsApp = new Map<string, string>();
  const archivedWhatsApps = new Set<string>();

  for (const client of clients) {
    const isArchived = client.archived_at != null;
    const emailKey = client.email
      ? normalizeClientImportEmail(client.email)
      : null;

    if (emailKey) {
      if (isArchived) {
        archivedEmails.add(emailKey);
      } else {
        const list = activeByEmail.get(emailKey) ?? [];
        list.push(client.id);
        activeByEmail.set(emailKey, list);
      }
    }

    const whatsappKeys = new Set<string>();
    if (client.whatsapp_phone) {
      const key = normalizeClientImportPhone(client.whatsapp_phone);
      if (key) whatsappKeys.add(key);
    }
    if (client.whatsapp) {
      const key = normalizeClientImportPhone(client.whatsapp);
      if (key) whatsappKeys.add(key);
    }

    for (const whatsappKey of whatsappKeys) {
      if (isArchived) {
        archivedWhatsApps.add(whatsappKey);
      } else if (!activeByWhatsApp.has(whatsappKey)) {
        activeByWhatsApp.set(whatsappKey, client.id);
      }
    }
  }

  return {
    activeByEmail,
    archivedEmails,
    activeByWhatsApp,
    archivedWhatsApps,
  };
}

/**
 * Resolve client identity for one import row against workspace indexes.
 */
export function resolveClientImportIdentity(params: {
  email: string | null;
  whatsapp: string | null;
  phone: string | null;
  indexes: ReturnType<typeof buildWorkspaceClientIndexes>;
}): ClientIdentityMatch {
  const { email, whatsapp, phone, indexes } = params;
  const whatsappKeys = new Set<string>();
  for (const raw of [whatsapp, phone]) {
    if (!raw) continue;
    const normalized = normalizeClientImportPhone(raw);
    if (normalized) whatsappKeys.add(normalized);
  }

  if (email && indexes.archivedEmails.has(email)) {
    return { kind: "fail", reason: `Client is archived (email: ${email})` };
  }

  for (const key of whatsappKeys) {
    if (indexes.archivedWhatsApps.has(key)) {
      return { kind: "fail", reason: `Client is archived (WhatsApp: ${key})` };
    }
  }

  let emailMatchId: string | null = null;
  if (email) {
    const matches = indexes.activeByEmail.get(email) ?? [];
    if (matches.length > 1) {
      return {
        kind: "fail",
        reason: "Multiple existing clients found with this email; clean up first",
      };
    }
    if (matches.length === 1) {
      emailMatchId = matches[0]!;
    }
  }

  let whatsappMatchId: string | null = null;
  for (const key of whatsappKeys) {
    const id = indexes.activeByWhatsApp.get(key);
    if (id) {
      if (whatsappMatchId && whatsappMatchId !== id) {
        return {
          kind: "fail",
          reason: "WhatsApp matches multiple existing clients; clean up first",
        };
      }
      whatsappMatchId = id;
    }
  }

  if (emailMatchId && whatsappMatchId && emailMatchId !== whatsappMatchId) {
    return {
      kind: "fail",
      reason:
        "Email and WhatsApp resolve to different existing clients; use a single identity key",
    };
  }

  const clientId = emailMatchId ?? whatsappMatchId;
  if (clientId) {
    return { kind: "update", clientId };
  }

  return { kind: "insert" };
}

/**
 * Detect duplicate identity keys within the same import file.
 */
export function detectInFileClientDuplicates(
  rows: Array<{
    lineNumber: number;
    email: string | null;
    whatsapp: string | null;
    phone: string | null;
  }>
): Map<number, string> {
  const errors = new Map<number, string>();
  const emailLines = new Map<string, number[]>();
  const whatsappLines = new Map<string, number[]>();

  for (const row of rows) {
    if (row.email) {
      const lines = emailLines.get(row.email) ?? [];
      lines.push(row.lineNumber);
      emailLines.set(row.email, lines);
    }

    for (const raw of [row.whatsapp, row.phone]) {
      if (!raw) continue;
      const key = normalizeClientImportPhone(raw);
      if (!key) continue;
      const lines = whatsappLines.get(key) ?? [];
      lines.push(row.lineNumber);
      whatsappLines.set(key, lines);
    }
  }

  for (const [email, lines] of emailLines.entries()) {
    if (lines.length > 1) {
      const msg = `Duplicate email "${email}" in file on rows ${lines.join(", ")}`;
      for (const line of lines) {
        errors.set(line, msg);
      }
    }
  }

  for (const [whatsapp, lines] of whatsappLines.entries()) {
    if (lines.length > 1) {
      const msg = `Duplicate WhatsApp "${whatsapp}" in file on rows ${lines.join(", ")}`;
      for (const line of lines) {
        if (!errors.has(line)) {
          errors.set(line, msg);
        }
      }
    }
  }

  return errors;
}
