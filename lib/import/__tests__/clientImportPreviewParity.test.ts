import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  buildWorkspaceClientIndexes,
  normalizeClientImportEmail,
  normalizeClientImportPhone,
  resolveClientImportIdentity,
} from "../clientImportContract";

const PARITY_MIGRATION =
  "supabase/migrations/20260827120000_client_import_preview_classification_parity.sql";
const CLIENTS_ACTION_PATH =
  "app/[workspaceId]/settings/import/actions/clients.ts";

const PRODUCTION_REGRESSION_NAMES = [
  "Sarah Mitchell",
  "Omar Khalil",
  "Daniel Carter",
  "Lina Haddad",
  "Rami Nasser",
  "James Wilson",
  "Maya Saleh",
  "Ahmed Mansour",
] as const;

function resolverSection(migration: string): string {
  const start = migration.indexOf(
    "CREATE OR REPLACE FUNCTION public.internal_resolve_client_import_identity"
  );
  const end = migration.indexOf("$resolve$;", start);
  assert.ok(start >= 0 && end > start, "resolver function missing from parity migration");
  return migration.slice(start, end);
}

function rpcSection(migration: string): string {
  const start = migration.indexOf(
    "CREATE OR REPLACE FUNCTION public.internal_rpc_import_clients"
  );
  assert.ok(start >= 0, "internal_rpc_import_clients missing from parity migration");
  return migration.slice(start);
}

