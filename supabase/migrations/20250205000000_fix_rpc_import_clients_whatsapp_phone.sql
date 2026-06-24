-- ============================================================================
-- Fix RPC Import Clients: Use whatsapp_phone + update-if-exists-else-insert
-- ============================================================================
-- 
-- This migration replaces rpc_import_clients with:
-- - Uses whatsapp_phone (not phone)
-- - Uses company_name (maps to company column)
-- - Update-if-exists-else-insert logic (no ON CONFLICT)
-- - Checks for duplicates by email (case-insensitive) or whatsapp_phone
-- - Includes organization_id if column exists
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
  v_row JSONB;
  v_row_id TEXT;
  v_action TEXT;
  v_name TEXT;
  v_email TEXT;
  v_whatsapp_phone TEXT;
  v_company_name TEXT;
  v_status TEXT;
  v_archived_at TIMESTAMP WITH TIME ZONE;
  v_client_id UUID;
  v_existing_client_id UUID;
  v_results JSONB := '[]'::JSONB;
  v_result JSONB;
  v_error_message TEXT;
  v_error_count INTEGER := 0;
  v_org_id UUID;
  v_has_org_id BOOLEAN;
  v_is_active BOOLEAN;
BEGIN
  -- Check if organization_id column exists in clients table
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'clients'
      AND column_name = 'organization_id'
  ) INTO v_has_org_id;

  -- Resolve organization_id from workspace if column exists
  IF v_has_org_id THEN
    SELECT organization_id INTO v_org_id
    FROM public.workspaces
    WHERE id = p_workspace_id;
  END IF;

  -- Loop through each row in the JSONB array
  FOR v_row IN SELECT * FROM jsonb_array_elements(p_rows)
  LOOP
    -- Initialize per-row variables
    v_client_id := NULL;
    v_error_message := NULL;
    v_existing_client_id := NULL;
    
    -- Extract rowId (required)
    v_row_id := v_row->>'rowId';
    IF v_row_id IS NULL OR v_row_id = '' THEN
      v_error_message := 'Missing rowId';
      v_error_count := v_error_count + 1;
      v_result := jsonb_build_object(
        'rowId', COALESCE(v_row_id, 'unknown'),
        'status', 'error',
        'client_id', NULL,
        'action', COALESCE(v_row->>'action', 'unknown'),
        'error', v_error_message
      );
      v_results := v_results || jsonb_build_array(v_result);
      CONTINUE;
    END IF;
    
    -- Extract action
    v_action := COALESCE(v_row->>'action', 'insert');
    
    -- Handle skip action
    IF v_action = 'skip' THEN
      v_result := jsonb_build_object(
        'rowId', v_row_id,
        'status', 'ok',
        'client_id', NULL,
        'action', 'skip',
        'error', NULL
      );
      v_results := v_results || jsonb_build_array(v_result);
      CONTINUE;
    END IF;
    
    -- Extract and validate fields
    v_name := NULLIF(TRIM(v_row->>'name'), '');
    v_email := NULLIF(TRIM(v_row->>'email'), '');
    v_whatsapp_phone := NULLIF(TRIM(v_row->>'whatsapp_phone'), '');
    v_company_name := NULLIF(TRIM(v_row->>'company_name'), '');
    v_status := NULLIF(TRIM(v_row->>'status'), '');
    
    -- Parse archived_at if provided
    IF v_row->>'archived_at' IS NOT NULL AND TRIM(v_row->>'archived_at') != '' THEN
      BEGIN
        v_archived_at := (v_row->>'archived_at')::TIMESTAMP WITH TIME ZONE;
      EXCEPTION
        WHEN OTHERS THEN
          v_error_message := 'Invalid archived_at format: ' || (v_row->>'archived_at');
          v_error_count := v_error_count + 1;
          v_result := jsonb_build_object(
            'rowId', v_row_id,
            'status', 'error',
            'client_id', NULL,
            'action', v_action,
            'error', v_error_message
          );
          v_results := v_results || jsonb_build_array(v_result);
          CONTINUE;
      END;
    ELSE
      v_archived_at := NULL;
    END IF;
    
    -- Validate name (required for insert/update)
    IF v_name IS NULL OR v_name = '' THEN
      v_error_message := 'Name is required';
      v_error_count := v_error_count + 1;
      v_result := jsonb_build_object(
        'rowId', v_row_id,
        'status', 'error',
        'client_id', NULL,
        'action', v_action,
        'error', v_error_message
      );
      v_results := v_results || jsonb_build_array(v_result);
      CONTINUE;
    END IF;
    
    -- Normalize email to lowercase for comparison
    IF v_email IS NOT NULL THEN
      v_email := LOWER(v_email);
    END IF;
    
    -- Determine is_active from status
    -- Default to true if status is empty or "active", false if "inactive" or "archived"
    IF v_status IS NULL OR v_status = '' OR LOWER(v_status) = 'active' THEN
      v_is_active := true;
    ELSE
      v_is_active := false;
    END IF;

    BEGIN
      -- Find existing active client by email (case-insensitive) if email provided
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
      IF v_existing_client_id IS NULL AND v_whatsapp_phone IS NOT NULL THEN
        SELECT id INTO v_existing_client_id
        FROM public.clients
        WHERE workspace_id = p_workspace_id
          AND archived_at IS NULL
          AND whatsapp_phone = v_whatsapp_phone
        LIMIT 1;
      END IF;

      -- Update if exists, else insert
      IF v_existing_client_id IS NOT NULL THEN
        -- Update existing client
        UPDATE public.clients
        SET
          name = v_name,
          email = COALESCE(v_email, email),
          whatsapp_phone = COALESCE(v_whatsapp_phone, whatsapp_phone),
          company = COALESCE(v_company_name, company),
          is_active = v_is_active,
          status = COALESCE(v_status, status, 'active'),
          archived_at = COALESCE(v_archived_at, archived_at),
          updated_at = NOW()
        WHERE id = v_existing_client_id
        RETURNING id INTO v_client_id;
      ELSE
        -- Insert new client
        IF v_has_org_id AND v_org_id IS NOT NULL THEN
          INSERT INTO public.clients (
            workspace_id,
            organization_id,
            name,
            email,
            whatsapp_phone,
            company,
            is_active,
            status,
            archived_at
          )
          VALUES (
            p_workspace_id,
            v_org_id,
            v_name,
            v_email,
            v_whatsapp_phone,
            v_company_name,
            v_is_active,
            COALESCE(v_status, 'active'),
            v_archived_at
          )
          RETURNING id INTO v_client_id;
        ELSE
          INSERT INTO public.clients (
            workspace_id,
            name,
            email,
            whatsapp_phone,
            company,
            is_active,
            status,
            archived_at
          )
          VALUES (
            p_workspace_id,
            v_name,
            v_email,
            v_whatsapp_phone,
            v_company_name,
            v_is_active,
            COALESCE(v_status, 'active'),
            v_archived_at
          )
          RETURNING id INTO v_client_id;
        END IF;
      END IF;

      -- Build success result
      v_result := jsonb_build_object(
        'rowId', v_row_id,
        'status', 'ok',
        'client_id', v_client_id,
        'action', v_action,
        'error', NULL
      );
      
      v_results := v_results || jsonb_build_array(v_result);
      
    EXCEPTION
      WHEN OTHERS THEN
        -- Catch per-row errors and accumulate
        v_error_message := SQLERRM;
        v_error_count := v_error_count + 1;
        v_result := jsonb_build_object(
          'rowId', v_row_id,
          'status', 'error',
          'client_id', NULL,
          'action', v_action,
          'error', v_error_message
        );
        v_results := v_results || jsonb_build_array(v_result);
    END;
  END LOOP;
  
  -- Transaction safety: if ANY error occurred, raise exception to rollback ALL
  IF v_error_count > 0 THEN
    RAISE EXCEPTION 'Import failed with % errors', v_error_count;
  END IF;
  
  -- Return JSONB array of results
  RETURN v_results;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.rpc_import_clients TO authenticated;

-- Add comment
COMMENT ON FUNCTION public.rpc_import_clients IS 
  'Executes client import with transaction-safe inserts/updates. Uses whatsapp_phone (not phone) and company_name (maps to company). Update-if-exists-else-insert logic: checks for duplicates by email (case-insensitive) or whatsapp_phone, then updates if found, else inserts. Single transaction - on any error, raises exception (rollback). Returns JSONB with rowId, status (ok|error), client_id, action, and error message.';

