#!/usr/bin/env ts-node
/**
 * Archive duplicate clients that are SAFE_TO_DELETE (zero linked records).
 *
 * Usage (dry run — default):
 *   npx ts-node scripts/cleanup-duplicate-clients.ts --workspace-id=<uuid>
 *
 * Execute archives:
 *   npx ts-node scripts/cleanup-duplicate-clients.ts --workspace-id=<uuid> --confirm
 *
 * Optional hard delete (only zero-link SAFE_TO_DELETE clients):
 *   npx ts-node scripts/cleanup-duplicate-clients.ts --workspace-id=<uuid> --confirm --hard-delete
 *
 * Requires:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { supabaseAdmin } from "../lib/supabase/admin";
import {
  auditDuplicateClients,
  getCleanupCandidates,
  printDuplicateClientAudit,
} from "../lib/clients/duplicate-audit";

function loadEnvLocal(): void {
  const envPath = resolve(process.cwd(), ".env.local");
  if (!existsSync(envPath)) {
    return;
  }

  const content = readFileSync(envPath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator === -1) continue;
    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function parseArgs(argv: string[]) {
  let workspaceId: string | undefined;
  let confirm = false;
  let hardDelete = false;

  for (const arg of argv) {
    if (arg.startsWith("--workspace-id=")) {
      workspaceId = arg.slice("--workspace-id=".length).trim() || undefined;
    } else if (arg === "--confirm") {
      confirm = true;
    } else if (arg === "--hard-delete") {
      hardDelete = true;
    }
  }

  return { workspaceId, confirm, hardDelete };
}

async function main() {
  loadEnvLocal();

  const { workspaceId, confirm, hardDelete } = parseArgs(process.argv.slice(2));

  if (!workspaceId) {
    console.error("Missing required flag: --workspace-id=<uuid>");
    process.exit(1);
  }

  console.log(`Workspace: ${workspaceId}`);
  console.log(`Mode: ${confirm ? (hardDelete ? "HARD DELETE" : "ARCHIVE") : "DRY RUN"}\n`);

  const supabase = supabaseAdmin();
  const groups = await auditDuplicateClients(supabase, { workspaceId });

  if (groups.length === 0) {
    console.log("No duplicate client email groups found for this workspace.");
    return;
  }

  printDuplicateClientAudit(groups);

  const candidates = getCleanupCandidates(groups).filter(
    (client) => !client.archivedAt
  );

  if (candidates.length === 0) {
    console.log("No unarchived SAFE_TO_DELETE duplicate clients to clean up.");
    return;
  }

  console.log(`Cleanup candidates (${candidates.length}):`);
  for (const client of candidates) {
    console.log(
      `  ${client.clientId} | ${client.email} | ${client.name} | recommendation=${client.recommendation}`
    );
  }

  if (!confirm) {
    console.log("\nDry run only. Re-run with --confirm to apply changes.");
    return;
  }

  const now = new Date().toISOString();

  for (const client of candidates) {
    if (hardDelete) {
      console.log(`[action] HARD DELETE client ${client.clientId} (${client.email})`);
      const { error } = await supabase
        .from("clients")
        .delete()
        .eq("id", client.clientId)
        .eq("workspace_id", workspaceId);

      if (error) {
        console.error(`[error] failed to delete ${client.clientId}: ${error.message}`);
        continue;
      }
      console.log(`[done] deleted ${client.clientId}`);
      continue;
    }

    console.log(`[action] ARCHIVE client ${client.clientId} (${client.email})`);
    const { error } = await supabase
      .from("clients")
      .update({ archived_at: now })
      .eq("id", client.clientId)
      .eq("workspace_id", workspaceId);

    if (error) {
      console.error(`[error] failed to archive ${client.clientId}: ${error.message}`);
      continue;
    }

    console.log(`[done] archived ${client.clientId}`);
  }

  console.log("\nCleanup complete.");
}

main().catch((error) => {
  console.error("[cleanup-duplicate-clients] fatal:", error);
  process.exit(1);
});
