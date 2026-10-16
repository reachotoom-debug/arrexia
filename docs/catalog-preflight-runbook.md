# Catalog preflight runbook — read-only operator procedure

**Current state:** both the full catalog and organization-policy results have now been supplied and reviewed. The claim dependency and identity writes are corrected locally; see [exact versions/commands/current blockers](claim-identity-local-validation.md). Queries below are preserved for later separately authorized recapture, not outstanding requests to rerun already supplied evidence.

**Catalog result now supplied:** the complete result of `scripts/db/remaining-catalog-security.readonly.sql` was inspected. For remaining users/organizations/default-privilege and data-semantics evidence, use `scripts/db/organization-policy-dependencies.readonly.sql`. The earlier collection procedure below remains historical; do not treat its seven categories as all unresolved. See [current security findings](catalog-security-corrections.md).

**Original single-result submission:** use `scripts/db/remaining-catalog-security.readonly.sql` in Supabase SQL Editor as one complete submission, including BEGIN/ROLLBACK. It returns one labeled JSON cell, not multiple result sets. Export the complete cell and retain errors/completion evidence. [Remaining checks and exact cutover procedure](remaining-verification-and-sender-cutover.md) supersedes the broader original collection procedure below for this paused review. The original script remains available as historical/full recapture tooling, not a list of fresh findings.

Prepared locally; no remote execution occurred. REST 406/PGRST106 indicates an unexposed schema, not a catalog result. Neither visible columns nor OpenAPI discovery certifies grants, function bodies, migration versions or generated net behavior. This requires a trusted authorized PostgreSQL session; do not try mutation RPCs as probes.

## psql

Use an approved direct/pooler connection with credentials supplied through the approved password prompt or credential store. Do not put passwords in command history or saved logs. In PowerShell, from the application repository, run the following after setting `PREFLIGHT_DATABASE_URL` to an approved connection URI without an embedded password:

```powershell
Get-FileHash scripts/db/rollout-catalog-preflight.readonly.sql -Algorithm SHA256
psql "$env:PREFLIGHT_DATABASE_URL" -X -W -v ON_ERROR_STOP=1 -P pager=off -L catalog-preflight-output.txt -f scripts/db/rollout-catalog-preflight.readonly.sql
```

This is an operator instruction, not a command executed by this review. `-X` ignores startup files, `ON_ERROR_STOP` stops on the first SQL error, and the file starts a repeatable-read read-only transaction and ends with ROLLBACK. Save the output in an approved restricted evidence location. Record command exit status, script hash, capture time and target project/database identity. Verify reported `read_only=on`, `isolation=repeatable read`, and final ROLLBACK. If the script fails, capture the error and treat the preflight as incomplete; session disconnect rolls back. Do not remove protection, grant privileges, or substitute a write-capable probe to make it pass.

## Supabase SQL Editor

In the authorized project's SQL Editor, verify the project/database identity and select the entire contents of `scripts/db/rollout-catalog-preflight.readonly.sql`, including BEGIN and ROLLBACK. Execute as one submission in one session; do not run selected individual statements outside the transaction. Export/capture every result set plus transaction settings and completion/error evidence. Verify all expected sections below are present; an editor that only displays the last result set needs supported all-result capture or a trusted psql session. Never run either prepared migration or the older `importInvoicesGroupedIntegrity.productionVerification.sql` as a preflight: that verification script performs DDL/fixture mutations despite rollback.

## Acceptance review

