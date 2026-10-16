# Claim and identity authorization — local validation, 15 October 2026

**Superseded for current migration order/results:** [invoice-write-boundary-local-validation.md](invoice-write-boundary-local-validation.md) adds the eighth migration and the direct invoice-write regressions. The seven-migration counts below describe the preceding run and are retained as historical evidence.

Production changes remain paused. Local claim/identity implementation blockers are closed; production PostgreSQL17.6 has not been changed or runtime-verified. Historical invoice repair is excluded from this migration/test set and remains separately authorized work.

## Evidence and interpretation

The complete raw `docs/production-evidence/organization-policy-dependencies-result.json` was read: 11,295 bytes, SHA-256 `187c34ee2d8f3a3c92413c64345d43458de11c7df5f45a6abd13a967e4e7c0ca`. It captures read-only/repeatable-read snapshot `22693:22693:` at 2026-10-15 16:15:55.256602 UTC. It supplies two relation security/column inventories, five policies, table/sequence default privileges, an empty membership-helper inventory, empty organization/workspace subject join census and three zero mismatch counts.

Raw findings:

- `Users can insert themselves` and `Users can update themselves` constrain only `auth_user_id=auth.uid()`. Broad authenticated table/column rights allow choosing/changing `organization_id`, `role`, identity and activation fields while satisfying that predicate. An own-identity policy is not a column restriction.
- `Org members can update org` authorizes organization membership but does not restrict updated columns. Grants cover subscription tier/status, trial/limits and settings. This proves unauthorized field-write capability, not an observed billing exploit.
- Both tables are postgres-owned, RLS-enabled/non-forced, with broad API table privileges, no independent column ACLs and independent service-role grants. Default public-table privileges for owner postgres are also broad; they apply to future tables and do not themselves describe existing row policies.

**Separate operator-reported SELECT summaries, not contents of this raw JSON:** users=1; workspaces=29; workspace_members=29; workspaces_with_matching_users=0; workspaces_without_organization=0. The only noninternal identity triggers are BEFORE UPDATE calling `set_updated_at()` and assigning `NEW.updated_at=NOW()`. Reported constraints: organizations PK(id)/UNIQUE(slug); users PK(id)/UNIQUE(auth_user_id)/organization FK ON DELETE CASCADE. These summaries do not supply exact trigger names/default expressions or raw constraint definitions. They explain why an empty organization/workspace join is not evidence that there are zero users.

No identities, organization assignments or memberships are repaired or manufactured. Existing organization policies are retained. Evidence and attribution are preserved in `financial-integrity-evidence/organization-security-review-2026-10-15.json`.

## Corrections and application dependencies

`20261015010000_claim_reminder_delivery.sql` no longer calls the absent `is_workspace_member(uuid)`. Its SECURITY DEFINER body directly checks `workspace_members.workspace_id=p_workspace_id AND user_id=auth.uid()` for non-service callers. Manual members remain authorized; nonmembers/anon cannot claim; automatic source still requires service role; invoice and rule workspace checks remain. Search path is `pg_catalog, public`. Explicit table REVOKE ALL covers PUBLIC/anon/authenticated, removing the broad new-table defaults for this claim table. Function EXECUTE remains authenticated/service_role with PUBLIC/anon revoked. Advisory serialization, occurrence/manual-day indexes and non-expiring claim behavior are unchanged.

The claim fixture now contains **no membership helper at all**. Before the fix, nine regressions failed because the old migration referenced the missing function. Both manual and service paths now execute the actual corrected migration. The source-role contract is settled by the user's request: member manual access and service-role automatic access; a globally service-role-only RPC is not the requested contract.

`20261015153000_users_organizations_write_boundary.sql` atomically revokes API/PUBLIC INSERT/UPDATE/DELETE/TRUNCATE/TRIGGER on both identity tables and all column INSERT/UPDATE grants. Effective inherited privilege checks abort the entire DO on surviving access. It checks the captured RLS/owner/service-role prerequisites and preserves independent service rights before/after. SELECT, existing policies, defaults, triggers, rows and memberships remain unchanged. It does not grant unused profile-edit permissions on users.

