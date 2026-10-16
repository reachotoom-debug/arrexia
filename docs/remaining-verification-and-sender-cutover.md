# Remaining verification and controlled sender cutover

Production remains paused. This is preparation, not authorization to change settings, run migrations, repair records, send, commit, push or deploy.

## Current catalog follow-up

Both catalog and organization-policy raw results are now supplied and reviewed. See [current claim/identity local validation](claim-identity-local-validation.md). The missing helper is resolved by inlining the membership predicate in the pending claim migration; no helper is supplied by tests. The user's contract is member manual access and service-role automatic access, so there is no remaining access-contract question.

Use the reviewed seven-migration order, including the new users/organizations boundary. Gate client/payment writers until the guarded client-cascade restore artifact is live everywhere. Sender drain/mixed-version prohibitions below continue to apply. The original U01-U07 collection procedure below is historical, not a list of seven still-unverified checks. No operation here authorizes production execution.

## Single SQL Editor submission

Use `scripts/db/remaining-catalog-security.readonly.sql`. In the authorized Supabase project, confirm the project/database identity, paste the **entire file**, including BEGIN and ROLLBACK, and run it once. It has no psql meta-commands. It returns one row and one JSON column, `arrexia_remaining_catalog_security`, labeled `ARREXIA_REMAINING_CATALOG_SECURITY_V1`. Export the entire cell as a file, rather than a screenshot or truncated preview. Preserve the script SHA-256, project identity, SQL Editor role, capture time, final ROLLBACK and any error. It does not return a GO decision.

Use an authorized catalog reader with SELECT on `supabase_migrations.schema_migrations`. If permission is denied, do not grant access or remove checks under this authorization: retain the error and mark verification incomplete. In JSON, verify `read_only=on` and `isolation=repeatable read`. A successful SQL submission proves collection ran, not that its security evidence passes. Empty arrays, missing objects, a non-authoritative reader or truncated output require review; they are not automatic passes.

The script omits invoice candidates, fee samples, the already confirmed defect and already inspected invoice trigger bodies. Migration metadata and definition hashes establish remaining deployment/security identity; they do not reopen the confirmed absence of the two migrations as an uncertainty. Full known view/RPC bodies are not duplicated. Unknown helpers, claim definitions if present, payment/internal triggers and rules still require inspection.

Only these checks remain unresolved:

| JSON label | Review required |
| --- | --- |
| U01 | Reader authority; API and function/table/schema-owner roles, memberships, superuser/BYPASSRLS/login attributes; effective public/auth schema CREATE/USAGE. Determine whether an untrusted role can replace a SECURITY DEFINER dependency. Review membership chains and owner trust, not only direct grants. |
| U02 | Exact overloads/results/owners/SECURITY DEFINER/search paths, raw and expanded ACLs including PUBLIC, effective API EXECUTE privileges; compare definition hashes against captured/reviewed bodies from the same PostgreSQL output format. Inspect uncaptured helper bodies recursively. Catalog dependencies do not discover every textual PL/pgSQL or dynamic SQL call. A differing hash requires full definition capture, not a guessed explanation. |
| U03 | Table/view ownership, view options, effective CRUD/TRUNCATE/TRIGGER privileges, RLS/forced-RLS and every policy. Check workspace isolation and privileged direct-write bypasses across claims, ledger and authorization tables. A policy does not restrict an owner/BYPASSRLS role merely because it exists. |
| U04 | Actual numeric typmods, nullability, generated/default expressions, prerequisite column types and column write grants. The generated-net expression is confirmed; storage coercion/rounding, remaining column contracts and direct amount/fee/status/archive edits are not. An authorized direct payment writer can bypass the manual RPC guard; review policy/grant exposure explicitly. |
| U05 | Validated/deferrable constraints, foreign-key delete/cascade effects, actual unique keys/predicates and index validity/readiness. Claim table/index absence is known now; their exact security and integrity must be checked again after a separately authorized installation. |
| U06 | Complete payment triggers, internal FK triggers and non-view rewrite rules; actual trigger timing/enabled state/helper bodies. Previously captured ordinary invoice UPDATE bodies do not establish this inventory. |
| U07 | Remaining ledger identity/prerequisite drift, including whether the new guard version exists; compare history with actual definitions. Applied version names alone cannot establish applied content. |

The earlier report's phrase “no authenticated claim access” was too broad for the current artifact. `20261015010000_claim_reminder_delivery.sql` grants authenticated EXECUTE for membership-checked `manual` claims, denies anon/PUBLIC, and rejects `auto_cron` unless `auth.role()='service_role'`. The verified workspace runner uses an admin client only after membership authorization and derives scope from that authorization. **The automatic claim path is service-role-only; the prepared RPC as a whole is not.** U02 must verify both ACL and body. The user has now explicitly requested manual member access and service-role automatic access; the corrected inline-membership migration preserves that contract. This review does not change grants or silently choose a new policy.

## Deployment dependency order