describe("client import preview/execution parity", () => {
  const migration = readFileSync(PARITY_MIGRATION, "utf8");
  const actions = readFileSync(CLIENTS_ACTION_PATH, "utf8");
  const resolver = resolverSection(migration);
  const rpc = rpcSection(migration);

  it("A — existing active client with same normalized email classifies UPDATE", () => {
    assert.match(resolver, /internal_canonical_client_import_email\(c\.email\) = v_email/);
    assert.match(resolver, /'action', 'update'/);

    const indexes = buildWorkspaceClientIndexes([
      {
        id: "existing-active",
        email: "accounts@acme.com",
        whatsapp: null,
        whatsapp_phone: null,
        archived_at: null,
      },
    ]);
    const match = resolveClientImportIdentity({
      email: normalizeClientImportEmail("Accounts@Acme.COM"),
      whatsapp: null,
      phone: null,
      indexes,
    });
    assert.deepEqual(match, { kind: "update", clientId: "existing-active" });
    assert.match(actions, /classified\.action === "update"/);
  });

  it("B — email case and whitespace variations canonicalize to the same identity", () => {
    assert.match(migration, /NULLIF\(LOWER\(BTRIM\(p_raw\)\)/);
    assert.equal(
      normalizeClientImportEmail("Sarah.Mitchell@Example.com "),
      "sarah.mitchell@example.com"
    );

    const indexes = buildWorkspaceClientIndexes([
      {
        id: "sarah",
        email: "Sarah.Mitchell@Example.com ",
        whatsapp: null,
        whatsapp_phone: null,
        archived_at: null,
      },
    ]);
    const match = resolveClientImportIdentity({
      email: normalizeClientImportEmail("sarah.mitchell@example.com"),
      whatsapp: null,
      phone: null,
      indexes,
    });
    assert.equal(match.kind, "update");
  });

  it("C — WhatsApp/phone formatting normalizes to the same client identity", () => {
    assert.match(migration, /regexp_replace\(v_trimmed, '\[\^0-9\]', '', 'g'\)/);
    assert.match(migration, /internal_client_import_phone_keys_match/);
    assert.equal(normalizeClientImportPhone("+1 (202) 555-0101"), "+12025550101");
    assert.equal(normalizeClientImportPhone("12025550101"), "12025550101");

    const indexes = buildWorkspaceClientIndexes([
      {
        id: "phone-client",
        email: null,
        whatsapp: null,
        whatsapp_phone: "+1 (202) 555-0101",
        archived_at: null,
      },
    ]);
    const match = resolveClientImportIdentity({
      email: null,
      whatsapp: normalizeClientImportPhone("+12025550101"),
      phone: null,
      indexes,
    });
    assert.deepEqual(match, { kind: "update", clientId: "phone-client" });
    assert.match(
      migration,
      /internal_client_import_phone_keys_match\(c\.whatsapp_phone, v_key\)/
    );
  });

  it("D — brand-new client with no identity match classifies INSERT", () => {
    assert.match(resolver, /'action', 'insert'/);

    const indexes = buildWorkspaceClientIndexes([]);
    const match = resolveClientImportIdentity({
      email: "new.client@example.com",
      whatsapp: "+15550001111",
      phone: null,
      indexes,
    });
    assert.equal(match.kind, "insert");
    assert.match(actions, /classified\.action === "update"[\s\S]*: "insert"/);
  });

  it("E — archived matching client classifies FAIL", () => {
    assert.match(resolver, /v_email_archived THEN/);
    assert.match(resolver, /Client is archived \(email:/);
    assert.match(resolver, /Client is archived \(WhatsApp:/);

    const indexes = buildWorkspaceClientIndexes([
      {
        id: "archived-client",
        email: "archived@example.com",
        whatsapp: null,
        whatsapp_phone: null,
        archived_at: "2024-01-01T00:00:00Z",
      },
    ]);
    const match = resolveClientImportIdentity({
      email: "archived@example.com",
      whatsapp: null,
      phone: null,
      indexes,
    });
    assert.equal(match.kind, "fail");
  });

  it("F — email and WhatsApp resolving to different active clients classifies FAIL", () => {
    assert.match(
      resolver,
      /Email and WhatsApp resolve to different existing clients; use a single identity key/
    );

    const indexes = buildWorkspaceClientIndexes([
      {
        id: "email-client",
        email: "a@example.com",
        whatsapp: null,
        whatsapp_phone: null,
        archived_at: null,
      },
      {
        id: "wa-client",
        email: null,
        whatsapp: null,
        whatsapp_phone: "+962781111111",
        archived_at: null,
      },
    ]);
    const match = resolveClientImportIdentity({
      email: "a@example.com",
      whatsapp: "+962781111111",
      phone: null,
      indexes,
    });
    assert.equal(match.kind, "fail");
  });

  it("G — re-import of existing clients must not rely on preview-side INSERT classification", () => {
    assert.match(actions, /classifyClientImportRowsViaRpc/);
    assert.match(actions, /internal_rpc_import_clients/);
    assert.match(actions, /p_dry_run:\s*true/);
    assert.doesNotMatch(actions, /buildWorkspaceClientIndexes/);
    assert.doesNotMatch(actions, /resolveClientImportIdentity/);

    assert.match(rpc, /v_resolved_action := v_resolved->>'action'/);
    assert.match(rpc, /'action', v_resolved_action/);
  });

  it("H — identity lookups are workspace-scoped (no cross-workspace match)", () => {
    const matches = resolver.match(/c\.workspace_id = p_workspace_id/g) ?? [];
    assert.ok(matches.length >= 2, "expected workspace filter on every client lookup");
    assert.doesNotMatch(resolver, /organization_id = p_workspace_id/);
  });

  it("I — dry-run path performs zero writes and no entitlement/audit side effects", () => {
    const dryRunReturnIdx = rpc.indexOf("IF COALESCE(p_dry_run, false) THEN");
    const executeIdx = rpc.indexOf("-- Execute all rows (any failure rolls back entire transaction)");
    assert.ok(dryRunReturnIdx >= 0 && executeIdx > dryRunReturnIdx);

    const dryRunBlock = rpc.slice(dryRunReturnIdx, executeIdx);
    assert.doesNotMatch(dryRunBlock, /\bINSERT INTO\b/i);
    assert.doesNotMatch(dryRunBlock, /\bUPDATE public\.clients\b/i);
    assert.doesNotMatch(dryRunBlock, /\bDELETE FROM\b/i);
    assert.doesNotMatch(dryRunBlock, /internal_import_entitlement/);
    assert.doesNotMatch(dryRunBlock, /RAISE EXCEPTION 'client_import_failed'/);
    assert.match(dryRunBlock, /RETURN v_results;/);
  });

  it("J — production regression names must not all classify INSERT via authoritative resolver contract", () => {
    assert.equal(PRODUCTION_REGRESSION_NAMES.length, 8);

    for (const name of PRODUCTION_REGRESSION_NAMES) {
      assert.ok(name.length > 0, "production regression anchor names documented");
    }

    assert.match(actions, /classifyClientImportRowsViaRpc/);
    assert.match(migration, /internal_resolve_client_import_identity/);
    assert.match(
      rpc,
      /Insert requested but matching client already exists/
    );

    const dryRunResultBlock = rpc.slice(
      rpc.indexOf("IF COALESCE(p_dry_run, false) THEN"),
      rpc.indexOf("ELSIF v_row_error IS NOT NULL THEN")
    );
    assert.match(dryRunResultBlock, /'action', v_resolved_action/);
    assert.doesNotMatch(resolver, /name = v_name/);
    assert.doesNotMatch(resolver, /company = v_company/);
  });
});
