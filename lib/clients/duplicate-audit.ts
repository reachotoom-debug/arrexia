/**
 * Duplicate client email audit utilities (server/maintenance use).
 * Uses service role — scoped by workspace_id in callers.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type ClientRecommendation = "keep" | "safe to delete" | "archive instead";

export type ClientDuplicateAuditRow = {
  clientId: string;
  name: string;
  email: string;
  createdAt: string;
  archivedAt: string | null;
  invoiceCount: number;
  paymentCount: number;
  reminderCount: number;
  activityCount: number;
  linkedRecordCount: number;
  classification: "KEEP" | "SAFE_TO_DELETE" | "PREFERRED_KEEP";
  recommendation: ClientRecommendation;
};

export type DuplicateClientGroup = {
  workspaceId: string;
  normalizedEmail: string;
  duplicateCount: number;
  clients: ClientDuplicateAuditRow[];
};

export function normalizeClientEmail(email: string | null | undefined): string | null {
  if (!email) {
    return null;
  }
  const normalized = email.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

export const DUPLICATE_CLIENTS_AUDIT_SQL = `
-- Duplicate client emails per workspace (normalized lower(trim(email)))
WITH normalized AS (
  SELECT
    id,
    workspace_id,
    name,
    email,
    created_at,
    archived_at,
    lower(trim(email)) AS normalized_email
  FROM public.clients
  WHERE email IS NOT NULL
    AND trim(email) <> ''
),
duplicate_groups AS (
  SELECT
    workspace_id,
    normalized_email,
    COUNT(*) AS duplicate_count,
    array_agg(id ORDER BY created_at) AS client_ids
  FROM normalized
  GROUP BY workspace_id, normalized_email
  HAVING COUNT(*) > 1
)
SELECT *
FROM duplicate_groups
ORDER BY workspace_id, duplicate_count DESC, normalized_email;
`;

type ClientRow = {
  id: string;
  workspace_id: string;
  name: string;
  email: string;
  created_at: string;
  archived_at: string | null;
};

function countByClientId(rows: Array<{ client_id: string | null }>): Map<string, number> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (!row.client_id) continue;
    counts.set(row.client_id, (counts.get(row.client_id) ?? 0) + 1);
  }
  return counts;
}

async function fetchCountMap(
  supabase: SupabaseClient,
  table: "invoices" | "payments" | "reminders",
  clientIds: string[],
  workspaceId: string
): Promise<Map<string, number>> {
  if (clientIds.length === 0) {
    return new Map();
  }

  const { data, error } = await supabase
    .from(table)
    .select("client_id")
    .eq("workspace_id", workspaceId)
    .in("client_id", clientIds);

  if (error) {
    throw new Error(`Failed to load ${table} counts: ${error.message}`);
  }

  return countByClientId((data ?? []) as Array<{ client_id: string | null }>);
}

async function fetchActivityCountMap(
  supabase: SupabaseClient,
  clientIds: string[],
  workspaceId: string
): Promise<Map<string, number>> {
  if (clientIds.length === 0) {
    return new Map();
  }

  const { data, error } = await supabase
    .from("activity_logs")
    .select("entity_id")
    .eq("workspace_id", workspaceId)
    .eq("entity_type", "client")
    .in("entity_id", clientIds);

  if (error) {
    throw new Error(`Failed to load activity_logs counts: ${error.message}`);
  }

  const counts = new Map<string, number>();
  for (const row of data ?? []) {
    const entityId = row.entity_id as string | null;
    if (!entityId) continue;
    counts.set(entityId, (counts.get(entityId) ?? 0) + 1);
  }
  return counts;
}

function pickPreferredKeepClient(
  clients: Array<{
    clientId: string;
    createdAt: string;
    invoiceCount: number;
    linkedRecordCount: number;
  }>
): string {
  const sorted = [...clients].sort((a, b) => {
    if (b.invoiceCount !== a.invoiceCount) {
      return b.invoiceCount - a.invoiceCount;
    }
    if (b.linkedRecordCount !== a.linkedRecordCount) {
      return b.linkedRecordCount - a.linkedRecordCount;
    }
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });

  return sorted[0]?.clientId ?? clients[0]?.clientId;
}

function classifyClientRow(input: {
  clientId: string;
  name: string;
  email: string;
  createdAt: string;
  archivedAt: string | null;
  invoiceCount: number;
  paymentCount: number;
  reminderCount: number;
  activityCount: number;
  preferredKeepId: string;
}): ClientDuplicateAuditRow {
  const linkedRecordCount =
    input.invoiceCount + input.paymentCount + input.reminderCount + input.activityCount;

  let classification: ClientDuplicateAuditRow["classification"];
  let recommendation: ClientRecommendation;

  if (linkedRecordCount > 0) {
    classification = "KEEP";
    recommendation = "keep";
  } else if (input.clientId === input.preferredKeepId) {
    classification = "PREFERRED_KEEP";
    recommendation = "keep";
  } else {
    classification = "SAFE_TO_DELETE";
    recommendation = "archive instead";
  }

  return {
    clientId: input.clientId,
    name: input.name,
    email: input.email,
    createdAt: input.createdAt,
    archivedAt: input.archivedAt,
    invoiceCount: input.invoiceCount,
    paymentCount: input.paymentCount,
    reminderCount: input.reminderCount,
    activityCount: input.activityCount,
    linkedRecordCount,
    classification,
    recommendation,
  };
}

export async function auditDuplicateClients(
  supabase: SupabaseClient,
  options?: { workspaceId?: string }
): Promise<DuplicateClientGroup[]> {
  let query = supabase
    .from("clients")
    .select("id, workspace_id, name, email, created_at, archived_at")
    .not("email", "is", null);

  if (options?.workspaceId) {
    query = query.eq("workspace_id", options.workspaceId);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Failed to load clients: ${error.message}`);
  }

  const grouped = new Map<string, ClientRow[]>();

  for (const client of (data ?? []) as ClientRow[]) {
    const normalizedEmail = normalizeClientEmail(client.email);
    if (!normalizedEmail) continue;

    const key = `${client.workspace_id}::${normalizedEmail}`;
    const bucket = grouped.get(key) ?? [];
    bucket.push(client);
    grouped.set(key, bucket);
  }

  const duplicateGroups: DuplicateClientGroup[] = [];

  for (const [key, clients] of grouped.entries()) {
    if (clients.length < 2) continue;

    const separatorIndex = key.indexOf("::");
    const workspaceId = key.slice(0, separatorIndex);
    const normalizedEmail = key.slice(separatorIndex + 2);
    const clientIds = clients.map((client) => client.id);

    const [invoiceCounts, paymentCounts, reminderCounts, activityCounts] = await Promise.all([
      fetchCountMap(supabase, "invoices", clientIds, workspaceId),
      fetchCountMap(supabase, "payments", clientIds, workspaceId),
      fetchCountMap(supabase, "reminders", clientIds, workspaceId),
      fetchActivityCountMap(supabase, clientIds, workspaceId),
    ]);

    const enriched = clients.map((client) => ({
      clientId: client.id,
      name: client.name,
      email: client.email,
      createdAt: client.created_at,
      archivedAt: client.archived_at,
      invoiceCount: invoiceCounts.get(client.id) ?? 0,
      paymentCount: paymentCounts.get(client.id) ?? 0,
      reminderCount: reminderCounts.get(client.id) ?? 0,
      activityCount: activityCounts.get(client.id) ?? 0,
      linkedRecordCount:
        (invoiceCounts.get(client.id) ?? 0) +
        (paymentCounts.get(client.id) ?? 0) +
        (reminderCounts.get(client.id) ?? 0) +
        (activityCounts.get(client.id) ?? 0),
    }));

    const preferredKeepId = pickPreferredKeepClient(enriched);

    duplicateGroups.push({
      workspaceId,
      normalizedEmail,
      duplicateCount: clients.length,
      clients: enriched
        .map((client) =>
          classifyClientRow({
            ...client,
            preferredKeepId,
          })
        )
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    });
  }

  duplicateGroups.sort((a, b) => {
    if (a.workspaceId !== b.workspaceId) {
      return a.workspaceId.localeCompare(b.workspaceId);
    }
    return b.duplicateCount - a.duplicateCount;
  });

  return duplicateGroups;
}

export function printDuplicateClientAudit(groups: DuplicateClientGroup[]): void {
  if (groups.length === 0) {
    console.log("No duplicate client email groups found.");
    return;
  }

  console.log(`Found ${groups.length} duplicate email group(s).\n`);

  for (const group of groups) {
    console.log("---");
    console.log(`workspace_id: ${group.workspaceId}`);
    console.log(`email: ${group.normalizedEmail}`);
    console.log(`duplicate count: ${group.duplicateCount}`);
    console.log(`client ids: ${group.clients.map((client) => client.clientId).join(", ")}`);

    for (const client of group.clients) {
      console.log(
        [
          `  - ${client.clientId}`,
          `name="${client.name}"`,
          `created_at=${client.createdAt}`,
          `archived_at=${client.archivedAt ?? "null"}`,
          `invoices=${client.invoiceCount}`,
          `payments=${client.paymentCount}`,
          `reminders=${client.reminderCount}`,
          `activity=${client.activityCount}`,
          `classification=${client.classification}`,
          `recommendation=${client.recommendation}`,
        ].join(" | ")
      );
    }

    console.log("");
  }
}

export function getCleanupCandidates(groups: DuplicateClientGroup[]): ClientDuplicateAuditRow[] {
  return groups
    .flatMap((group) => group.clients)
    .filter((client) => client.classification === "SAFE_TO_DELETE");
}
