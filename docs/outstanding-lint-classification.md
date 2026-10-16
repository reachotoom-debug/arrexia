# Individual lint:outstanding classification — 15 October 2026

`node scripts/check-outstanding-amount.js` was rerun unchanged: exit 1, exactly 16 matches in two test files. Every match and its surrounding test were inspected. There are **10 negative assertions, three positive diagnostic/historical assertions and three test descriptions**. None of these 16 is an application query or an executable write to the retired field. The scanner uses line-text matching, not TypeScript syntax or assertion semantics. It remains unchanged and failing; this review does not suppress, rename, obfuscate or allowlist the matches.

Paths below are repository-relative. G = `lib/import/__tests__/importInvoicesGroupedIntegrity.test.ts`; R = `lib/import/__tests__/invoiceImportOutstandingAmountRegression.test.ts`.

| # | Exact location | Classification | Evidence and conclusion |
| --- | --- | --- | --- |
| 1 | G:102 | Negative assertion | `doesNotMatch(insertSection, /\boutstanding_amount\b/)` rejects the retired column in the canonical invoice INSERT. Legitimate regression guard. |
| 2 | G:114 | Negative assertion | Rejects the name anywhere in the canonical integrity migration text. Legitimate regression guard. |
| 3 | G:276 | Negative assertion | Rejects invoice UPDATE/SET of the retired field in the payment-preservation fixture SQL. This is a regex, not an UPDATE statement. |
| 4 | G:277 | Negative assertion | Rejects any retired-field reference in that same fixture section. Legitimate regression guard. |
| 5 | G:321 | Negative assertion | Rejects UPDATE/SET of the retired field in the integration SQL. Legitimate regression guard. |
| 6 | R:20 | Test description | `describe("invoice import outstanding_amount production regression", ...)` names the historical failure. No data access. |
| 7 | R:21 | Test description | `it("canonical migration never writes invoices.outstanding_amount", ...)` names an absence check. No data access. |
| 8 | R:23 | Negative assertion | Requires the canonical `20260810120000` migration not to contain the retired field. Legitimate regression guard. |
| 9 | R:32 | Positive historical assertion | Requires the *stale* `20260808160000_phase2_final_consistency_hardening.sql` source text to retain the documented bad reference. It reads a file; it does not apply that migration. |
| 10 | R:33 | Positive historical assertion | Identifies the stale INSERT's `total_paid, outstanding_amount, payment_state` signature. Confirms the known historical cause, not permission to deploy it. |
| 11 | R:40 | Negative assertion | Rejects base `invoices` queries mentioning the retired field in import action source. Legitimate regression guard. |
| 12 | R:61 | Negative assertion | Rejects the retired field in generated TSV sample content. Legitimate sample contract check. |
| 13 | R:62 | Negative assertion | Same guard for generated CSV. Legitimate sample contract check. |
| 14 | R:65 | Test description | Names the production-verification/diagnostic test. Its title is imprecise: the verification SQL must avoid the field, while the read-only diagnostic must recognize it. The body makes this distinction. No financial violation. |
| 15 | R:70 | Negative assertion | Rejects the retired field in the production verification fixture SQL. Legitimate regression guard. |
| 16 | R:75 | Positive diagnostic assertion | Requires the SELECT-only `scripts/db/verify_import_invoices_grouped_function.sql` to recognize the retired name in deployed function source/column catalogs. Its CASE reports failure when a function references it. It does not write that column. |

The stale migration really contains retired-column writes at lines 974 and 1065. That is historical source evidence, **not proof about today's deployed function**. A returned deployed import definition containing those writes would be a real rollout blocker; the catalog preflight is required to establish that. Do not replay the migration backlog to satisfy a history mismatch.

The tests also contain optional `DATABASE_URL`-driven fixture execution, independent of the 16 lint matches. Those SQL fixtures perform DDL/DML even if they roll back. They must never run against production for this review. Focused tests were run with `DATABASE_URL` unset and outbound HTTP blocked. No test-fixture SQL was executed.

Disposition: keep the check's failure visible. A future separately reviewed scanner improvement could distinguish executable accesses from assertion patterns, while preserving detection of real application violations. No such change was made here.
