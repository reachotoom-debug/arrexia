-- ============================================================================
-- Fix RPC Import Clients: Remove workspaces.organization_id query
-- ============================================================================
-- 
-- This migration fixes rpc_import_clients to:
-- - NEVER query workspaces.organization_id (column doesn't exist)
-- - Resolve organization_id from existing clients/invoices/payments in workspace
-- - Mark rows as failed if organization_id cannot be resolved (per-row, not global)
-- - Use ON CONFLICT with partial unique indexes for upsert logic
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
  v_whatsapp_phone TEXT;
  v_company TEXT;
  v_status TEXT;
  v_archived_at TIMESTAMPTZ;
  v_is_active BOOLEAN;
  v_notes TEXT;
  v_created_at TIMESTAMPTZ;
  
  v_client_id UUID;
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
    SELECT organization_id INTO v_org_id
    FROM public.clients
    WHERE workspace_id = p_workspace_id
      AND organization_id IS NOT NULL
    LIMIT 1;
    
    -- If not found in clients, try invoices
    IF v_org_id IS NULL THEN
      SELECT organization_id INTO v_org_id
      FROM public.invoices
      WHERE workspace_id = p_workspace_id
        AND organization_id IS NOT NULL
      LIMIT 1;
    END IF;
    
    -- If still not found, try payments
    IF v_org_id IS NULL THEN
      SELECT organization_id INTO v_org_id
      FROM public.payments
      WHERE workspace_id = p_workspace_id
        AND organization_id IS NOT NULL
      LIMIT 1;
    END IF;
    
    -- If still null, we'll mark each row as failed (per-row, not global exception)
  END IF;

  -- Process each row
  FOR r IN SELECT * FROM jsonb_array_elements(p_rows)
  LOOP
    v_err := NULL;
    v_client_id := NULL;

    -- Extract rowId (support multiple field names)
    v_row_id := COALESCE(r->>'rowId', r->>'row_id');

    BEGIN
      -- Extract and normalize fields
      v_name := NULLIF(TRIM(r->>'name'), '');
      v_email := NULLIF(TRIM(r->>'email'), '');
      v_whatsapp_phone := NULLIF(TRIM(COALESCE(r->>'whatsapp_phone', r->>'whatsapp')), '');
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
      IF v_has_org_id AND v_org_id IS NULL THEN
        v_err := 'organization_id not resolvable for workspace';
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
        -- Upsert logic based on available deduplication keys
        -- Priority: email first, then whatsapp_phone
        
        IF v_email IS NOT NULL THEN
          -- Upsert by email using ON CONFLICT with email_lc generated column
          -- The partial unique index automatically handles WHERE archived_at IS NULL
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
              v_whatsapp_phone,
              v_is_active,
              v_status,
              v_notes,
              NULL, -- archived_at must be NULL for active imports to match index
              v_created_at
            )
            ON CONFLICT (workspace_id, email_lc)
            DO UPDATE SET
              name = EXCLUDED.name,
              email = EXCLUDED.email,
              company = COALESCE(EXCLUDED.company, clients.company),
              whatsapp_phone = COALESCE(EXCLUDED.whatsapp_phone, clients.whatsapp_phone),
              is_active = EXCLUDED.is_active,
              status = EXCLUDED.status,
              notes = COALESCE(EXCLUDED.notes, clients.notes),
              archived_at = EXCLUDED.archived_at,
              updated_at = NOW()
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
              v_whatsapp_phone,
              v_is_active,
              v_status,
              v_notes,
              NULL, -- archived_at must be NULL for active imports to match index
              v_created_at
            )
            ON CONFLICT (workspace_id, email_lc)
            DO UPDATE SET
              name = EXCLUDED.name,
              email = EXCLUDED.email,
              company = COALESCE(EXCLUDED.company, clients.company),
              whatsapp_phone = COALESCE(EXCLUDED.whatsapp_phone, clients.whatsapp_phone),
              is_active = EXCLUDED.is_active,
              status = EXCLUDED.status,
              notes = COALESCE(EXCLUDED.notes, clients.notes),
              archived_at = EXCLUDED.archived_at,
              updated_at = NOW()
            RETURNING id INTO v_client_id;
          END IF;
          
        ELSIF v_whatsapp_phone IS NOT NULL THEN
          -- Upsert by whatsapp_phone using ON CONFLICT
          -- The partial unique index automatically handles WHERE archived_at IS NULL
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
              NULL,
              v_company,
              v_whatsapp_phone,
              v_is_active,
              v_status,
              v_notes,
              NULL, -- archived_at must be NULL for active imports to match index
              v_created_at
            )
            ON CONFLICT (workspace_id, whatsapp_phone)
            DO UPDATE SET
              name = EXCLUDED.name,
              email = COALESCE(EXCLUDED.email, clients.email),
              company = COALESCE(EXCLUDED.company, clients.company),
              whatsapp_phone = EXCLUDED.whatsapp_phone,
              is_active = EXCLUDED.is_active,
              status = EXCLUDED.status,
              notes = COALESCE(EXCLUDED.notes, clients.notes),
              archived_at = EXCLUDED.archived_at,
              updated_at = NOW()
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
              NULL,
              v_company,
              v_whatsapp_phone,
              v_is_active,
              v_status,
              v_notes,
              NULL, -- archived_at must be NULL for active imports to match index
              v_created_at
            )
            ON CONFLICT (workspace_id, whatsapp_phone)
            DO UPDATE SET
              name = EXCLUDED.name,
              email = COALESCE(EXCLUDED.email, clients.email),
              company = COALESCE(EXCLUDED.company, clients.company),
              whatsapp_phone = EXCLUDED.whatsapp_phone,
              is_active = EXCLUDED.is_active,
              status = EXCLUDED.status,
              notes = COALESCE(EXCLUDED.notes, clients.notes),
              archived_at = EXCLUDED.archived_at,
              updated_at = NOW()
            RETURNING id INTO v_client_id;
          END IF;
          
        ELSE
          -- No deduplication key (no email, no whatsapp_phone) - plain INSERT
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
              NULL,
              v_company,
              NULL,
              v_is_active,
              v_status,
              v_notes,
              v_archived_at,
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
              NULL,
              v_company,
              NULL,
              v_is_active,
              v_status,
              v_notes,
              v_archived_at,
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

    -- Append result to results array
    v_results := v_results || jsonb_build_array(v_result);
  END LOOP;

  -- Return results for ALL rows (never raise based on error_count)
  RETURN v_results;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.rpc_import_clients TO authenticated;

-- Add comment
COMMENT ON FUNCTION public.rpc_import_clients IS 
  'Executes client import with per-row error handling. Resolves organization_id from existing clients/invoices/payments in workspace (NOT from workspaces table). Returns JSONB array with results for EVERY input row: { rowId, status: ok|failed, client_id, error }. Never raises exceptions for per-row errors. Uses ON CONFLICT with partial unique indexes for upsert logic. Uses whatsapp_phone (not phone) and maps company_name to company column.';

