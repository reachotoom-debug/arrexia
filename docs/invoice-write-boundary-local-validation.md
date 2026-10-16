# Direct invoice write boundary — local validation, 15 October 2026

**16 October supersession:** only the claim migration's NULL-template predicate changed. [Focused PG17 closure](release-blockers-validation-2026-10-16.md) records the amended hash, 3/3 PostgreSQL17.11 checks, exact cleanup and limits. The 54-case matrices below describe the previous claim artifact; the other seven migration hashes are unchanged. Use release-migration-hashes-2026-10-16.json for current release identity.

Production changes remain paused. This closes the confirmed API table/column-write bypass locally. It does not change settlement policy, repair historical invoices, change membership, enable automation or send messages.

## Root cause and application dependencies

Authenticated members could UPDATE invoice money below effective payments, and INSERT/UPDATE/DELETE invoice items independently of the header. Workspace RLS scoped the rows but did not make those financial operations atomic or enforce the existing edit RPC's payment floor. Table-only REVOKE would also leave column grants effective.

| Existing flow | Source | Execution and retained access |
| --- | --- | --- |
| Invoice create/edit | app/[workspaceId]/invoices/actions.ts:268,490 | Authenticated atomic rpc_create_invoice_with_items / rpc_update_invoice_with_items; owner execution, verified membership, client/invoice tenant checks. Edit locks invoice FOR UPDATE, sums effective payments and replaces items in the same transaction. |
| Grouped import/re-import | app/[workspaceId]/settings/import/actions/invoices.ts:582,1283 | Existing authorized service-role import RPC; no new API grants. |
| Archive/restore | app/[workspaceId]/invoices/actions.ts:590,637,712 | Authenticated UPDATE(archived_at), scoped by the existing restrictive workspace fence. No item deletion. |
| Client archive/restore cascade | app/[workspaceId]/clients/_actions/clientActions.ts:85,235 | Same archived_at permission in both directions; existing guarded payment-restore compatibility remains required. |
| Collection note | app/[workspaceId]/collections/actions.ts:33 | Authenticated UPDATE(notes). |
| Successful email draft promotion | lib/invoices/promoteDraftInvoiceAfterSend.ts:39; lib/invoices/send-invoice-route.ts:165 | Authenticated UPDATE(status), with a new invoker trigger allowing only active draft → sent (or unchanged status). Other status transitions use the existing atomic edit RPC. |
| Public access token | lib/invoices/ensurePublicAccessToken.ts:59 | Existing service-role UPDATE; API token write is not required. |
| Invoice item queries | lib/invoices/items.ts | Reads only. No authenticated direct item mutation found. |

The application already uses atomic financial RPCs, so no application execution context was elevated. No RPC signature, monetary calculation, discount/tax interpretation, effective-payment status, net settlement, or one-cent paid-floor tolerance was changed. RPC monetary arguments retain their existing application-calculated contract; this correction addresses direct table/item writes, not a new financial model. Service-role grants and operations remain unchanged.

## Local migration

20261015154000_invoice_write_boundary.sql requires the restrictive invoice/item workspace fences and owner-executed, fixed-search-path authenticated create/edit RPCs. It revokes PUBLIC/anon/authenticated table and column INSERT/UPDATE/DELETE on invoices, invoice_items and invoices_view, then retains only authenticated UPDATE(archived_at,notes,status) on invoices. Effective inherited privileges are checked and abort installation on unexpected access.

The invoker status trigger checks the database execution role, not caller-controlled JWT role text. Owner RPCs and service operations retain status access; direct authenticated transitions are limited to active draft → sent. Privilege changes, trigger function creation and trigger installation are one atomic DO statement. Installation failure leaves no half-installed status grant. Existing grants to other roles, SELECT, service privileges, policies, rows and memberships are not broadened or rewritten.

## Reproduction and verification

Tests use only installed PostgreSQL binaries and fresh disposable loopback trust clusters. The fixture replays supplied production types, generated columns, constraints, policies, ACLs and captured payment functions, then installs the explicit ordered candidate set. Invoice RPCs are loaded from existing repository migrations. The supplemental identity defaults remain explicitly synthetic, not production-default verification. No application credentials or dotenv are read; libpq credential/service files are pinned to NUL.

Exact PowerShell commands from D:\arrexia\arrexia:

```powershell
$env:ARREXIA_TEST_PG_BIN='C:/Program Files/PostgreSQL/15/bin'
$env:INVOICE_WRITE_BASELINE='1'
node --test --test-name-pattern='invoice header|direct invoice item|direct status writes|effective invoice financial' scripts/tests/workspace-security-boundaries-db.test.cjs *> tmp/invoice-boundary-red-pg15.tap
Remove-Item Env:INVOICE_WRITE_BASELINE
node --test --test-concurrency=1 scripts/tests/reminder-delivery-claims-db.test.cjs scripts/tests/workspace-security-boundaries-db.test.cjs scripts/tests/payment-update-generated-net-db.test.cjs scripts/tests/invoice-import-totals-db.test.cjs *> tmp/invoice-boundary-matrix-pg15.tap
$env:ARREXIA_TEST_PG_BIN='C:/Program Files/PostgreSQL/18/bin'
node --test --test-concurrency=1 scripts/tests/reminder-delivery-claims-db.test.cjs scripts/tests/workspace-security-boundaries-db.test.cjs scripts/tests/payment-update-generated-net-db.test.cjs scripts/tests/invoice-import-totals-db.test.cjs *> tmp/invoice-boundary-matrix-pg18.tap
node scripts/tests/run-local-application-regressions.cjs *> tmp/invoice-boundary-application-tests.tap
.\node_modules\.bin\tsc.cmd --noEmit --incremental false *> tmp/invoice-boundary-typecheck.log
$env:ARREXIA_TEST_PG_BIN='C:/Program Files/PostgreSQL/15/bin'
node --test --test-name-pattern='invoice boundary aborts' scripts/tests/workspace-security-boundaries-db.test.cjs *> tmp/invoice-boundary-autocommit-pg15.tap
$env:ARREXIA_TEST_PG_BIN='C:/Program Files/PostgreSQL/18/bin'
node --test --test-name-pattern='invoice boundary aborts' scripts/tests/workspace-security-boundaries-db.test.cjs *> tmp/invoice-boundary-autocommit-pg18.tap
node --check scripts/tests/workspace-security-boundaries-db.test.cjs
node --check scripts/tests/financial-security-migration-set.cjs
git diff --check
```

