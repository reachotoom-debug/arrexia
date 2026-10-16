-- READ ONLY: identifies financial inconsistencies for review; never repairs data.
-- No reliable import provenance is stored on invoices, so these are candidates,
-- not proof of an imported invoice. Scope to a reviewed workspace before use.
-- Comparisons use the existing two-decimal invoice rounding tolerance (0.01).
BEGIN READ ONLY;
WITH line_totals AS (
  SELECT invoice_id, SUM(quantity * unit_price) AS line_subtotal, COUNT(*) AS item_count
  FROM public.invoice_items
  GROUP BY invoice_id
)
SELECT i.workspace_id, i.id, i.invoice_number, i.status, i.currency,
       i.subtotal, l.line_subtotal, i.discount_percent, i.discount_amount,
       i.tax_percent, i.tax_amount, i.amount,
       i.subtotal - COALESCE(i.discount_amount, 0) + COALESCE(i.tax_amount, 0) AS stored_components_total,
       COALESCE(l.item_count, 0) AS item_count,
       ABS(COALESCE(i.subtotal, 0) - COALESCE(l.line_subtotal, 0)) > 0.01 AS subtotal_mismatch,
       ABS(COALESCE(i.amount, 0) - (COALESCE(i.subtotal, 0) - COALESCE(i.discount_amount, 0) + COALESCE(i.tax_amount, 0))) > 0.01 AS total_mismatch
FROM public.invoices i
LEFT JOIN line_totals l ON l.invoice_id = i.id
WHERE i.archived_at IS NULL
  -- AND i.workspace_id = '<reviewed workspace UUID>'::uuid
  AND (i.subtotal IS NULL OR i.amount IS NULL
    OR ABS(COALESCE(i.subtotal, 0) - COALESCE(l.line_subtotal, 0)) > 0.01
    OR ABS(COALESCE(i.amount, 0) - (COALESCE(i.subtotal, 0) - COALESCE(i.discount_amount, 0) + COALESCE(i.tax_amount, 0))) > 0.01)
ORDER BY i.workspace_id, i.invoice_number, i.id;
ROLLBACK;