1. Reviewed, immutable application and SQL artifacts; approved catalog results; captured old definitions/grants and recoverable backup evidence. Complete numeric/trigger prerequisites before accepting the payment guard's predictions on this target.
2. A proven operational gate covering old and new deployments, Next.js server actions and scheduled/retry entry points. There is no newly implemented universal kill switch in this work. Identify the actual infrastructure control and demonstrate its coverage before scheduling rollout; a hidden button or disabled automation setting is insufficient for manual sends.
3. Separately authorized database deployment, after drain and writer gates: claims migration `20261015010000`, import migration `20261015120000`, then generated-net update guard `20261015140000`. Do not replay the migration backlog. The latter requires stored generated `amount - transaction_fee`; import requires its reviewed wrapper/internal schema and paid-floor dependencies; claims require reviewed invoice/workspace/rule/template/settings columns, UUID generation, membership and workspace-business-date helpers.
4. Database catalog/grants/index/definition verification, then PostgREST schema-cache confirmation. No claim RPC probe: calling it writes a claim. A REST schema response is only cache visibility evidence.
5. One claim-aware application artifact on every reachable sender deployment, with server-only admin credentials and existing cron authentication preserved. Adapter reconciliation flags, verified workspace scope, shared sender and claimed dispatch must ship together. Do not release the runner fix alone onto a database missing claims.
6. Read-only post-deployment evidence and isolated mocked-provider tests, followed by separately authorized reopening. Historical repair is a separate maintenance operation with its own approved source manifest/receipt; it is not required to enable the guard or claims and must not be bundled into migrations.

## Exact controlled sender sequence — later operator action only

1. Record active deployment IDs, aliases/custom and immutable deployment URLs, scheduled jobs, queue/retry owners and current workspace automation settings. Inventory external callers from deployment/provider/job controls, not just the repository. `vercel.json` declares reminder GET cron `/api/internal/reminders/run` at `0 6 * * *`; confirm actual deployed schedule/timezone and whether duplicate/external jobs exist. Do not alter the separate billing lifecycle schedule.
2. Freeze deployments and new invocations. Pause reminder schedules and external retry consumers; gate reminder entry points on **all** reachable versions. Include the Next server-action POST transport on the reminders page, not just `/api` routes. Revoke/deny old invocation routes through the chosen approved infrastructure control; retain read-only access and logs. Verify denial without calling an unguarded sender. If control coverage cannot be proven, stop here and keep NO-GO.
3. Drain invocations already admitted. Record invocation IDs, deployment versions, workspace/invoice/occurrence IDs, provider request/message IDs and final delivery/history outcome. Confirm no process or queued retry can still reach a provider. Observe terminal execution and provider evidence; do not substitute a fixed sleep or a successful health check for drain. An already-running function may survive a routing change. If it cannot be safely observed/drained, maintain the pause.
4. Classify pre-cutover attempts: proven not submitted; provider accepted; uncertain/timeout; history persistence failed after acceptance. Preserve all evidence. **Do not replay accepted, uncertain or accepted/history-failed attempts.** Missing history is not proof of no delivery. New claims start empty and cannot retrospectively deduplicate old sends. Compare old successful history/provider evidence; if affected identities cannot be safely bounded, hold their workspace (or all sending) until reconciled. Time passing or a new business day does not clear uncertainty. Any backfill/reconciliation write requires separate authorization.
5. With reminder gates still closed, gate payment/invoice/import writers for the authorized database window. Capture fresh catalog/definition evidence and carry out the reviewed database dependency order above. If any migration fails, keep all relevant gates closed and inspect actual ledger plus definitions; do not infer whether it committed from a client timeout.
6. Re-run the remaining catalog evidence after installation and compare with the reviewed artifacts: API/manual/source-role boundaries, claim table denial and RLS, advisory-lock/unique scopes, valid/ready indexes, guard expression/typmods and paid-floor/import definitions. Refresh/check API cache through the separately authorized procedure. No real send or mutation RPC is a verification probe.
7. Deploy the **same** claim-aware build behind closed gates to every route in the inventory below. Retire or protect older immutable URLs, old scheduled targets and running workers. Reject mixed versions: one bypassing sender is enough to invalidate delivery protection. Use deployment artifact identity/logging evidence; do not test by racing production emails.
8. In isolation, verify authorization, concurrent claims and accepted/history-failure warning propagation through server action, both REST adapters and both runner types. On production use only read-only catalog, deployment and log checks. Reconcile all drain exceptions and obtain the separate authorization to reopen. Restore only previously enabled schedules/automation; disabled demo automation stays disabled. Do not replay missed cron batches or queued retries automatically. Retain holds for unresolved accepted/uncertain identities.
9. After reopening under that later authorization, monitor ordinary traffic for reconciliation flags, claim failures, partial/failed batches and duplicate attempts. Pause the affected ingress immediately on a bypass or inconsistent artifact/security evidence. Check workspace/currency ledger invariants read-only; no synthetic customer send is required or authorized by this plan.

