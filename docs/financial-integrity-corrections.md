# Financial integrity corrections — 15 October 2026

All application changes and migrations are local and uncommitted. No production records, settings, automation, messages or deployments were changed.

The subsequent local rollout-blocker follow-up fixes verified workspace execution and delivery-warning propagation through HTTP/cron adapters, adds mocked authorization/batch regressions, and prepares SQL preflight, accounting investigation and historical-repair instructions. See [updated readiness review](production-rollout-readiness-review.md). No accounting semantics or historical production records were changed; production rollout remains NO-GO pending the evidence and controls documented there.

## Deployment evidence

`scripts/db/financial-read-only-evidence.cjs` performs GET-only REST reads using the existing local Supabase configuration. It never executes RPCs, prints credentials, or saves customer names. An anonymized snapshot is in `financial-integrity-evidence/deployment-read-only.json`.

- The deployed invoices/payments view column contracts match the repository's expected contracts. The grouped import RPC is visible.
- SQL function/view bodies, generated-column expressions, triggers and grants cannot be inspected through this REST access. Migration history returned HTTP 406. Consequently, exact deployed definition parity remains unverified.
- The screenshot demo workspace (anonymized reference `b405f66c41ba`) has INV-0023 subtotal 0, amount 15,000 and one item totaling 15,000. This confirms inconsistent stored presentation fields, not absent item data.
- INV-0044 / INV-0048 in that workspace have amounts 2,400 / 4,500, due 15 October 2026, outstanding in full and not overdue. Settings show Asia/Amman, USD and automatic reminders disabled.
- Thirteen completed payments dated 17 September total 88,800. Gross equals net; no fee-bearing records were found in the accessible payment dataset.
- Invoice numbers are not globally unique: the evidence includes distinct matching invoices from another workspace. Workspace scope must accompany invoice number in any repair review.

To repeat the read-only evidence collection:

```powershell
node scripts/db/financial-read-only-evidence.cjs .env.local docs/financial-integrity-evidence/deployment-read-only.json
```

## Changes and root causes

| Area | Root cause and correction |
| --- | --- |
| Payment chart | Paid invoice balances were assigned to invoice issue month. Actual effective payment records now use `resolvePaymentBusinessDate`: date-only payment date first, workspace-calendar creation date only as fallback. Monthly keys/labels do not use browser timezone conversion. Receipt trends/deltas use the same payment-date basis; lifetime invoice collection ratio remains invoice paid / issued value. |
| Import | Grouped import replaced line items and amount but left subtotal/adjustments stale. The new migration persists line subtotal and total together and clears unsupported discount/tax fields on line-only imports/re-imports. This reflects the existing CSV format, which has no adjustment inputs. Existing paid-total locks and guards remain. Dry runs do not change totals. |
| Currency | Dashboard calculations run separately per discovered currency. Client balances, billed/paid figures, warnings and dialogs keep currencies separate. Computed client sorting groups currencies rather than comparing unlike units. No exchange conversion was added. |
| Complete reads | Financial/eligibility/contact/history scans use stable ordered batches. A later-page or missing-data failure throws instead of publishing an understated balance or an empty eligibility list. Invoice/payment portfolio KPI loaders retain their existing complete scans. |
| PDF | The printable DTO already supplied invoice terms/notes, but the renderer ignored them. Terms and customer notes now render separately from branding thank-you text; item rows do not split between pages. |
| Client warnings | Drafts are excluded from archive/deactivation collectible balance checks. Warning eligibility/display uses currency-separated positive balances, including records after the first API page. |
| Sending | History check followed by external send was not atomic. A durable database claim now precedes provider dispatch in the shared manual/cron path. Provider acceptance followed by failed history persistence is reported as sent with a reconciliation warning, not as a safe-to-retry send failure. |
| Copy | Receivables Overview, overdue-only AR labeling, all-eligible reminder labels, lifetime collection scope, recorded-payment status ratio, collection priority heuristics, immediate email sending and existing escalation next steps are explicit. Ledger debt and operational eligibility remain different scopes. |

