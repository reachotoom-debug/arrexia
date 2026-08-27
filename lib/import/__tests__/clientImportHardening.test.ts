import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import "@/lib/test/nodeTestSetup";

import {
  MAX_CLIENT_IMPORT_ROWS,
  CLIENT_IMPORT_ROW_LIMIT_MESSAGE,
  buildWorkspaceClientIndexes,
  detectInFileClientDuplicates,
  normalizeClientImportEmail,
  normalizeClientImportPhone,
  parseClientImportPaymentTermsDays,
  parseClientImportStatus,
  resolveClientImportIdentity,
} from "../clientImportContract";

const MIGRATION_PATH =
  "supabase/migrations/20260812120000_harden_client_import_atomic.sql";
const PARITY_MIGRATION_PATH =
  "supabase/migrations/20260827120000_client_import_preview_classification_parity.sql";
const CLIENTS_ACTION_PATH =
  "app/[workspaceId]/settings/import/actions/clients.ts";
const VERIFICATION_SQL_PATH =
  "scripts/db/importClientsHardening.productionVerification.sql";

describe("client import contract", () => {
  it("1 — normalizes email case-insensitively", () => {
    assert.equal(normalizeClientImportEmail("Accounts@Acme.COM"), "accounts@acme.com");
  });

  it("2 — duplicate names allowed (different emails => insert)", () => {
    const indexes = buildWorkspaceClientIndexes([
      {
        id: "c1",
        email: "a@acme.com",
        whatsapp: null,
        whatsapp_phone: null,
        archived_at: null,
      },
    ]);
    const match = resolveClientImportIdentity({
      email: "b@acme.com",
      whatsapp: null,
      phone: null,
      indexes,
    });
    assert.equal(match.kind, "insert");
  });

  it("3 — update by email", () => {
    const indexes = buildWorkspaceClientIndexes([
      {
        id: "c1",
        email: "accounts@acme.com",
        whatsapp: null,
        whatsapp_phone: null,
        archived_at: null,
      },
    ]);
    const match = resolveClientImportIdentity({
      email: "accounts@acme.com",
      whatsapp: null,
      phone: null,
      indexes,
    });
    assert.deepEqual(match, { kind: "update", clientId: "c1" });
  });

  it("4 — update by WhatsApp (whatsapp_phone column)", () => {
    const indexes = buildWorkspaceClientIndexes([
      {
        id: "c2",
        email: null,
        whatsapp: null,
        whatsapp_phone: "+962781234567",
        archived_at: null,
      },
    ]);
    const match = resolveClientImportIdentity({
      email: null,
      whatsapp: "+962781234567",
      phone: null,
      indexes,
    });
    assert.deepEqual(match, { kind: "update", clientId: "c2" });
  });

  it("5 — update by legacy whatsapp column (manual UI phone field)", () => {
    const indexes = buildWorkspaceClientIndexes([
      {
        id: "c3",
        email: null,
        whatsapp: "+15551234567",
        whatsapp_phone: null,
        archived_at: null,
      },
    ]);
    const match = resolveClientImportIdentity({
      email: null,
      whatsapp: null,
      phone: "+15551234567",
      indexes,
    });
    assert.deepEqual(match, { kind: "update", clientId: "c3" });
  });

  it("6 — duplicate email in CSV rejected", () => {
    const errors = detectInFileClientDuplicates([
      { lineNumber: 2, email: "dup@test.com", whatsapp: null, phone: null },
      { lineNumber: 5, email: "dup@test.com", whatsapp: null, phone: null },
    ]);
    assert.ok(errors.has(2));
    assert.ok(errors.has(5));
  });

  it("7 — duplicate WhatsApp in CSV rejected", () => {
    const errors = detectInFileClientDuplicates([
      { lineNumber: 3, email: null, whatsapp: "+962780000001", phone: null },
      { lineNumber: 4, email: null, whatsapp: "+962780000001", phone: null },
    ]);
    assert.ok(errors.has(3));
    assert.ok(errors.has(4));
  });

  it("8 — email and WhatsApp resolving to different clients rejected", () => {
    const indexes = buildWorkspaceClientIndexes([
      {
        id: "email-client",
        email: "a@acme.com",
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
      email: "a@acme.com",
      whatsapp: "+962781111111",
      phone: null,
      indexes,
    });
    assert.equal(match.kind, "fail");
    if (match.kind === "fail") {
      assert.match(match.reason, /different existing clients/i);
    }
  });

  it("9 — payment terms parsing supports Net 30", () => {
    assert.equal(parseClientImportPaymentTermsDays("Net 30"), 30);
  });

  it("10 — status parsing supports Active/Inactive/Archived", () => {
    assert.equal(parseClientImportStatus("Active"), "active");
    assert.equal(parseClientImportStatus("Inactive"), "inactive");
    assert.equal(parseClientImportStatus("Archived"), "archived");
  });

  it("11 — archived email identity rejected", () => {
    const indexes = buildWorkspaceClientIndexes([
      {
        id: "archived-client",
        email: "old@acme.com",
        whatsapp: null,
        whatsapp_phone: null,
        archived_at: "2024-01-01T00:00:00Z",
      },
    ]);
    const match = resolveClientImportIdentity({
      email: "old@acme.com",
      whatsapp: null,
      phone: null,
      indexes,
    });
    assert.equal(match.kind, "fail");
    if (match.kind === "fail") {
      assert.match(match.reason, /archived/i);
    }
  });

  it("12 — phone normalization preserves leading plus", () => {
    assert.equal(normalizeClientImportPhone("+962779610078"), "+962779610078");
  });

  it("24 — 501 row limit constant", () => {
    assert.equal(MAX_CLIENT_IMPORT_ROWS, 500);
    assert.match(CLIENT_IMPORT_ROW_LIMIT_MESSAGE, /500 clients/);
  });
});

describe("client import migration hardening", () => {
  const migration = readFileSync(MIGRATION_PATH, "utf8");

  it("13 — persists country, phone, whatsapp_phone, payment terms", () => {
    assert.match(migration, /country = CASE WHEN v_country IS NOT NULL/);
    assert.match(migration, /whatsapp = CASE WHEN v_phone IS NOT NULL/);
    assert.match(migration, /whatsapp_phone = CASE/);
    assert.match(migration, /internal_parse_client_import_payment_terms_days/);
    assert.match(migration, /payment_terms_days = CASE/);
  });

  it("14 — returns client_id not entity_id", () => {
    assert.match(migration, /'client_id', v_client_id/);
    assert.doesNotMatch(migration, /'entity_id'/);
  });

  it("15 — atomic execute raises on failure", () => {
    assert.match(migration, /RAISE EXCEPTION 'client_import_failed'/);
    assert.doesNotMatch(
      migration.slice(migration.indexOf("-- Execute all rows")),
      /EXCEPTION WHEN OTHERS THEN[\s\S]*CONTINUE/
    );
  });

  it("16 — dry_run performs zero writes", () => {
    assert.match(migration, /IF COALESCE\(p_dry_run, false\) THEN/);
    assert.match(migration, /RETURN v_results;/);
  });

  it("17 — wrapper counts insert actions for entitlement", () => {
    assert.match(
      migration,
      /LOWER\(COALESCE\(elem->>'action', 'insert'\)\) = 'insert'/
    );
    assert.match(migration, /internal_import_entitlement_preflight\(p_workspace_id, v_new_clients, 0\)/);
  });

  it("18 — service_role grants only", () => {
    assert.match(migration, /REVOKE EXECUTE ON FUNCTION public\.rpc_import_clients\(uuid, jsonb\) FROM authenticated/);
    assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.rpc_import_clients\(uuid, jsonb\) TO service_role/);
  });

  it("19 — rejects archived matches explicitly", () => {
    assert.match(migration, /Client is archived \(email:/);
    assert.match(migration, /Client is archived \(WhatsApp:/);
  });

  it("20 — in-file duplicate email detection in RPC validation", () => {
    assert.match(migration, /Duplicate email/);
    assert.match(migration, /Duplicate WhatsApp/);
  });
});

describe("client import actions wiring", () => {
  const actions = readFileSync(CLIENTS_ACTION_PATH, "utf8");

  it("21 — enforces 500 row limit in preview", () => {
    assert.match(actions, /MAX_CLIENT_IMPORT_ROWS|MAX_CLIENT_ROWS/);
    assert.match(actions, /CLIENT_IMPORT_ROW_LIMIT_MESSAGE/);
  });

  it("22 — preview classifies via RPC dry-run (no TS workspace index lookup)", () => {
    assert.match(actions, /classifyClientImportRowsViaRpc/);
    assert.match(actions, /internal_rpc_import_clients/);
    assert.match(actions, /p_dry_run:\s*true/);
    assert.doesNotMatch(actions, /buildWorkspaceClientIndexes/);
    assert.doesNotMatch(actions, /resolveClientImportIdentity/);
    assert.doesNotMatch(actions, /allClientsWithEmail/);
  });

  it("23 — maps RPC client_id with entity_id fallback", () => {
    assert.match(actions, /result\.client_id/);
    assert.match(actions, /result\.entity_id/);
  });

  it("24 — assertImportEntitlement uses insert count only", () => {
    const executeBlock = actions.slice(actions.indexOf("export async function executeClientsImport"));
    assert.match(executeBlock, /assertImportEntitlement\(workspaceId,\s*\{[\s\S]*newClients/);
    assert.match(executeBlock, /newInvoices:\s*0/);
    assert.match(executeBlock, /row\.action === "insert"/);
  });

  it("25 — revalidate only after successful execute", () => {
    const executeBlock = actions.slice(actions.indexOf("export async function executeClientsImport"));
    assert.match(executeBlock, /if \(ok\) \{[\s\S]*revalidatePath/);
  });
});

describe("client import parity migration", () => {
  const parityMigration = readFileSync(PARITY_MIGRATION_PATH, "utf8");

  it("30 — parity migration file exists with authoritative classifier", () => {
    assert.match(parityMigration, /internal_resolve_client_import_identity/);
    assert.match(parityMigration, /internal_canonical_client_import_email/);
    assert.match(parityMigration, /internal_canonical_client_import_phone/);
  });

  it("31 — dry_run returns computed INSERT/UPDATE/FAIL actions", () => {
    assert.match(parityMigration, /IF COALESCE\(p_dry_run, false\) THEN/);
    assert.match(parityMigration, /v_resolved := public\.internal_resolve_client_import_identity/);
    assert.match(parityMigration, /'action', v_resolved_action/);
    assert.match(parityMigration, /RETURN v_results;/);
  });

  it("32 — canonical email and phone helpers use hardened search_path", () => {
    assert.match(
      parityMigration,
      /CREATE OR REPLACE FUNCTION public\.internal_canonical_client_import_email[\s\S]*SET search_path = pg_catalog, public/
    );
    assert.match(
      parityMigration,
      /CREATE OR REPLACE FUNCTION public\.internal_canonical_client_import_phone[\s\S]*SET search_path = pg_catalog, public/
    );
  });

  it("33 — internal helpers revoked from anon/authenticated; service_role granted", () => {
    assert.match(
      parityMigration,
      /REVOKE EXECUTE ON FUNCTION public\.internal_resolve_client_import_identity\(uuid, text, text, text\) FROM authenticated/
    );
    assert.match(
      parityMigration,
      /GRANT EXECUTE ON FUNCTION public\.internal_resolve_client_import_identity\(uuid, text, text, text\) TO service_role/
    );
    assert.match(
      parityMigration,
      /REVOKE EXECUTE ON FUNCTION public\.internal_canonical_client_import_email\(text\) FROM anon/
    );
    assert.match(
      parityMigration,
      /GRANT EXECUTE ON FUNCTION public\.internal_canonical_client_import_phone\(text\) TO service_role/
    );
  });

  it("34 — workspace scoping on identity resolution", () => {
    const resolver = parityMigration.slice(
      parityMigration.indexOf("CREATE OR REPLACE FUNCTION public.internal_resolve_client_import_identity"),
      parityMigration.indexOf("$resolve$;")
    );
    assert.match(resolver, /c\.workspace_id = p_workspace_id/g);
  });

  it("35 — archived clients rejected; conflicting identities fail", () => {
    assert.match(parityMigration, /Client is archived \(email:/);
    assert.match(parityMigration, /Client is archived \(WhatsApp:/);
    assert.match(
      parityMigration,
      /Email and WhatsApp resolve to different existing clients; use a single identity key/
    );
  });

  it("36 — execute re-resolves identity and preserves duplicate INSERT defense", () => {
    const executeBlock = parityMigration.slice(
      parityMigration.indexOf("-- Execute all rows (any failure rolls back entire transaction)")
    );
    assert.match(executeBlock, /internal_resolve_client_import_identity/);
    assert.match(parityMigration, /Insert requested but matching client already exists/);
    assert.match(executeBlock, /RAISE EXCEPTION 'client_import_failed'/);
  });

  it("37 — canonical phone returns NULL for blank input (no shared empty identity)", () => {
    assert.match(parityMigration, /IF p_raw IS NULL THEN[\s\S]*RETURN NULL/);
    assert.match(parityMigration, /IF v_trimmed = '' THEN[\s\S]*RETURN NULL/);
    assert.match(parityMigration, /IF v_digits IS NULL THEN[\s\S]*RETURN NULL/);
    assert.match(
      parityMigration,
      /p_canonical IS NOT NULL[\s\S]*AND p_canonical <> ''/
    );
  });

  it("38 — no name/company-based dedupe; unique constraints untouched", () => {
    const resolver = parityMigration.slice(
      parityMigration.indexOf("CREATE OR REPLACE FUNCTION public.internal_resolve_client_import_identity"),
      parityMigration.indexOf("$resolve$;")
    );
    assert.doesNotMatch(resolver, /\bc\.name\b/);
    assert.doesNotMatch(resolver, /\bc\.company\b/);
    assert.doesNotMatch(parityMigration, /ALTER TABLE public\.clients/);
    assert.doesNotMatch(parityMigration, /CREATE UNIQUE INDEX/);
  });
});

describe("client import live verification script", () => {
  it("26 — verification script exists with rollback marker", () => {
    const sql = readFileSync(VERIFICATION_SQL_PATH, "utf8");
    assert.match(sql, /\\set ON_ERROR_STOP on/);
    assert.match(sql, /^BEGIN;/m);
    assert.match(sql, /^ROLLBACK;/m);
    assert.doesNotMatch(sql, /^COMMIT;/m);
    assert.match(sql, /ARREXIA_CLIENT_IMPORT_VERIFICATION_PASS/);
    assert.match(sql, /__ARREXIA_CLIENT_IMPORT_VERIFY__/);
    assert.match(sql, /You do NOT need to deploy the migration first/);
    assert.match(sql, /VERIFY_FAILED TEST_A:/);
  });

  it("27 — entitlement fixtures precede client inserts", () => {
    const sql = readFileSync(VERIFICATION_SQL_PATH, "utf8");
    const fixtureBlock = sql.slice(
      sql.indexOf("INSERT INTO public.workspaces"),
      sql.indexOf("-- TEST_A")
    );
    assert.match(fixtureBlock, /workspace_plans/);
    assert.match(fixtureBlock, /workspace_subscriptions/);
    assert.match(fixtureBlock, /internal_import_entitlement_state\(v_ws_a\)/);
    assert.doesNotMatch(fixtureBlock, /internal_rpc_import_clients/);
  });

  it("28 — live gate covers entitlement and retry scenarios", () => {
    const sql = readFileSync(VERIFICATION_SQL_PATH, "utf8");
    assert.match(sql, /TEST_L_RETRY_AFTER_FAILURE/);
    assert.match(sql, /TEST_O_UPDATES_ZERO_ENTITLEMENT/);
    assert.match(sql, /TEST_P_ENTITLEMENT_BLOCK_TWO_CREATES/);
    assert.match(sql, /TEST_Q_ENTITLEMENT_ALLOW_ONE_CREATE/);
    assert.match(sql, /TEST_K_RUNTIME_ATOMICITY/);
    assert.match(sql, /rpc_import_clients\(v_ws_ent/);
  });

  it("29 — TEST_A reloads inserted client by client_id with canonical email", () => {
    const sql = readFileSync(VERIFICATION_SQL_PATH, "utf8");
    assert.match(sql, /client_id missing from RPC response/);
    assert.match(sql, /WHERE c\.id = v_client_id/);
    assert.match(sql, /lower\(trim\(v_actual\.email\)\) IS DISTINCT FROM v_email/);
    assert.match(sql, /v_email text := lower\(trim\(v_prefix/);
  });
});