| Entry point / source | Path to claimed provider dispatch |
| --- | --- |
| Manual server action | `app/[workspaceId]/reminders/actions.ts::sendReminderAction` → `lib/reminders/send.ts::sendReminderForInvoice` |
| Manual legacy REST | `POST /api/reminders/send` → shared sender |
| Manual workspace REST | `POST /api/workspaces/[workspaceId]/reminders/send` → shared sender |
| Authorized workspace batch | `POST /api/workspaces/[workspaceId]/reminders/run` → verified `access.workspace.id` + `supabaseAdmin()` → workspace runner → shared sender, `auto_cron` source |
| Scheduled/internal batch | `GET` and `POST /api/internal/reminders/run` → all-workspace runner → workspace runner → shared sender, `auto_cron` source |
| Shared dispatch | `lib/reminders/deliveryClaim.ts::dispatchClaimedReminder` claims before provider call; adapters/runner summaries preserve uncertainty and history-persistence warnings |
| External or retained retry callers | No separate reminder retry worker was found in the inspected repository paths. Actual deployed/external jobs are unverified; inventory them and route only through the same guarded paths, with no automatic accepted/uncertain replay. Provider transport internals must not introduce unreviewed submission retries. |

Email-settings test sends and billing lifecycle emails are different flows, not evidence that reminder claims protect every email in the product. WhatsApp link clicks are not confirmed deliveries; do not reclassify them as successful sends or use them as a provider test.

## Abort and rollback conditions

| Condition | Required controlled response |
| --- | --- |
| Gate/drain incomplete, unknown old sender or queue, accepted/uncertain delivery unresolved | Keep sending closed; reconcile or hold affected identities/workspaces. Do not delete/expire claims or replay to “test.” |
| Partial migration, catalog/ACL/owner/index mismatch, unexpected target schema | Keep reminder and affected writer gates closed. Capture actual ledger/definitions; choose a reviewed forward completion. Never retry DDL blindly after timeout. |
| Application release fails after database installation | Retain additive claims and their records. Roll back only to a claim-compatible artifact. If only a claim-unaware build is available, keep all sending gated. Do not drop claim state to match old code. |
| Guard or import release needs reversal | Gate affected writers first. Replacing the guard with its old body restores a demonstrated defect; prefer a reviewed forward fix. Restoring an import function does not undo records imported while it was active. |
| Provider accepted, history missing, timeout after submission | External effect cannot be rolled back. Preserve reconciliation flags and operator evidence; no automatic retry even if the HTTP response is failed or partial. |
| Historical inverse proposed later | Requires separately approved recorded repair receipt, exact current postimage/dependency/catalog match and serialization. Any drift aborts the batch. It restores subtotal only, leaves timestamp triggers active and cannot restore timestamp history. Never repair the exact held overpayment or the six ambiguous/missing-item cases automatically. |

## What the 19 PostgreSQL tests establish

The previous combined run (`tmp/payment-repair-postgres-validation.tap`) passed **11 payment-guard + eight repair/screen tests** on disposable PostgreSQL 15, not Supabase production. These SQL artifacts were not changed by this documentation/catalog task.

| Validated on synthetic PostgreSQL | Still not established on production |
| --- | --- |
| Generated-net prediction/recalculation on amount increases/decreases with zero/nonzero/NULL fee; status transitions, archived edits, existing-excess reduction, tolerance and atomic overpayment rejection | Actual target numeric typmods/coercion, payment trigger/rule effects, direct writer exposure and complete privilege/RLS boundaries |
| Fixture authorization/membership/immutable IDs, execute grants/security context and rejection of ordinary net column | Deployed function owner/overloads/grants, role inheritance, trustworthy search path, migration installation and matching helper definitions |
| Read-only screen invariance, exact held UUID and same-label eligibility, ambiguous/archived/currency exclusions | Fresh production source approval, maintenance serialization, original business provenance and unexplained overpayment cause |
| Empty/unapproved/duplicate/fabricated manifests, dependency/catalog/header drift, adverse trigger effects, atomic abort, subtotal-only repair and recorded inverse, canonical total/paid/outstanding invariance | Restore-based target rehearsal, production repair or inverse safety after intervening edits, receipt persistence/restore operations |

**The 19 do not validate reminder-claim concurrency, real provider acceptance, adapter propagation, deployed RLS, sender drain or mixed-version cutover.** Separate earlier mocked reminder tests and a separate claim fixture exist; their results must not be attributed to these 19. No fixture proves actual deployment state or exactly-once provider delivery.

For the new catalog script, a ninth repair-suite test was added and run locally: **9/9 pass**, including JSON shape, all seven labels, absent-object reporting, generated metadata/role privilege collection and financial-state invariance. Log: `tmp/remaining-catalog-security-validation.tap`. This is one additional collection regression, not another production verification or a claim-concurrency test. Production remains NO-GO pending the unresolved checks and controlled release prerequisites above.
