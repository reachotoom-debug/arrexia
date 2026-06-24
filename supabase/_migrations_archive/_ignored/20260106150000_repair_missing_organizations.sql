-- ============================================================================
-- Repair missing organizations for workspaces
-- ============================================================================
-- 
-- This migration fixes FK constraint violations where workspaces.organization_id
-- references organizations.id, but the organization row doesn't exist.
-- 
-- For any workspace.organization_id that doesn't exist in organizations:
-- - Insert a new organization with:
--   - id = workspace.organization_id
--   - name = COALESCE(workspaces.name, 'Organization')
--   - created_at/updated_at = now()
-- - Use ON CONFLICT DO NOTHING to avoid errors if organization already exists
-- - Idempotent and safe to re-run
-- 
-- ============================================================================

INSERT INTO organizations (id, name, created_at, updated_at)
SELECT DISTINCT 
  w.organization_id, 
  COALESCE(w.name, 'Organization'),
  NOW(),
  NOW()
FROM workspaces w
LEFT JOIN organizations o ON o.id = w.organization_id
WHERE w.organization_id IS NOT NULL
  AND o.id IS NULL
ON CONFLICT (id) DO NOTHING;