The RED run omits only the invoice boundary: four selected tests fail for allowed header writes, allowed independent item writes, unrestricted status changes and effective privileges. This is actual PostgreSQL behavior, not a mocked denial. The complete tests additionally cover tenant isolation, preserved archive/restore/notes/promotion/service imports, atomic header/item rollback after a late item-insert failure, paid-floor rejection, create flow, effective PUBLIC/column/inherited grants and atomic migration failure.

| Verification | Result |
| --- | --- |
| RED, installed PostgreSQL 15.18 | Four selected tests fail as expected; exit 1. |
| Ordered eight-migration matrix, PostgreSQL 15.18 (Visual C++ build 1944, 64-bit) | 54/54, zero failures/skips; exit 0. |
| Same matrix, PostgreSQL 18.4 on x86_64-windows (msvc-19.44.35227, 64-bit) | 54/54, zero failures/skips; exit 0. |
| Application, allowlisted environment/outbound network guard | 2,151/2,151, zero failures/skips; exit 0. |
| TypeScript --noEmit --incremental false | exit 0. |
| Strengthened standalone autocommit failure test, PostgreSQL 15.18 / 18.4 | 1/1 on each; exit 0. Repeated case, not two additional distinct tests. |
| Node syntax checks and git diff --check | exit 0; only pre-existing line-ending notices in unrelated files. |

The SQL matrix is nine claim + 29 workspace/identity/invoice + 11 payment + five import tests. PostgreSQL 15/18 results are explicitly not PostgreSQL 17 verification. No application source change was necessary in this task. Full application tests preserve existing archive/restore/client cascade/email-promotion behavior; no real send occurs.

After the matrices, only the migration-failure assertion was strengthened: it now grants a disposable fixture privilege before the failing DO, without an outer transaction, and verifies that failed guard creation rolls back the entire DO to its prior state. The focused follow-up passed on each version; migration/application source did not change. [Machine-readable evidence and eight migration hashes](financial-integrity-evidence/invoice-write-boundary-local-verification-2026-10-15.json) binds the logs and final fixture source. Earlier failed concurrency-observation attempts are not counted as passing evidence; final tests identify sessions using fixture-only PGAPPNAME and observe the lock holder in pg_stat_activity.

Two real concurrent-session tests observe the first mutation holding its invoice lock before issuing the opposing request. Invoice reduction to 80 with 50 paid rejects a concurrent payment of 40; payment increasing paid to 70 rejects a concurrent invoice reduction to 60. Existing net-based settlement is retained. The readiness report records final run results and versions.

## Final ordered set and remaining cutover

The authoritative test list is scripts/tests/financial-security-migration-set.cjs. Apply only these reviewed candidates in a separately authorized maintenance window; do not apply the repository backlog:

1. 20261015010000_claim_reminder_delivery.sql
2. 20261015120000_invoice_import_stored_totals_consistency.sql
3. 20261015140000_payment_update_generated_net_guard.sql
4. 20261015150000_workspace_policy_fences.sql
5. 20261015151000_payment_write_boundary.sql
6. 20261015152000_remove_api_destructive_privileges.sql
7. 20261015153000_users_organizations_write_boundary.sql
8. 20261015154000_invoice_write_boundary.sql

Freeze reviewed hashes, close all sender ingress/old retries and gate financial writers, drain accepted/in-flight work and reconcile uncertain delivery outcomes. Apply the ordered set and re-capture actual deployed definitions, owners, effective privileges, RLS, trigger enablement, claim uniqueness and ledger. Ship the claim-aware build and existing client payment-restore compatibility before reopening writers/senders. Confirm legitimate invoice form/archive/restore/note flows and service imports in an isolated environment; post-deployment production checks remain read-only unless separately authorized. Preserve automation settings.

Invoice-specific post-deployment read-only checks must show: no anon/authenticated/PUBLIC effective table INSERT/UPDATE/DELETE or column INSERT on invoice tables/views; authenticated column UPDATE only for invoices.archived_at/notes/status; no item-column UPDATE; unchanged service grants; both restrictive workspace fences still present; invoice_direct_status_transition enabled for BEFORE UPDATE OF status; invoker function with fixed search path; original member-only atomic invoice RPC signatures, ownership and reviewed paid-floor/locking bodies. Compare invoice/payment/item counts and monetary aggregates by workspace/currency against the gated preflight snapshot. Check deployed code uses the audited RPCs and archived_at-only cascades before reopening. REST schema visibility is insufficient catalog evidence.

Do not restore broad financial grants or remove the status trigger to accommodate old code. On a partial rollout keep ingress/writers closed, inspect actual applied state and complete a reviewed forward correction. A claim-unaware application rollback requires sending to remain disabled; retain claim state and reconcile accepted/uncertain deliveries without automatic retries. PostgreSQL 15/18 tests are not PostgreSQL 17 or deployed-state verification. Historical repair remains outside this set and needs separate evidence and authorization.
