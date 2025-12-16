-- ============================================================================
-- Ensure SELECT RLS policies exist for invoices and payments tables
-- ============================================================================
-- 
-- This migration ensures that authenticated workspace members can SELECT
-- from invoices and payments tables, which is required for invoices_view
-- to work correctly.
--
-- The invoices_view depends on:
--   - invoices table (directly queried)
--   - clients table (LEFT JOIN)
--
-- While invoices_view doesn't directly query payments, payments data may
-- be used to calculate total_paid values stored in invoices table.
--
-- This migration:
--   1. Verifies/enforces SELECT policies on invoices table
--   2. Verifies/enforces SELECT policies on payments table
--   3. Keeps INSERT/UPDATE/DELETE policies unchanged
-- ============================================================================

-- ============================================================================
-- INVOICES TABLE - SELECT POLICY
-- ============================================================================
-- Ensure SELECT policy allows authenticated workspace members to read invoices
-- where workspace_id matches their memberships

-- Drop existing SELECT policy if it exists (to recreate with exact specification)
DROP POLICY IF EXISTS "invoices_select_own_workspace" ON public.invoices;

-- SELECT: Users can only read invoices from workspaces they are members of
CREATE POLICY "invoices_select_own_workspace"
  ON public.invoices
  FOR SELECT
  USING (
    workspace_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.workspace_id = invoices.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

-- ============================================================================
-- PAYMENTS TABLE - SELECT POLICY
-- ============================================================================
-- Ensure SELECT policy allows authenticated workspace members to read payments
-- where workspace_id matches their memberships

-- Drop existing SELECT policy if it exists (to recreate with exact specification)
DROP POLICY IF EXISTS "payments_select_own_workspace" ON public.payments;

-- SELECT: Users can only read payments from workspaces they are members of
CREATE POLICY "payments_select_own_workspace"
  ON public.payments
  FOR SELECT
  USING (
    workspace_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.workspace_id = payments.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

-- ============================================================================
-- SUMMARY
-- ============================================================================
--
-- This migration ensures:
--   - invoices table has SELECT policy for authenticated workspace members
--   - payments table has SELECT policy for authenticated workspace members
--   - Both policies check workspace membership via workspace_members table
--   - INSERT/UPDATE/DELETE policies remain unchanged
--
-- Pattern used: workspace_members join
--   All policies check: EXISTS (SELECT 1 FROM workspace_members WHERE workspace_id = <table>.workspace_id AND user_id = auth.uid())
--
-- ============================================================================

