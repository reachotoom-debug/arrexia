import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  buildInvoicesSampleCsvWithClients,
  buildInvoicesSampleTsvWithClients,
  runInvoiceSampleSelfTest,
} from "@/app/[workspaceId]/settings/import/_lib/invoicesGroupedFormat";

const CANONICAL_MIGRATION =
  "supabase/migrations/20260810120000_fix_import_invoices_grouped_integrity.sql";
const STALE_MIGRATION =
  "supabase/migrations/20260808160000_phase2_final_consistency_hardening.sql";
const INVOICES_ACTION_PATH =
  "app/[workspaceId]/settings/import/actions/invoices.ts";
const PRODUCTION_VERIFICATION_SQL =
  "scripts/db/verify_import_invoices_grouped_function.sql";

describe("invoice import outstanding_amount production regression", () => {
  it("canonical migration never writes invoices.outstanding_amount", () => {
    const migration = readFileSync(CANONICAL_MIGRATION, "utf8");
    assert.doesNotMatch(migration, /\boutstanding_amount\b/);
    assert.doesNotMatch(migration, /\btotal_paid\b/);
    assert.doesNotMatch(migration, /\bpayment_state\b/);
    assert.match(migration, /INSERT INTO public\.invoices \([\s\S]*amount/);
    assert.match(migration, /SET amount = v_subtotal/);
  });

  it("documents stale migration that caused production failure", () => {
    const stale = readFileSync(STALE_MIGRATION, "utf8");
    assert.match(stale, /outstanding_amount/);
    assert.match(stale, /total_paid, outstanding_amount, payment_state/);
  });

  it("preview and execute call import_invoices_grouped with explicit dry_run flag", () => {
    const src = readFileSync(INVOICES_ACTION_PATH, "utf8");
    assert.match(src, /const dryRun = true[\s\S]*p_dry_run: dryRun/);
    assert.match(src, /const dryRun = false[\s\S]*p_dry_run: dryRun/);
    assert.doesNotMatch(src, /\.from\("invoices"\)[\s\S]*outstanding_amount/);
    assert.match(src, /\.from\("invoices_view"\)[\s\S]*outstanding/);
  });

  it("generated sample INV-0056/0057 contract stays parser-compatible", () => {
    const sample = runInvoiceSampleSelfTest();
    assert.equal(sample.passed, true, sample.errors.join("; "));

    const clients = [
      { name: "Omar Mostafa", email: "omar@example.com" },
      { name: "Karim Ali", email: "karim@example.com" },
    ];
    const tsv = buildInvoicesSampleTsvWithClients(clients);
    const csv = buildInvoicesSampleCsvWithClients(clients);

    assert.match(tsv, /INV-0056/);
    assert.match(tsv, /INV-0057/);
    assert.match(tsv, /Omar Mostafa/);
    assert.match(tsv, /Karim Ali/);
    assert.match(csv, /INV-0056/);
    assert.match(csv, /INV-0057/);
    assert.doesNotMatch(tsv, /outstanding_amount/);
    assert.doesNotMatch(csv, /outstanding_amount/);
  });

  it("production verification gate and diagnostic SQL avoid outstanding_amount", () => {
    const verification = readFileSync(
      "scripts/db/importInvoicesGroupedIntegrity.productionVerification.sql",
      "utf8"
    );
    assert.doesNotMatch(verification, /\boutstanding_amount\b/);
    assert.match(verification, /TEST_K_OVERPAID/);

    const diagnostic = readFileSync(PRODUCTION_VERIFICATION_SQL, "utf8");
    assert.match(diagnostic, /internal_import_invoices_grouped/);
    assert.match(diagnostic, /outstanding_amount/);
  });
});