Dependency tracing found no current non-test application mutation of public.users. Organization creation is service-admin bootstrap in `lib/workspaces/ensureWorkspaceForUser.ts::bootstrapWorkspaceForUser`, using `{name}` and an injected/admin client. Account name/avatar edits go through `lib/profile/server.ts::upsertProfile` and settings actions into **profiles**, not users/organizations. The new three-case profile regression executes that helper with mocks: verified UID/profile fields only; unauthenticated requests never connect; runtime organization/role/identity extras are ignored. Existing bootstrap/client-cascade/reminder adapter tests remain in the full application suite.

## Ordered pending migration set

`scripts/tests/financial-security-migration-set.cjs` is the explicit test manifest; hashes are in `financial-integrity-evidence/claim-identity-migration-manifest-2026-10-15.json`.

1. `20261015010000_claim_reminder_delivery.sql`
2. `20261015120000_invoice_import_stored_totals_consistency.sql`
3. `20261015140000_payment_update_generated_net_guard.sql`
4. `20261015150000_workspace_policy_fences.sql`
5. `20261015151000_payment_write_boundary.sql`
6. `20261015152000_remove_api_destructive_privileges.sql`
7. `20261015153000_users_organizations_write_boundary.sql`

The workspace fixture applies all seven actual files in that order in one disposable cluster, asserts the applied list equals the manifest, and exercises manual claims without a helper, guarded payment RPCs and service-role grouped-import execution after privilege narrowing. It is a DDL/runtime fixture, not a Supabase migration-framework/ledger replay or a restored database. Entitlement-wrapper/import prerequisites outside the fixture remain captured-code/application coverage, not a full production wrapper integration test.

Gate all sender ingress and financial/client writers for a later separately approved rollout. Install this exact reviewed set against the expected prior schema; ship claim-aware adapters and guarded client cascade restoration before reopening writers. Keep old senders drained and old URLs/retries gated. Re-capture actual catalog/security state after installation before reopening. Do not alter membership/data or include historical repair in this sequence.

## Exact commands and results

Working directory: `D:\arrexia\arrexia`. No Docker, downloads or software installation. `local-postgres-config.cjs` accepts an absolute existing `ARREXIA_TEST_PG_BIN`, checks installed executables and supplies only an OS-environment allowlist to PostgreSQL children. No .env/application database credentials are read; PGPASSFILE and PGSERVICEFILE are pinned to the OS null device so libpq cannot consult user credential/service files. Each test creates its own initdb data directory, starts only a loopback server on fixed fixture ports 55449/55450/55451/55453, explicitly supplies host/port/database/user to psql, and stops that server in its after hook. Synthetic fixture directories/logs are retained under the printed local temp paths; installed data directories and services are not used.

PowerShell commands used (line wrapping only):

```powershell
$env:IDENTITY_WRITE_BASELINE=$null
$env:WORKSPACE_SECURITY_BASELINE=$null
$env:PAYMENT_NET_BASELINE=$null
$env:INVOICE_TOTALS_BASELINE=$null
$env:ARREXIA_TEST_PG_BIN='C:/Program Files/PostgreSQL/15/bin'
node --test --test-concurrency=1 scripts/tests/reminder-delivery-claims-db.test.cjs scripts/tests/workspace-security-boundaries-db.test.cjs scripts/tests/payment-update-generated-net-db.test.cjs scripts/tests/invoice-import-totals-db.test.cjs *> tmp/financial-security-pg15.tap

$env:ARREXIA_TEST_PG_BIN='C:/Program Files/PostgreSQL/18/bin'
node --test --test-concurrency=1 scripts/tests/reminder-delivery-claims-db.test.cjs scripts/tests/workspace-security-boundaries-db.test.cjs scripts/tests/payment-update-generated-net-db.test.cjs scripts/tests/invoice-import-totals-db.test.cjs *> tmp/financial-security-pg18.tap

$env:ARREXIA_TEST_PG_BIN='C:/Program Files/PostgreSQL/15/bin'
node --test scripts/tests/workspace-security-boundaries-db.test.cjs *> tmp/identity-security-scope-pg15.tap
$env:ARREXIA_TEST_PG_BIN='C:/Program Files/PostgreSQL/18/bin'
node --test scripts/tests/workspace-security-boundaries-db.test.cjs *> tmp/identity-security-scope-pg18.tap

node scripts/tests/run-local-application-regressions.cjs *> tmp/identity-claim-application-tests.tap
.\node_modules\.bin\tsc.cmd --noEmit --incremental false *> tmp/identity-claim-typecheck.log
.\node_modules\.bin\eslint.cmd lib/profile/__tests__/identityWriteBoundaryFlows.test.ts *> tmp/claim-identity-eslint.log
```

