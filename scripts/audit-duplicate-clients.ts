#!/usr/bin/env ts-node
/**
 * Read-only audit for duplicate client emails within a workspace.
 *
 * Usage:
 *   npx ts-node scripts/audit-duplicate-clients.ts
 *   npx ts-node scripts/audit-duplicate-clients.ts --workspace-id=<uuid>
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
  DUPLICATE_CLIENTS_AUDIT_SQL,
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

function parseWorkspaceId(argv: string[]): string | undefined {
  for (const arg of argv) {
    if (arg.startsWith("--workspace-id=")) {
      return arg.slice("--workspace-id=".length).trim() || undefined;
    }
  }
  return undefined;
}

async function main() {
  loadEnvLocal();

  const workspaceId = parseWorkspaceId(process.argv.slice(2));
  if (workspaceId) {
    console.log(`Auditing duplicate client emails for workspace: ${workspaceId}\n`);
  } else {
    console.log("Auditing duplicate client emails for all workspaces\n");
  }

  console.log("Reference SQL:\n");
  console.log(DUPLICATE_CLIENTS_AUDIT_SQL.trim());
  console.log("\nResults:\n");

  const supabase = supabaseAdmin();
  const groups = await auditDuplicateClients(supabase, { workspaceId });
  printDuplicateClientAudit(groups);

  const safeToArchive = groups
    .flatMap((group) => group.clients)
    .filter((client) => client.recommendation === "archive instead");

  console.log("Summary:");
  console.log(`  duplicate groups: ${groups.length}`);
  console.log(`  clients recommended to keep: ${groups.flatMap((g) => g.clients).filter((c) => c.recommendation === "keep").length}`);
  console.log(`  clients safe to archive: ${safeToArchive.length}`);
  console.log(`  clients marked safe to delete (zero links, not preferred keep): ${safeToArchive.length}`);

  if (safeToArchive.length > 0) {
    console.log("\nNo destructive action was taken.");
    console.log(
      "To archive SAFE_TO_DELETE duplicates in one workspace, run:\n" +
        "  npx ts-node scripts/cleanup-duplicate-clients.ts --workspace-id=<uuid> --confirm"
    );
  }
}

main().catch((error) => {
  console.error("[audit-duplicate-clients] fatal:", error);
  process.exit(1);
});
