-- ============================================================================
-- Fix RPC Import Clients: Return per-row errors instead of raising exceptions
-- ============================================================================
-- 
-- This migration fixes rpc_import_clients to:
-- - NEVER raise exceptions for per-row errors (only for fatal conditions)
-- - Return a JSONB array with results for EVERY input row
-- - Each result includes: { rowId, status: 'ok'|'failed', client_id, action, error }
-- - Only raise for truly fatal conditions (workspace not found)
-- 
-- ============================================================================

CREATE OR REPLACE FUNCTION public.rpc_import_clients(
  p_workspace_id UUID,
  p_rows JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  r JSONB;
  v_org_id UUID;
  v_has_org_id BOOLEAN;
  
  v_row_id TEXT;
  v_client_id UUID;
  
  v_name TEXT;
  v_email TEXT;
  v_company TEXT;
  v_whatsapp TEXT;
  v_status TEXT;
  v_archived_at TIMESTAMPTZ;
  v_is_active BOOLEAN;
  
  results JSONB := '[]'::JSONB;
  result JSONB;
  err TEXT;
BEGIN
  -- Check if organization_id column exists in clients table
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'clients'
      AND column_name = 'organization_id'
  ) INTO v_has_org_id;

  -- Resolve organization_id from workspace (fatal if workspace not found)
  IF v_has_org_id THEN
    SELECT w.organization_id INTO v_org_id
    FROM public.workspaces w
    WHERE w.id = p_workspace_id;
    
    IF v_org_id IS NULL THEN
      RAISE EXCEPTION 'Workspace % not found or organization_id is null', p_workspace_id;
    END IF;
  END IF;

  -- Process each row
  FOR r IN SELECT * FROM jsonb_array_elements(p_rows)
  LOOP
    err := NULL;
    v_client_id := NULL;

    -- Extract rowId (support multiple field names)
    v_row_id := COALESCE(r->>'rowId', r->>'row_id', r->>'id');

    BEGIN
      -- Extract and validate fields
      v_name := NULLIF(TRIM(r->>'name'), '');
      IF v_name IS NULL OR v_name = '' THEN
        err := 'Name is required';
      END IF;

      v_email := NULLIF(TRIM(r->>'email'), '');
      IF v_email IS NOT NULL THEN
        v_email := LOWER(v_email);
      END IF;

      -- Map company_name or company to company column
      v_company := NULLIF(TRIM(COALESCE(r->>'company_name', r->>'company')), '');
      
      -- Map whatsapp_phone or whatsapp to whatsapp_phone column
      v_whatsapp := NULLIF(TRIM(COALESCE(r->>'whatsapp_phone', r->>'whatsapp')), '');

      v_status := COALESCE(NULLIF(TRIM(r->>'status'), ''), 'active');
      
      -- Determine is_active from status
      IF v_status IS NULL OR v_status = '' OR LOWER(v_status) = 'active' THEN
        v_is_active := true;
      ELSE
        v_is_active := false;
      END IF;

      -- Parse archived_at if provided
      IF r->>'archived_at' IS NOT NULL AND TRIM(r->>'archived_at') != '' THEN
        BEGIN
          v_archived_at := (r->>'archived_at')::TIMESTAMPTZ;
        EXCEPTION
          WHEN OTHERS THEN
            err := 'Invalid archived_at format: ' || (r->>'archived_at');
        END;
      ELSE
        v_archived_at := NULL;
      END IF;

      -- Only proceed if no validation errors
      IF err IS NULL THEN
        -- Find existing active client by email first (case-insensitive)
        IF v_email IS NOT NULL THEN
          SELECT c.id INTO v_client_id
          FROM public.clients c
          WHERE c.workspace_id = p_workspace_id
            AND c.archived_at IS NULL
            AND c.email IS NOT NULL
            AND LOWER(c.email) = v_email
          LIMIT 1;
        END IF;

        -- If no match by email, try by whatsapp_phone
        IF v_client_id IS NULL AND v_whatsapp IS NOT NULL THEN
          SELECT c.id INTO v_client_id
          FROM public.clients c
          WHERE c.workspace_id = p_workspace_id
            AND c.archived_at IS NULL
            AND c.whatsapp_phone = v_whatsapp
          LIMIT 1;
        END IF;

        -- Update if exists, else insert
        IF v_client_id IS NOT NULL THEN
          -- Update existing client
          UPDATE public.clients
          SET
            name = v_name,
            email = COALESCE(v_email, email),
            company = COALESCE(v_company, company),
            whatsapp_phone = COALESCE(v_whatsapp, whatsapp_phone),
            is_active = v_is_active,
            status = COALESCE(v_status, status, 'active'),
            archived_at = COALESCE(v_archived_at, archived_at),
            updated_at = NOW()
          WHERE id = v_client_id
          RETURNING id INTO v_client_id;

          result := jsonb_build_object(
            'rowId', v_row_id,
            'status', 'ok',
            'action', 'update',
            'client_id', v_client_id,
            'error', NULL
          );
        ELSE
          -- Insert new client
          IF v_has_org_id AND v_org_id IS NOT NULL THEN
            INSERT INTO public.clients (
              workspace_id,
              organization_id,
              name,
              email,
              company,
              whatsapp_phone,
              is_active,
              status,
              archived_at
            )
            VALUES (
              p_workspace_id,
              v_org_id,
              v_name,
              v_email,
              v_company,
              v_whatsapp,
              v_is_active,
              v_status,
              v_archived_at
            )
            RETURNING id INTO v_client_id;
          ELSE
            INSERT INTO public.clients (
              workspace_id,
              name,
              email,
              company,
              whatsapp_phone,
              is_active,
              status,
              archived_at
            )
            VALUES (
              p_workspace_id,
              v_name,
              v_email,
              v_company,
              v_whatsapp,
              v_is_active,
              v_status,
              v_archived_at
            )
            RETURNING id INTO v_client_id;
          END IF;

          result := jsonb_build_object(
            'rowId', v_row_id,
            'status', 'ok',
            'action', 'insert',
            'client_id', v_client_id,
            'error', NULL
          );
        END IF;
      ELSE
        -- Validation error - return failed result
        result := jsonb_build_object(
          'rowId', v_row_id,
          'status', 'failed',
          'action', 'fail',
          'client_id', NULL,
          'error', err
        );
      END IF;

    EXCEPTION
      WHEN OTHERS THEN
        -- Catch per-row exceptions and return as failed result
        result := jsonb_build_object(
          'rowId', v_row_id,
          'status', 'failed',
          'action', 'fail',
          'client_id', NULL,
          'error', SQLERRM
        );
    END;

    -- Append result to results array
    results := results || jsonb_build_array(result);
  END LOOP;

  -- Return results for ALL rows (never raise based on error_count)
  RETURN results;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.rpc_import_clients TO authenticated;

-- Add comment
COMMENT ON FUNCTION public.rpc_import_clients IS 
  'Executes client import with per-row error handling. Returns JSONB array with results for EVERY input row: { rowId, status: ok|failed, action: insert|update|fail, client_id, error }. Never raises exceptions for per-row errors; only raises for fatal conditions (workspace not found). Uses whatsapp_phone (not phone) and maps company_name to company column.';

