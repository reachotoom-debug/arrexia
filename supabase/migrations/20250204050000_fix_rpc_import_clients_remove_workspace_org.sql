-- ============================================================================
-- Fix RPC Import Clients: Remove workspaces.organization_id query
-- ============================================================================
-- 
-- This migration fixes rpc_import_clients to:
-- - REMOVE query to public.workspaces.organization_id (column doesn't exist)
-- - REPLACE with resolution from existing clients/invoices/payments in workspace
-- - Mark rows as failed if organization_id cannot be resolved (per-row, not global)
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
  v_name TEXT;
  v_email TEXT;
  v_whatsapp TEXT;
  v_company TEXT;
  v_status TEXT;
  v_archived_at TIMESTAMPTZ;
  v_is_active BOOLEAN;
  v_notes TEXT;
  v_created_at TIMESTAMPTZ;
  
  v_client_id UUID;
  v_existing_client_id UUID;
  v_results JSONB := '[]'::JSONB;
  v_result JSONB;
  v_err TEXT;
BEGIN
  -- Check if organization_id column exists in clients table
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'clients'
      AND column_name = 'organization_id'
  ) INTO v_has_org_id;

  -- Resolve organization_id from existing workspace data (NOT from workspaces table)
  IF v_has_org_id THEN
    -- Try to get organization_id from existing clients in this workspace
    SELECT c.organization_id INTO v_org_id
    FROM public.clients c
    WHERE c.workspace_id = p_workspace_id
      AND c.organization_id IS NOT NULL
    LIMIT 1;
    
    -- If not found in clients, try invoices
    IF v_org_id IS NULL THEN
      SELECT i.organization_id INTO v_org_id
      FROM public.invoices i
      WHERE i.workspace_id = p_workspace_id
        AND i.organization_id IS NOT NULL
      LIMIT 1;
    END IF;
    
    -- If still not found, try payments
    IF v_org_id IS NULL THEN
      SELECT p.organization_id INTO v_org_id
      FROM public.payments p
      WHERE p.workspace_id = p_workspace_id
        AND p.organization_id IS NOT NULL
      LIMIT 1;
    END IF;
    
    -- IMPORTANT: do NOT raise globally.
    -- If still null, each row should return failed with:
    -- 'organization_id not resolvable for workspace'
  END IF;

  -- Process each row
  FOR r IN SELECT * FROM jsonb_array_elements(p_rows)
  LOOP
    v_err := NULL;
    v_client_id := NULL;
    v_existing_client_id := NULL;
    v_result := NULL;

    -- Extract rowId (support multiple field names)
    v_row_id := COALESCE(r->>'rowId', r->>'row_id');

    BEGIN
      -- Extract and normalize fields
      v_name := NULLIF(TRIM(r->>'name'), '');
      v_email := NULLIF(TRIM(r->>'email'), '');
      v_whatsapp := NULLIF(TRIM(COALESCE(r->>'whatsapp_phone', r->>'whatsapp')), '');
      v_company := NULLIF(TRIM(COALESCE(r->>'company_name', r->>'company')), '');
      v_status := COALESCE(NULLIF(TRIM(r->>'status'), ''), 'active');
      v_notes := NULLIF(TRIM(r->>'notes'), '');

      -- Parse timestamps
      IF r->>'created_at' IS NOT NULL AND TRIM(r->>'created_at') != '' THEN
        BEGIN
          v_created_at := (r->>'created_at')::TIMESTAMPTZ;
        EXCEPTION
          WHEN OTHERS THEN
            v_created_at := NULL;
        END;
      ELSE
        v_created_at := NULL;
      END IF;

      IF r->>'archived_at' IS NOT NULL AND TRIM(r->>'archived_at') != '' THEN
        BEGIN
          v_archived_at := (r->>'archived_at')::TIMESTAMPTZ;
        EXCEPTION
          WHEN OTHERS THEN
            v_err := 'Invalid archived_at format: ' || (r->>'archived_at');
        END;
      ELSE
        v_archived_at := NULL;
      END IF;

      -- Validate required fields
      IF v_name IS NULL OR v_name = '' THEN
        v_err := 'Name is required';
      END IF;

      -- Check organization_id requirement (if column exists and is required)
      -- IMPORTANT: do NOT raise globally. Mark this row as failed.
      IF v_has_org_id AND v_org_id IS NULL THEN
        v_result := jsonb_build_object(
          'rowId', v_row_id,
          'status', 'failed',
          'action', 'fail',
          'client_id', NULL,
          'error', 'organization_id not resolvable for workspace'
        );
        -- Append result and continue to next row (skip rest of processing)
        v_results := v_results || jsonb_build_array(v_result);
        -- Set v_result to NULL so we don't append again at the end
        v_result := NULL;
        CONTINUE;
      END IF;

      -- Normalize email (lowercase, empty => null)
      IF v_email IS NOT NULL THEN
        v_email := LOWER(v_email);
      END IF;

      -- Determine is_active from status
      IF v_status IS NULL OR v_status = '' OR LOWER(v_status) = 'active' THEN
        v_is_active := true;
      ELSE
        v_is_active := false;
      END IF;

      -- Only proceed if no validation errors
      IF v_err IS NULL THEN
        -- Find existing active client by email or whatsapp_phone
        IF v_email IS NOT NULL THEN
          SELECT id INTO v_existing_client_id
          FROM public.clients
          WHERE workspace_id = p_workspace_id
            AND archived_at IS NULL
            AND email IS NOT NULL
            AND LOWER(email) = v_email
          LIMIT 1;
        END IF;

        -- If no match by email, try by whatsapp_phone
        IF v_existing_client_id IS NULL AND v_whatsapp IS NOT NULL THEN
          SELECT id INTO v_existing_client_id
          FROM public.clients
          WHERE workspace_id = p_workspace_id
            AND archived_at IS NULL
            AND whatsapp_phone = v_whatsapp
          LIMIT 1;
        END IF;

        -- Update if exists, else insert
        IF v_existing_client_id IS NOT NULL THEN
          -- Update existing client
          IF v_has_org_id AND v_org_id IS NOT NULL THEN
            UPDATE public.clients
            SET
              workspace_id = p_workspace_id,
              organization_id = v_org_id,
              name = v_name,
              email = v_email,
              company = COALESCE(v_company, company),
              whatsapp_phone = COALESCE(v_whatsapp, whatsapp_phone),
              is_active = v_is_active,
              status = v_status,
              notes = COALESCE(v_notes, notes),
              archived_at = v_archived_at,
              updated_at = NOW()
            WHERE id = v_existing_client_id
            RETURNING id INTO v_client_id;
          ELSE
            UPDATE public.clients
            SET
              workspace_id = p_workspace_id,
              name = v_name,
              email = v_email,
              company = COALESCE(v_company, company),
              whatsapp_phone = COALESCE(v_whatsapp, whatsapp_phone),
              is_active = v_is_active,
              status = v_status,
              notes = COALESCE(v_notes, notes),
              archived_at = v_archived_at,
              updated_at = NOW()
            WHERE id = v_existing_client_id
            RETURNING id INTO v_client_id;
          END IF;
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
              notes,
              archived_at,
              created_at
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
              v_notes,
              NULL, -- archived_at must be NULL for active imports to match index
              v_created_at
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
              notes,
              archived_at,
              created_at
            )
            VALUES (
              p_workspace_id,
              v_name,
              v_email,
              v_company,
              v_whatsapp,
              v_is_active,
              v_status,
              v_notes,
              NULL, -- archived_at must be NULL for active imports to match index
              v_created_at
            )
            RETURNING id INTO v_client_id;
          END IF;
        END IF;

        -- Build success result
        v_result := jsonb_build_object(
          'rowId', v_row_id,
          'status', 'ok',
          'client_id', v_client_id,
          'error', NULL
        );
      ELSE
        -- Validation error - return failed result
        v_result := jsonb_build_object(
          'rowId', v_row_id,
          'status', 'failed',
          'client_id', NULL,
          'error', v_err
        );
      END IF;

    EXCEPTION
      WHEN OTHERS THEN
        -- Catch per-row exceptions and return as failed result
        v_result := jsonb_build_object(
          'rowId', v_row_id,
          'status', 'failed',
          'client_id', NULL,
          'error', SQLERRM
        );
    END;

    -- Append result to results array (skip if already added in CONTINUE case above)
    IF v_result IS NOT NULL THEN
      v_results := v_results || jsonb_build_array(v_result);
    END IF;
  END LOOP;

  -- Return results for ALL rows (never raise based on error_count)
  RETURN v_results;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.rpc_import_clients TO authenticated;

-- Add comment
COMMENT ON FUNCTION public.rpc_import_clients IS 
  'Executes client import with per-row error handling. Resolves organization_id from existing clients/invoices/payments in workspace (NOT from workspaces table). Returns JSONB array with results for EVERY input row: { rowId, status: ok|failed, client_id, error }. Never raises exceptions for per-row errors. Uses whatsapp_phone (not phone) and maps company_name to company column.';