- Migration versions/names: reconcile exact applied history before authorizing only `20261015010000`, `20261015120000` and the new guard `20261015140000`; do not replay the backlog. Capture current definitions before any replacement. Missing/inaccessible migration history is an unresolved prerequisite.
- Exact view definitions, owners/options; grouped wrapper/internal implementation and complete payment/invoice function bodies/signatures/owners/search paths. Discovery query includes legacy functions whose names contain invoice/payment. Inspect referenced helpers recursively; do not assume migration filenames establish deployed precedence.
- Net generation: compare information-schema and pg_attribute/pg_attrdef outputs for amount/fee/net; review enabled payment/invoice/item triggers and actual trigger function bodies. Inspect helpers and generated-expression dependencies as needed. Distinguish generated expression, ordinary default and trigger recalculation. Read-only catalogs establish definitions; runtime behavior still needs disposable tests.
- Claims: table owner, RLS/forced-RLS, policies, role table privileges, exact constraints/index definitions and unique-key scope; compare function membership/manual/service-role boundaries against the prepared claim migration. Confirm index validity separately if needed with SELECT from pg_index; an index definition alone does not prove validity. No direct anon/authenticated writes; trusted owner/schema CREATE boundaries; anon denied RPC, authorized member manual and service-role automation permitted by definition. Do not execute claim RPC because it inserts claims.
- Dependencies: `workspace_business_date` exact arguments/defaults, timezone/date behavior; `is_workspace_member`, `auth.role`/`auth.uid`, UUID function availability and ownership. Validate invoice/workspace/rule/template/import column types and required contracts. Role privilege results and function ACLs must be reviewed together, including inherited/PUBLIC grants. No privilege changes are authorized here.

After a later authorized rollout, repeat this same read-only capture and compare exact definitions and grants to the reviewed artifact, with all three reviewed migration versions present. Verify API schema-cache visibility separately with GET-only discovery; absence from cache does not prove physical absence. Preserve SQL and REST results as different evidence. A complete catalog pass does not authorize customer sends, historical repair or an accounting-policy change.

## Exact SQL Editor submissions for the remaining review

No working SQL credential/connector was found in this session. The browser dashboard redirects to sign-in. These are prepared queries, **not executed production evidence**. After signing into the intended project, paste each complete file as a separate SQL Editor submission:

1. `scripts/db/rollout-catalog-preflight.readonly.sql`: exact function/view/trigger definitions, signatures, owners, effective grants and expanded ACLs, migration history, generated/default expressions, table RLS/policies, constraints (including payment deletion/cascades), rules and claim index validity. Capture every result set, including errors and transaction settings. Do not run any function merely because it appears in the result.
2. `scripts/db/payment-settlement-observation.readonly.sql`: one `payment_observation` JSON result for workspace/currency/status/archive gross/fee/net totals, linked/unallocated anomalies and invoice canonical-versus-gross/net comparisons. These are observations, not a substitute for reviewing definitions or approving field semantics.
3. `scripts/db/invoice-repair-dry-run.readonly.sql`: one `repair_dry_run` JSON result, with the historical UUID/preimage manifest already embedded. It returns current full audit candidates, new IDs, missing/changed historical records, eligibility/exclusions, per-workspace/currency before/projected amounts, canonical before-values and current item/payment fingerprints. It never executes an UPDATE or a repair/import RPC.

Every file uses repeatable-read/read-only BEGIN and ROLLBACK. Submit the whole file; export the named SELECT JSON or all catalog result sets, not merely a final ROLLBACK status. If SQL Editor cannot export all catalog results, use the psql procedure above. Retain outputs in a restricted evidence location: they contain internal identifiers and financial values. Include script SHA-256, target identity and capture time. An error, omitted result set, permission-filtered metadata or unexpected row count keeps the corresponding check unverified.

The intended claim contract is **not globally service-role-only**: the prepared function grants EXECUTE to authenticated members for membership-checked `manual` claims, denies anon/PUBLIC, and rejects `auto_cron` unless `auth.role()` is `service_role`. The authenticated workspace runner performs verified member authorization before supplying a service-role client. Check both EXECUTE ACL and the body; either alone is insufficient. Do not revoke the intended manual member path or weaken the automatic source check to make a rollout pass.

## Current evidence and additional local scripts

Supplied function/view/trigger bodies and invoice dry-run output are now preserved under `financial-integrity-evidence/production-sql-2026-10-15/`. Full security/catalog acceptance remains pending. Also run `invoice-update-trigger-preflight.readonly.sql` and `invoice-repair-financial-holds.readonly.sql` as complete read-only SQL submissions for the later evidence window.

`invoice-repair-preimages.readonly.sql` contains psql meta-commands and explicit manifest input; use psql, not a SQL Editor paste. The historical repair/rollback `.local-proposal.sql` files are mutation proposals, not catalog-preflight scripts. Do not execute them under this read-only authorization. Their empty manifests and default ROLLBACK do not turn them into read-only queries.
