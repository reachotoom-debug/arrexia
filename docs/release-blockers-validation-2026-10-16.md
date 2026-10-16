# Remaining release blockers — local closure, 16 October 2026

No production operations, historical repair, provider sends, settings changes, resets, staging, commits or deployments were performed. No credentials were loaded or printed. The installed Docker engine was started to reach the explicitly named isolated container.

## Change and focused evidence

`20261015010000_claim_reminder_delivery.sql` now selects a recurring rule's template with `is_enabled IS DISTINCT FROM false`. This matches the existing `isUsableReminderTemplate` contract: NULL is usable, only explicit false disables the template. Rule enablement, tenant membership, source-role checks, occurrence validation, serialization and grants are unchanged.

New fixture: `scripts/tests/reminder-claims-pg17-targeted.test.cjs`. It is pinned to `supabase_db_arrexia-local-test`, database postgres; it checks PostgreSQL major version 17 and uses no application URLs or dotenv. Child environment is allowlisted and libpq password/service files are pinned to /dev/null. The harmless libpq warning that /dev/null is not a plain password file is not a test failure.

The runner temporarily installs only the actual candidate claim function body with CREATE OR REPLACE, preserving ownership and ACLs. It creates uniquely identified synthetic rows. Session-local replica mode is used only for fixture setup/cleanup to avoid bootstrap/entitlement side effects; it is not active during any claim call. This does not validate those setup triggers. Existing claims, invoices, settings and acceptance rows are not updated or truncated. Cleanup deletes only fixture IDs, restores the exact original function definition, owner, ACL and settings, and checks table counts return to baseline.

Actual server: **PostgreSQL 17.11 on x86_64-pc-linux-gnu, compiled by gcc (GCC) 15.2.0, 64-bit**.

| Check | Result |
| --- | --- |
| RED: recurring occurrence seven days after base, NULL-enabled template | 0/1; expected scheduled-date exception with old predicate. Cleanup passed. |
| Cross-workspace claim rejection | PASS: foreign invoice rejected for authenticated and service roles; nonmember rejected; no claim inserted. |
| Concurrent same-occurrence claims | PASS: two independent sessions return exactly one true and one false; exactly one persisted synthetic claim. |
| Corrected NULL-template recurrence | PASS: due date 21 days ago, final rule +14, recurrence today (+7 after base); first claim true, duplicate false. |
| GREEN aggregate | **3/3**, zero failures/skips; exit 0. Cleanup passed. |
| Syntax / whitespace | Node --check and git diff --check exit 0; only existing unrelated line-ending notices. |

Commands from D:\arrexia\arrexia (RED ran before editing the migration):

```powershell
node --test --test-name-pattern='NULL-enabled' scripts/tests/reminder-claims-pg17-targeted.test.cjs *> tmp/claim-null-template-pg17-red.tap
node --test scripts/tests/reminder-claims-pg17-targeted.test.cjs *> tmp/claim-null-template-pg17-green.tap
node --check scripts/tests/reminder-claims-pg17-targeted.test.cjs
git diff --check
```

A separate read-only review found no actionable issue in the predicate or fixture. No broad audit, full suite, TypeScript rerun or completed manual acceptance check was repeated. No application TypeScript changed.

## Evidence supersession

The old claim migration hash was `67d93736c7e7a4c628e461a97e499052c3b699e44329c04741c520ac0a6b4b6f`.

The new hash is `d09f5159b74c34c2ed9e56dd943d3e6fd4baba9ecc365554c9cd26eb2ceff93d`. The other seven migration hashes are unchanged. The complete refreshed order, hashes and RED/GREEN log hashes are in `release-migration-hashes-2026-10-16.json`.

Earlier manifests/logs are preserved as immutable historical evidence. Their claim-body hash and any assertion that their entire migration set certifies the current artifact are **superseded**, including:

- financial-integrity-evidence/invoice-write-boundary-local-verification-2026-10-15.json;
- financial-integrity-evidence/claim-identity-migration-manifest-2026-10-15.json and claim-identity-local-verification-2026-10-15.json;
- earlier claim/import/security run summaries;
- D:\arrexia-local-test\baseline\candidate-migrations.sql and its migration-application log as evidence of current claim-body parity.

The prior 54/54 PostgreSQL 15/18 runs remain evidence for their old artifact and unchanged surfaces, **not** a rerun of the amended claim function. Existing application/TypeScript evidence remains relevant to unchanged application source; no new whole-tree certification is asserted.

The isolated database's pre-test function was deliberately restored after testing. The isolated app copy and baseline SQL files were not modified; their old claim migration must not be mistaken for this amended release artifact. Test-only fonts remain excluded.

## Staging and remaining release conditions

`release-staging-list.txt` is the exact reviewed staging allowlist, relative to the repository root. It includes runtime corrections, regressions/test infrastructure, eight migrations, review documents and five read-only operator SQL scripts. It excludes raw/derived production/customer evidence, secrets, .env files, tmp/log/PDF/build output, dependencies, __pycache__, deployment metadata, the isolated copy/fonts and all historical repair proposals/helpers/fixtures and repair-plan documentation. Nothing was staged.

The NULL-template blocker and requested PG17 claim checks are closed locally. This is not production deployment approval or confirmation of full settlement. The previously untested full-settlement acceptance remains outside this request; completed manual checks need not be repeated. Production catalog comparison, writer gates, complete sender inventory/drain/reconciliation, immutable compatible artifact cutover and authorized reopening remain required. Historical repair and gross/net accounting decisions remain separate.
