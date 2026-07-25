import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

describe("Launch blocker regression contracts", () => {
  it("P0 — Next.js proxy wires Supabase session refresh", () => {
    const src = readFileSync("proxy.ts", "utf8");
    assert.match(src, /updateSession/);
    assert.match(src, /export async function proxy/);
  });

  it("P0 — cron reminder runner uses service-role client", () => {
    const src = readFileSync("lib/reminders/run-reminders.ts", "utf8");
    assert.match(src, /supabaseAdmin\(\)/);
    assert.doesNotMatch(src, /runDueRemindersForAllWorkspaces[\s\S]*supabaseServer\(\)/);
  });

  it("P0 — import RPCs restricted to service role and app uses supabaseAdmin", () => {
    const migration = readFileSync(
      "supabase/migrations/20260725100000_restrict_import_rpcs_to_service_role.sql",
      "utf8"
    );
    assert.match(migration, /to_regprocedure\('public\.import_invoices_grouped\(json,uuid,boolean\)'\)/);
    assert.match(migration, /to_regprocedure\('public\.rpc_import_payments\(boolean,json,uuid\)'\)/);
    assert.match(migration, /DO \$\$/);
    assert.doesNotMatch(migration, /^REVOKE EXECUTE ON FUNCTION public\.import_invoices_grouped\(uuid, jsonb\)/im);

    for (const file of [
      "app/[workspaceId]/settings/import/actions/clients.ts",
      "app/[workspaceId]/settings/import/actions/payments.ts",
      "app/[workspaceId]/settings/import/actions/invoices.ts",
    ]) {
      assert.match(readFileSync(file, "utf8"), /supabaseAdmin\(\)\.rpc/);
    }
  });

  it("P1 — manual reminder send paths require workspace membership", () => {
    assert.match(
      readFileSync("app/[workspaceId]/reminders/actions.ts", "utf8"),
      /requireWorkspace\(workspaceId\)/
    );
    assert.match(
      readFileSync("app/api/reminders/send/route.ts", "utf8"),
      /requireWorkspaceForApi\(workspaceId\)/
    );
  });

  it("P1 — invoice PDF route validates workspace membership and scopes invoice query", () => {
    const src = readFileSync("app/[workspaceId]/invoices/[invoiceId]/pdf/route.ts", "utf8");
    assert.match(src, /requireWorkspaceForApi\(workspaceId\)/);
    assert.match(src, /\.eq\("workspace_id", workspaceId\)/);
  });

  it("P1 — duplicate guard fails closed when history load errors", () => {
    const src = readFileSync("lib/reminders/ruleOccurrenceGuard.ts", "utf8");
    assert.match(src, /throw new Error\("Failed to load reminder history/);
    assert.doesNotMatch(src, /history load error[\s\S]*return \[\]/);
  });

  it("P1 — Resend readiness validated before automatic reminders", () => {
    const src = readFileSync("lib/reminders/emailReadinessGate.ts", "utf8");
    assert.match(src, /isResendConfigured/);
    assert.match(src, /resend_not_configured/);
  });

  it("P1 — logout writes auth cookie changes to response", () => {
    const src = readFileSync("app/logout/route.ts", "utf8");
    assert.match(src, /supabaseRouteHandler\(response\)/);
  });
});