## Payment fees: established behavior, unchanged accounting

The canonical view applies `COALESCE(net_amount, amount)` to invoice paid balance. Repository migrations describe net as gross less transaction fee. A local PostgreSQL regression demonstrates invoice 100 + completed gross payment 100 + fee 3 + net 97 produces paid 97 and outstanding 3.

Therefore a customer who paid gross in full **can** retain a fee balance under the current contract. No fee-bearing production records were found, and REST cannot confirm the deployed net-column generation expression. Whether processor fees should instead be borne by the business is an accounting/product decision. This work deliberately does not change payment accounting, refunds, reversals, or paid-total guards.

## Local migrations and rollout

1. `20261015010000_claim_reminder_delivery.sql`: creates durable delivery claims and a membership-checked RPC with invoice-level serialization. RPC access fails closed if the migration is absent. No claim is released automatically after provider dispatch, failure, timeout or history failure.
2. `20261015120000_invoice_import_stored_totals_consistency.sql`: replaces only the grouped import implementation; existing invoices are not updated by applying it.

Before a later authorized rollout: verify deployed definitions/grants and migration prerequisites; stop/drain old reminder senders, apply the reviewed migrations, deploy all senders together, then restore the previous automation state. Old code does not honor claims. Do not enable automation as part of rollout. Take the normal backup/recovery precautions before applying migrations. No remote migration has been executed here.

Claims supplement successful history; they do not prove delivery. Rule claims protect a logical scheduled occurrence. Ruleless manual claims serialize manual/cron activity for the workspace-calendar day. Later legitimate days/occurrences remain separate attempts. Reconcile uncertain provider outcomes before intentionally initiating another follow-up; there is no new retry/release UI.

## Identify existing invoices needing review — read only

Run `scripts/db/audit-invoice-stored-totals.sql` with a reviewed workspace filter. It runs in a read-only transaction, compares persisted line sums, stored subtotal and stored total components, and returns candidates without changing data. It does not assume tax/discount percentages, manufacture missing items, or infer import provenance. Review source CSV, existing legitimate adjustments and payment history before proposing a separate repair. Do not repair by re-importing blindly: line-only re-import explicitly clears unsupported adjustments.

## Verification

Final results: **2,119 application tests passed (zero failures/skips)**; TypeScript no-emit passed; **5/5** disposable PostgreSQL import/accounting tests passed; **7/7** disposable PostgreSQL claim concurrency/security/recurrence tests passed. Changed TypeScript ESLint completed with zero errors and 38 warnings. Independent code review found no further important defects. See `financial-integrity-evidence/application-tests.log`, `changed-typescript-eslint.log`, `invoice-import-and-pdf.md`, and `reminder-verification.txt` for evidence.

Tests use synthetic inputs and the fixture network guard; sending tests mock the provider. PostgreSQL tests create disposable local clusters and never read production credentials. PDF fixtures are synthetic and rendered offline using installed Arial registered as the fixture font; production font configuration is unchanged. Short and multi-page rendered pages were visually inspected.

Reproduction commands:

```powershell
$env:TS_NODE_PROJECT='scripts/tsconfig.json'
$tests = @(rg --files lib app scripts -g '*.test.ts')
node -r ./scripts/tests/fixture-network-guard.cjs -r ts-node/register/transpile-only -r tsconfig-paths/register -r ./lib/test/nodeTestSetup.ts --test --test-concurrency=4 @tests
node node_modules/typescript/bin/tsc --noEmit --incremental false
node --test scripts/tests/invoice-import-totals-db.test.cjs scripts/tests/reminder-delivery-claims-db.test.cjs
node scripts/tests/render-invoice-content-fixture.cjs
```

The repository `npm run lint:outstanding` check currently flags existing negative regression tests that mention the forbidden column name. Those `lib/import/__tests__` files were unchanged by this work. The check was run and its pre-existing false positives are not presented as a passing gate. Final test/lint results are recorded in the accompanying evidence directory and delivery summary.