| Run / actual server output | Result |
| --- | --- |
| PostgreSQL **15.18**, compiled by Visual C++ build1944, 64-bit | **44/44**, zero failures/skips; exit0 |
| PostgreSQL **18.4** on x86_64-windows, compiled by msvc-19.44.35227, 64-bit | **44/44**, zero failures/skips; exit0 |
| Final capture-aligned authorization/ordered-set fixture, both15.18 and18.4 | **19/19 on each**, zero failures/skips; exit0. Repeated coverage, not38 additional distinct tests. |
| Application tests, allowlisted environment + outbound fixture network guard | **2,151/2,151**, zero failures/skips; exit0 |
| TypeScript | exit0 |
| New profile test ESLint | zero warnings/errors; exit0 |

Final scope runs explicitly replay captured later grants/revocations after broad creation defaults, including existing workspace_members API mutation denial; native PG18 MAINTAIN ACL entries are replayed conditionally. Both final runs assert those existing membership revocations survive. Their logs are tmp/identity-security-scope-pg15.tap and tmp/identity-security-scope-pg18.tap.

Each SQL matrix consists of nine claim tests (including actual concurrent sessions), 19 workspace/identity/ordered-set tests, 11 generated-net payment tests and five grouped-import tests. It covers tenant checks, manual/cron races, recurrence/date handling, retained claims, broad permissive alternatives, old/new rows, table/column/PUBLIC/inherited rights, direct payment edit/restore rejection, user self-insert/organization/role escalation rejection, protected organization fields and preserved service operations. The identity-only red baseline reproduced three expected write-boundary failures (`tmp/identity-write-baseline.tap`); the missing-helper red baseline reproduced nine (`tmp/claim-no-helper-baseline.tap`). Setup/export-decoding issues were corrected before treating any baseline as defect evidence.

The application runner strips inherited application variables by constructing an allowlisted child environment, then preloads `fixture-network-guard.cjs`; it neither loads dotenv nor performs real sends. Historical repair fixtures/scripts were not run as part of these commands. Prior 19 payment/repair test results are a separate earlier run, not this matrix.

## Limits and concrete remaining release blockers

**PostgreSQL15/18 success is not PostgreSQL17 verification.** Production evidence identifies17.6. Managed-role behavior, a restored target dataset, migration-framework behavior, production API cache and post-installation state were not exercised. Identity defaults used for name-only bootstrap in the disposable fixture are explicitly synthetic because the raw export omits expressions. Reported constraints are modeled from the operator summary; no test-only security trigger/helper substitutes for missing production protection. Profile tests are mocked application-contract tests, not production profiles-RLS verification.

Only these release blockers remain for reopening production financial/sending paths:

1. **Deployed defects remain:** the proposed migrations/application cutover have not been applied. Known deployed broad grants/policies and the old payment update guard remain in the supplied evidence. An authorized controlled rollout plus actual PostgreSQL17 catalog/security verification is still required; local tests do not mark production fixed.
2. **Direct invoice financial UPDATE is still an accounting-guard bypass outside this patch:** captured authenticated UPDATE and workspace policies allow amount/adjustment edits, while the inspected UPDATE triggers are timestamp/workspace checks. The invoice paid-floor RPC is not yet the exclusive write path. Close that path with its application dependencies or keep it operationally inaccessible through a verified control before claiming financial write integrity. Do not weaken grants broadly or change settlement policy as a shortcut.
3. **Sender cutover has not occurred:** no production inventory/drain/reconciliation evidence proves every old sender, immutable URL, schedule and retry is stopped or claim-aware. Accepted/uncertain/history-failed deliveries cannot be automatically replayed. Follow the existing controlled cutover sequence under separate authorization.

Broad future table default privileges remain recorded, not silently changed globally. The frozen set's only new table (claims) explicitly removes all API/PUBLIC rights, and this is tested after replaying broad defaults. Future tables/other uncaptured surfaces need explicit privilege review; these tests do not certify the whole database. Gross/net settlement policy is unchanged. Historical repair has its own source approval, manifest and rollback requirements and is not part of this release authorization.
