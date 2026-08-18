import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const MIGRATION_PATH =
  "supabase/migrations/20260810120000_fix_import_invoices_grouped_integrity.sql";
const INTEGRATION_SQL_PATH =
  "scripts/db/importInvoicesGroupedIntegrity.integration.sql";
const PRODUCTION_VERIFICATION_SQL_PATH =
  "scripts/db/importInvoicesGroupedIntegrity.productionVerification.sql";
const INVOICES_ACTION_PATH =
  "app/[workspaceId]/settings/import/actions/invoices.ts";
const RESTRICT_MIGRATION_PATH =
  "supabase/migrations/20260725100000_restrict_import_rpcs_to_service_role.sql";

function readExecuteBlock(): string {
  const src = readFileSync(INVOICES_ACTION_PATH, "utf8");
  return src.slice(src.indexOf("export async function executeInvoicesImport"));
}

describe("import invoices grouped integrity migration", () => {
  const migration = readFileSync(MIGRATION_PATH, "utf8");

  it("deletes invoice_items once per invoice before inserting all items", () => {
    const itemSection = migration.slice(
      migration.indexOf("-- Replace items once per invoice"),
      migration.indexOf("-- Recompute totals from ALL persisted items")
    );
    assert.match(itemSection, /FOR v_inv, v_invoice_id IN SELECT key, value FROM jsonb_each_text\(v_invoice_ids\)/);
    assert.match(itemSection, /DELETE FROM public\.invoice_items WHERE invoice_id = \(v_invoice_id::uuid\);/);
    assert.match(
      itemSection,
      /FOR v_row IN[\s\S]*FROM jsonb_array_elements\(p_rows\) AS elem[\s\S]*INSERT INTO public\.invoice_items/
    );
    assert.doesNotMatch(itemSection, /DELETE FROM public\.invoice_items[\s\S]*INSERT INTO public\.invoice_items[\s\S]*DELETE FROM public\.invoice_items/);
  });

  it("raises on execute-time errors instead of returning partial success", () => {
    assert.match(
      migration,
      /IF jsonb_array_length\(v_errors\) > 0 THEN[\s\S]*RAISE EXCEPTION 'invoice_import_failed'/
    );
    assert.doesNotMatch(
      migration.slice(migration.indexOf("-- Execute: invoice headers first")),
      /RETURN jsonb_build_object\([\s\S]*'ok', false[\s\S]*'created', jsonb_build_object\('clients', v_created_clients/
    );
  });

  it("preserves dry-run structured validation without writes", () => {
    assert.match(migration, /IF p_dry_run THEN[\s\S]*RETURN jsonb_build_object\([\s\S]*'ok', true/);
    assert.match(
      migration,
      /IF jsonb_array_length\(v_errors\) > 0 THEN[\s\S]*RETURN jsonb_build_object\([\s\S]*'ok', false/
    );
  });

  it("counts net-new invoices in wrapper entitlement preflight", () => {
    const wrapper = migration.slice(
      migration.indexOf("CREATE OR REPLACE FUNCTION public.import_invoices_grouped("),
      migration.lastIndexOf("COMMENT ON FUNCTION public.import_invoices_grouped")
    );
    assert.match(wrapper, /AND NOT EXISTS \(/);
    assert.match(wrapper, /i\.archived_at IS NULL/);
    assert.match(wrapper, /internal_import_entitlement_preflight\(p_workspace_id, 0, v_new_invoices\)/);
    assert.doesNotMatch(
      wrapper,
      /WHERE LOWER\(COALESCE\(elem->>'row_type', ''\)\) = 'invoice';/
    );
  });

  it("uses explicit UPDATE for existing invoices and INSERT for net-new headers", () => {
    const headerSection = migration.slice(
      migration.indexOf("-- Execute: invoice headers first"),
      migration.indexOf("-- Validate item rows reference known invoice headers")
    );
    assert.match(headerSection, /v_existing_invoice_id := NULL/);
    assert.match(headerSection, /AND archived_at IS NULL[\s\S]*LIMIT 1;/);
    assert.match(
      headerSection,
      /IF v_existing_invoice_id IS NOT NULL THEN[\s\S]*UPDATE public\.invoices[\s\S]*WHERE id = v_existing_invoice_id[\s\S]*AND workspace_id = p_workspace_id/
    );
    assert.match(
      headerSection,
      /ELSE[\s\S]*Invoice is archived:[\s\S]*INSERT INTO public\.invoices \([\s\S]*RETURNING id INTO v_invoice_id;[\s\S]*v_created_invoices := v_created_invoices \+ 1/
    );
    assert.doesNotMatch(headerSection, /ON CONFLICT \(workspace_id, invoice_number\)/);
  });

  it("writes only stored invoice columns and recomputes amount from line items", () => {
    const headerSection = migration.slice(
      migration.indexOf("-- Execute: invoice headers first"),
      migration.indexOf("-- Validate item rows reference known invoice headers")
    );
    const insertBranchStart = headerSection.indexOf("INSERT INTO public.invoices (");
    const insertSection = headerSection.slice(insertBranchStart);
    const itemInsertSection = migration.slice(
      migration.indexOf("-- Replace items once per invoice"),
      migration.indexOf("-- Recompute invoice.amount from persisted line items")
    );
    assert.match(insertSection, /\bamount\b/);
    assert.doesNotMatch(insertSection, /\boutstanding_amount\b/);
    assert.doesNotMatch(insertSection, /\bpayment_state\b/);
    assert.doesNotMatch(insertSection, /\btotal_paid\b/);

    assert.match(migration, /SUM\(quantity \* unit_price\)/);
    assert.match(migration, /SET amount = v_subtotal/);
    assert.match(itemInsertSection, /name, description, quantity, unit_price, position/);
    assert.match(itemInsertSection, /TRIM\(v_row->>'item_description'\)/);
    assert.doesNotMatch(itemInsertSection, /,\s*amount\s*,/);
  });

  it("does not reference derived financial columns anywhere in the migration", () => {
    assert.doesNotMatch(migration, /\boutstanding_amount\b/);
    assert.doesNotMatch(migration, /\bpayment_state\b/);
    assert.doesNotMatch(migration, /\btotal_paid\b/);
  });

  it("keeps service_role-only grants", () => {
    assert.match(migration, /REVOKE EXECUTE ON FUNCTION public\.import_invoices_grouped\(uuid, jsonb, boolean\) FROM authenticated;/);
    assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.import_invoices_grouped\(uuid, jsonb, boolean\) TO service_role;/);
    assert.match(migration, /REVOKE EXECUTE ON FUNCTION public\.internal_import_invoices_grouped\(uuid, jsonb, boolean\) FROM PUBLIC;/);
    assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.internal_import_invoices_grouped\(uuid, jsonb, boolean\) TO service_role;/);
  });

  it("uses SECURITY DEFINER with hardened search_path", () => {
    assert.match(migration, /SECURITY DEFINER/);
    assert.match(migration, /SET search_path = pg_catalog, public/);
  });
});

describe("executeInvoicesImport entitlement + verification", () => {
  const executeBlock = readExecuteBlock();

  it("counts net-new invoices before assertImportEntitlement", () => {
    assert.match(executeBlock, /existingInvoiceNumbers/);
    assert.match(executeBlock, /netNewInvoices/);
    assert.match(executeBlock, /newInvoices: netNewInvoices/);
    assert.doesNotMatch(executeBlock, /newInvoices: invoiceGroups\.length/);
  });

  it("verifies preview totals and item counts after successful import", () => {
    assert.match(executeBlock, /previewTotalsByNumber/);
    assert.match(executeBlock, /does not match preview total/);
    assert.match(executeBlock, /expected \$\{group\.items\.length\}/);
  });

  it("continues to use supabaseAdmin service-role RPC", () => {
    assert.match(executeBlock, /supabaseAdmin\(\)\.rpc\(rpcName/);
    assert.match(executeBlock, /const dryRun = false/);
  });
});

describe("invoice import preview warning wiring", () => {
  const actionsSrc = readFileSync(INVOICES_ACTION_PATH, "utf8");

  it("uses non-blocking preview warnings for derived status and amount mismatch", () => {
    assert.match(actionsSrc, /resolveImportedInvoiceStatus/);
    assert.match(actionsSrc, /status: statusResolution\.baseStatus/);
    assert.match(actionsSrc, /validationWarnings\.push\(statusResolution\.warning\)/);
    assert.match(actionsSrc, /buildInvoiceLineAmountMismatchWarning/);
    assert.match(actionsSrc, /validation_warnings: validationWarnings/);
    assert.match(
      actionsSrc,
      /previewRows\.every\(\(r\) => r\.validation_errors\.length === 0\)/
    );
  });
});

describe("import invoices grouped production verification gate", () => {
  const verificationSql = readFileSync(PRODUCTION_VERIFICATION_SQL_PATH, "utf8");

  it("is wrapped in BEGIN/ROLLBACK with no COMMIT", () => {
    assert.match(verificationSql, /^[\s\S]*\\set ON_ERROR_STOP on[\s\S]*^BEGIN;/m);
    assert.match(verificationSql, /^ROLLBACK;\s*$/m);
    assert.doesNotMatch(verificationSql, /^\s*COMMIT\s*;/im);
  });

  it("uses isolated verification prefix and explicit pass marker", () => {
    assert.match(verificationSql, /__ARREXIA_IMPORT_P0_VERIFY__/);
    assert.match(verificationSql, /ARREXIA_IMPORT_P0_VERIFICATION_PASS/);
    assert.match(verificationSql, /VERIFY_FAILED/);
  });

  it("applies proposed migration functions inside the verification transaction", () => {
    assert.match(
      verificationSql,
      /CREATE OR REPLACE FUNCTION public\.internal_import_invoices_grouped[\s\S]*UPDATE public\.invoices[\s\S]*WHERE id = v_existing_invoice_id[\s\S]*DELETE FROM public\.invoice_items WHERE invoice_id = \(v_invoice_id::uuid\);[\s\S]*FOR v_row IN[\s\S]*INSERT INTO public\.invoice_items/
    );
    assert.doesNotMatch(
      verificationSql.slice(
        verificationSql.indexOf("CREATE OR REPLACE FUNCTION public.internal_import_invoices_grouped"),
        verificationSql.indexOf("CREATE OR REPLACE FUNCTION public.import_invoices_grouped")
      ),
      /ON CONFLICT \(workspace_id, invoice_number\) WHERE archived_at IS NULL/
    );
    assert.match(
      verificationSql,
      /CREATE OR REPLACE FUNCTION public\.import_invoices_grouped[\s\S]*AND NOT EXISTS \([\s\S]*i\.archived_at IS NULL/
    );
  });

  it("TEST_C five-item fixture sums to 550 (not a stale 700 expectation)", () => {
    assert.match(verificationSql, /v_expected_five_sum constant numeric := 550/);
    const testSection = verificationSql.slice(
      verificationSql.indexOf("-- TEST C — FIVE ITEMS"),
      verificationSql.indexOf("-- TEST D — RE-IMPORT REPLACE")
    );
    assert.match(testSection, /sum = 550: 10\+40\+90\+160\+250/);
    assert.match(testSection, /'quantity','1','unit_price','10'/);
    assert.match(testSection, /'quantity','5','unit_price','50'/);
    assert.match(testSection, /v_amount <> v_expected_five_sum/);
    assert.match(testSection, /persisted=\[%\]/);
    assert.doesNotMatch(testSection, /\b700\b/);
  });

  it("covers required runtime tests A through J", () => {
    assert.match(verificationSql, /TEST_A_TWO_ITEMS/);
    assert.match(verificationSql, /TEST_B_THREE_ITEMS/);
    assert.match(verificationSql, /TEST_C_FIVE_ITEMS/);
    assert.match(verificationSql, /TEST_D_REPLACE/);
    assert.match(verificationSql, /TEST_E_ATOMICITY/);
    assert.match(verificationSql, /TEST_F_DRY_RUN/);
    assert.match(verificationSql, /TEST_G_RETRY/);
    assert.match(verificationSql, /TEST_H_PAYMENT/);
    assert.match(verificationSql, /TEST_I_NET_NEW/);
    assert.match(verificationSql, /TEST_J_TENANT/);
  });

  it("covers overpaid re-import regression TEST_K", () => {
    assert.match(verificationSql, /TEST_K_OVERPAID/);
    const testSection = verificationSql.slice(
      verificationSql.indexOf("-- TEST K — OVERPAID RE-IMPORT"),
      verificationSql.indexOf("-- TEST E — BATCH ATOMICITY")
    );
    assert.match(testSection, /unit_price','1000'/);
    assert.match(testSection, /unit_price','500'/);
    assert.match(testSection, /cannot be updated to/);
    assert.match(testSection, /already been paid/);
    assert.match(testSection, /dry-run should reject paid-over-total re-import/);
    assert.match(testSection, /execute should reject paid-over-total re-import/);
    assert.match(testSection, /FROM public\.invoices_view/);
    assert.doesNotMatch(testSection, /DELETE FROM public\.payments/);
    assert.doesNotMatch(testSection, /expected view total 500 outstanding 0/);
  });

  it("creates entitlement fixtures before protected client inserts", () => {
    const fixtureSection = verificationSql.slice(
      verificationSql.indexOf("-- Isolated fixtures only"),
      verificationSql.indexOf("-- TEST F — DRY RUN")
    );
    assert.match(fixtureSection, /INSERT INTO public\.workspaces[\s\S]*INSERT INTO public\.workspace_plans/);
    assert.match(fixtureSection, /INSERT INTO public\.workspace_plans[\s\S]*INSERT INTO public\.workspace_subscriptions/);
    assert.match(fixtureSection, /INSERT INTO public\.workspace_subscriptions[\s\S]*INSERT INTO public\.clients/);
    assert.doesNotMatch(fixtureSection, /INSERT INTO public\.clients[\s\S]*INSERT INTO public\.workspace_subscriptions/);
    assert.match(fixtureSection, /'business'/);
    assert.match(fixtureSection, /'active', 'business'/);
    assert.match(fixtureSection, /internal_import_entitlement_state\(v_ws_a\)/);
  });

  it("does not contain TRUNCATE or DROP TABLE", () => {
    assert.doesNotMatch(verificationSql, /^\s*TRUNCATE/im);
    assert.doesNotMatch(verificationSql, /^\s*DROP TABLE/im);
  });

  it("asserts payment preservation via invoices_view, not derived invoice columns", () => {
    const testSection = verificationSql.slice(
      verificationSql.indexOf("-- TEST H — PAYMENT PRESERVATION"),
      verificationSql.indexOf("-- TEST E — BATCH ATOMICITY")
    );
    assert.match(testSection, /INSERT INTO public\.payments/);
    assert.match(testSection, /organization_id,/);
    assert.match(testSection, /v_org_id,/);
    assert.match(testSection, /FROM public\.invoices_view/);
    assert.doesNotMatch(testSection, /UPDATE public\.invoices\s+SET[^;]*\btotal_paid\b/);
    assert.doesNotMatch(testSection, /UPDATE public\.invoices\s+SET[^;]*\boutstanding_amount\b/);
    assert.doesNotMatch(testSection, /\boutstanding_amount\b/);
    assert.doesNotMatch(testSection, /\bpayment_state\b/);
  });

  it("runs against DATABASE_URL when available", () => {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      return;
    }

    execSync(
      `psql "${databaseUrl}" -v ON_ERROR_STOP=1 -f ${PRODUCTION_VERIFICATION_SQL_PATH}`,
      {
        stdio: "pipe",
        encoding: "utf8",
      }
    );
  });
});

describe("import invoices grouped integration SQL", () => {
  const integrationSql = readFileSync(INTEGRATION_SQL_PATH, "utf8");

  it("covers multi-item persistence and atomic rollback scenarios", () => {
    assert.match(integrationSql, /three-item mismatch/);
    assert.match(integrationSql, /five-item mismatch/);
    assert.match(integrationSql, /v_expected_five_sum constant numeric := 550/);
    assert.doesNotMatch(
      integrationSql.slice(
        integrationSql.indexOf("'invoice_number', 'INV-FIVE'"),
        integrationSql.indexOf("-- Batch of multiple valid invoices")
      ),
      /\b700\b/
    );
    assert.match(integrationSql, /soft failure left earlier invoice committed/);
    assert.match(integrationSql, /hard failure left earlier invoice committed/);
    assert.match(integrationSql, /payment preservation failed/);
    assert.match(integrationSql, /paid-total dry-run should reject invalid reduction/);
    assert.match(integrationSql, /paid-total batch failure committed sibling invoice/);
    assert.match(integrationSql, /pending payment should not block valid reduction/);
    assert.match(integrationSql, /re-import replace mismatch/);
    assert.match(integrationSql, /dry-run wrote invoices/);
    assert.match(integrationSql, /FROM public\.invoices_view/);
    assert.match(integrationSql, /INSERT INTO public\.payments[\s\S]*organization_id/);
    assert.doesNotMatch(integrationSql, /UPDATE public\.invoices[\s\S]*SET[\s\S]*outstanding_amount/);
    assert.doesNotMatch(integrationSql, /UPDATE public\.invoices[\s\S]*SET[\s\S]*total_paid/);
    assert.doesNotMatch(integrationSql, /ON CONFLICT \(workspace_id, invoice_number\) WHERE archived_at IS NULL/);
  });

  it("runs against DATABASE_URL when available", () => {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      return;
    }

    execSync(`psql "${databaseUrl}" -v ON_ERROR_STOP=1 -f ${INTEGRATION_SQL_PATH}`, {
      stdio: "pipe",
      encoding: "utf8",
    });
  });
});

describe("import invoice entitlement write-path consistency", () => {
  const migration = readFileSync(MIGRATION_PATH, "utf8");
  const verificationSql = readFileSync(PRODUCTION_VERIFICATION_SQL_PATH, "utf8");
  const executeBlock = readExecuteBlock();
  const createRpc = readFileSync(
    "supabase/migrations/20260728000000_rpc_create_invoice_with_items.sql",
    "utf8"
  );
  const updateRpc = readFileSync(
    "supabase/migrations/20260727000000_rpc_update_invoice_with_items.sql",
    "utf8"
  );

  it("increments created_invoices only on INSERT path, not UPDATE path", () => {
    const headerSection = migration.slice(
      migration.indexOf("-- Execute: invoice headers first"),
      migration.indexOf("-- Validate item rows reference known invoice headers")
    );
    const updateBranchStart = headerSection.indexOf("IF v_existing_invoice_id IS NOT NULL THEN");
    const updateBranchEnd = headerSection.indexOf("ELSE", updateBranchStart);
    const updateBranch = headerSection.slice(updateBranchStart, updateBranchEnd);
    const insertBranch = headerSection.slice(updateBranchEnd);

    assert.match(updateBranch, /UPDATE public\.invoices[\s\S]*RETURNING id INTO v_invoice_id;/);
    assert.match(insertBranch, /INSERT INTO public\.invoices \([\s\S]*v_created_invoices := v_created_invoices \+ 1;/);
    assert.doesNotMatch(updateBranch, /v_created_invoices := v_created_invoices \+ 1/);
  });

  it("rejects archived invoice numbers without resurrecting them", () => {
    assert.match(migration, /Invoice is archived: %s/);
    assert.match(migration, /i\.archived_at IS NOT NULL/);
  });

  it("relies on plain INSERT for net-new rows so unique violations roll back the batch", () => {
    const headerSection = migration.slice(
      migration.indexOf("-- Execute: invoice headers first"),
      migration.indexOf("-- Validate item rows reference known invoice headers")
    );
    assert.match(headerSection, /INSERT INTO public\.invoices \(/);
    assert.doesNotMatch(headerSection, /ON CONFLICT \(workspace_id, invoice_number\)/);
  });

  it("wrapper and app preflight both count net-new invoices only", () => {
    assert.match(migration, /NOT EXISTS \([\s\S]*i\.invoice_number = COALESCE\(elem->>'invoice_number', ''\)[\s\S]*i\.archived_at IS NULL/);
    assert.match(executeBlock, /netNewInvoices/);
    assert.match(executeBlock, /existingInvoiceNumbers/);
  });

  it("TEST_I net-new entitlement scenario remains in production verification unchanged", () => {
    const testSection = verificationSql.slice(
      verificationSql.indexOf("-- TEST I — NET-NEW ENTITLEMENT"),
      verificationSql.indexOf("-- TEST J — CROSS-WORKSPACE")
    );
    assert.match(verificationSql, /SET trial_invoices_created = 73/);
    assert.match(testSection, /mixed update\+create batch counts as 1 net-new/);
    assert.match(testSection, /expected entitlement preflight failure for 2 net-new at 75\/75/);
    assert.match(testSection, /trial_invoice_limit_reached/);
  });

  it("does not modify global trg_invoices_enforce_entitlement in this migration", () => {
    assert.doesNotMatch(migration, /trg_invoices_enforce_entitlement/);
    assert.doesNotMatch(migration, /CREATE TRIGGER invoices_enforce_entitlement/);
  });

  it("normal UI create uses INSERT and update uses UPDATE (unchanged)", () => {
    assert.match(createRpc, /INSERT INTO public\.invoices \(/);
    assert.doesNotMatch(
      createRpc.slice(createRpc.indexOf("INSERT INTO public.invoices")),
      /ON CONFLICT/
    );
    assert.match(updateRpc, /UPDATE public\.invoices/);
    assert.doesNotMatch(
      updateRpc.slice(updateRpc.indexOf("CREATE OR REPLACE FUNCTION")),
      /INSERT INTO public\.invoices[\s\S]*ON CONFLICT/
    );
  });
});

describe("import RPC permission regression", () => {
  it("still restricts import RPCs to service_role in baseline migration", () => {
    const migration = readFileSync(RESTRICT_MIGRATION_PATH, "utf8");
    assert.match(migration, /import_invoices_grouped\(json,uuid,boolean\)/);
    assert.match(migration, /REVOKE EXECUTE[\s\S]*FROM authenticated/);
  });
});
