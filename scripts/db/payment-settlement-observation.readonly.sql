-- SELECT-only observations, not a declaration of intended accounting policy.
-- Run after catalog preflight. No create/update/delete/restore/import RPC calls.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
WITH payments AS MATERIALIZED (
  SELECT p.*, (p.archived_at IS NULL AND (p.status IS NULL OR p.status IN ('completed', 'paid'))) AS effective
  FROM public.payments p
), grouped AS (
  SELECT workspace_id, currency, status, (archived_at IS NOT NULL) AS archived,
    count(*) AS records, count(*) FILTER (WHERE invoice_id IS NULL) AS unallocated_records,
    count(*) FILTER (WHERE transaction_fee IS NULL) AS null_fee_records,
    count(*) FILTER (WHERE net_amount IS NULL) AS null_net_records,
    count(*) FILTER (WHERE transaction_fee <> 0) AS nonzero_fee_records,
    count(*) FILTER (WHERE net_amount IS NOT NULL AND net_amount IS DISTINCT FROM amount - coalesce(transaction_fee, 0)) AS net_formula_differences,
    sum(amount) AS recorded_gross, sum(transaction_fee) AS recorded_fees,
    sum(coalesce(net_amount, amount)) AS effective_net_or_gross_fallback,
    sum(amount) FILTER (WHERE effective) AS active_effective_gross,
    sum(coalesce(net_amount, amount)) FILTER (WHERE effective) AS active_effective_net_or_fallback
  FROM payments GROUP BY workspace_id, currency, status, (archived_at IS NOT NULL)
), settled AS (
  SELECT workspace_id, invoice_id, currency AS payment_currency, count(*) AS effective_payment_count,
    sum(amount) AS gross_sum, sum(coalesce(net_amount, amount)) AS net_sum
  FROM payments WHERE effective AND invoice_id IS NOT NULL GROUP BY workspace_id, invoice_id, currency
), currency_counts AS (
  SELECT workspace_id, invoice_id, count(*) AS payment_currency_count FROM (
    SELECT DISTINCT workspace_id, invoice_id, currency FROM payments WHERE effective AND invoice_id IS NOT NULL
  ) c GROUP BY workspace_id, invoice_id
), comparison AS (
  SELECT i.workspace_id, i.id AS invoice_id, i.currency AS invoice_currency, i.status,
    i.amount AS invoice_total, s.payment_currency, s.effective_payment_count, cc.payment_currency_count,
    coalesce(s.gross_sum, 0) AS gross_sum, coalesce(s.net_sum, 0) AS net_sum,
    v.paid AS canonical_paid, v.outstanding AS canonical_outstanding,
    CASE WHEN cc.payment_currency_count IS NULL OR (cc.payment_currency_count = 1 AND s.payment_currency IS NOT DISTINCT FROM i.currency)
      THEN greatest(i.amount - coalesce(s.gross_sum, 0), 0) END AS hypothetical_gross_outstanding,
    CASE WHEN cc.payment_currency_count IS NULL OR (cc.payment_currency_count = 1 AND s.payment_currency IS NOT DISTINCT FROM i.currency)
      THEN greatest(i.amount - coalesce(s.net_sum, 0), 0) END AS hypothetical_net_outstanding
  FROM public.invoices i LEFT JOIN settled s ON s.workspace_id = i.workspace_id AND s.invoice_id = i.id
  LEFT JOIN currency_counts cc ON cc.workspace_id = i.workspace_id AND cc.invoice_id = i.id
  LEFT JOIN public.invoices_view v ON v.workspace_id = i.workspace_id AND v.id = i.id
  WHERE i.archived_at IS NULL
), anomalies AS (
  SELECT p.id, p.workspace_id, p.invoice_id, p.currency, p.status, p.archived_at,
    p.amount, p.transaction_fee, p.net_amount, i.workspace_id AS invoice_workspace, i.currency AS invoice_currency,
    CASE WHEN p.invoice_id IS NULL THEN 'unallocated'
      WHEN i.id IS NULL THEN 'missing_invoice'
      WHEN p.workspace_id IS DISTINCT FROM i.workspace_id THEN 'workspace_mismatch'
      WHEN p.currency IS DISTINCT FROM i.currency THEN 'currency_mismatch'
      WHEN p.net_amount IS NOT NULL AND p.net_amount IS DISTINCT FROM p.amount - coalesce(p.transaction_fee, 0) THEN 'net_formula_difference'
      WHEN p.transaction_fee <> 0 THEN 'fee_bearing'
      WHEN p.amount < 0 OR p.transaction_fee < 0 OR p.net_amount < 0 THEN 'negative_value'
      ELSE 'null_net' END AS observation
  FROM payments p LEFT JOIN public.invoices i ON i.id = p.invoice_id
  WHERE p.invoice_id IS NULL OR i.id IS NULL OR p.workspace_id IS DISTINCT FROM i.workspace_id
    OR p.currency IS DISTINCT FROM i.currency OR p.transaction_fee <> 0
    OR p.net_amount IS NULL OR p.amount < 0 OR p.transaction_fee < 0 OR p.net_amount < 0
    OR (p.net_amount IS NOT NULL AND p.net_amount IS DISTINCT FROM p.amount - coalesce(p.transaction_fee, 0))
)
SELECT jsonb_build_object(
  'database', current_database(), 'actor', current_user, 'captured_at', transaction_timestamp(),
  'snapshot', pg_current_snapshot()::text, 'read_only', current_setting('transaction_read_only'),
  'isolation', current_setting('transaction_isolation'),
  'groups', (SELECT jsonb_agg(g ORDER BY workspace_id, currency, status, archived) FROM grouped g),
  'invoice_comparison', (SELECT jsonb_agg(c ORDER BY workspace_id, invoice_id) FROM comparison c),
  'payment_observations', (SELECT jsonb_agg(a ORDER BY workspace_id, id) FROM anomalies a),
  'limitation', 'Snapshot values do not prove generated/update/delete behavior or business policy. Review exact deployed catalogs and functions; no RPC has been invoked.'
) AS payment_observation;
ROLLBACK;
