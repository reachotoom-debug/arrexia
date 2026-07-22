-- ============================================================================
-- R1: Normalize legacy reminder_rules trigger_type to canonical contract
-- ============================================================================
--
-- Legacy seeded rules used:
--   trigger_type = 'relative_to_due_date'
--   offset_days signed relative to due date (e.g. -3, 0, 3, 7, 14)
--
-- Canonical application/engine contract (findApplicableRuleForInvoice):
--   before_due | on_due | after_due with non-negative offset_days
--
-- This migration normalizes legacy data, then drops the legacy column default.
-- Safe when no legacy rows exist (UPDATE affects zero rows).
-- Does not modify rules that already use canonical trigger types.
-- ============================================================================

UPDATE public.reminder_rules
SET
  trigger_type = CASE
    WHEN offset_days < 0 THEN 'before_due'
    WHEN offset_days = 0 THEN 'on_due'
    ELSE 'after_due'
  END,
  offset_days = CASE
    WHEN offset_days < 0 THEN ABS(offset_days)
    WHEN offset_days = 0 THEN 0
    ELSE offset_days
  END,
  updated_at = NOW()
WHERE trigger_type = 'relative_to_due_date';

-- Prevent silent reintroduction of legacy trigger_type on INSERT omitting the column.
ALTER TABLE public.reminder_rules
ALTER COLUMN trigger_type DROP DEFAULT;
