-- ============================================================================
-- Fix Clients Import: Use whatsapp instead of phone
-- ============================================================================
-- 
-- This migration:
-- 1. Creates unique partial indexes for email and whatsapp deduplication
-- 2. Replaces rpc_import_clients to use whatsapp and ON CONFLICT logic
-- 
-- Changes:
-- - Remove all references to "phone" column (doesn't exist)
-- - Use whatsapp column for WhatsApp phone numbers
-- - Create unique indexes for email (case-insensitive) and whatsapp
-- - Implement ON CONFLICT upsert logic based on email or whatsapp
-- ============================================================================

-- ============================================================================
-- Step 1: Create unique partial indexes for deduplication
-- ============================================================================

-- Index for email deduplication (case-insensitive, workspace-scoped, non-archived only)
-- We'll use a generated column for case-insensitive email matching
ALTER TABLE public.clients
ADD COLUMN IF NOT EXISTS email_lc text GENERATED ALWAYS AS (lower(email)) STORED;

CREATE UNIQUE INDEX IF NOT EXISTS clients_workspace_email_unique
ON public.clients (workspace_id, email_lc)
WHERE email IS NOT NULL AND email <> '' AND archived_at IS NULL;

-- Index for whatsapp deduplication (workspace-scoped, non-archived only)
CREATE UNIQUE INDEX IF NOT EXISTS clients_workspace_whatsapp_unique
ON public.clients (workspace_id, whatsapp)
WHERE whatsapp IS NOT NULL AND whatsapp <> '' AND archived_at IS NULL;

-- ============================================================================
-- Step 2: Replace RPC function with whatsapp support
-- ============================================================================

CREATE OR REPLACE FUNCTION rpc_import_clients(
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
  v_whatsapp TEXT;
  v_company TEXT;
  v_notes TEXT;
  v_is_active BOOLEAN;
  v_archived_at TIMESTAMP WITH TIME ZONE;
  v_client_id UUID;
  v_existing_client_id UUID;
  v_existing_count INTEGER;
  v_results JSONB := '[]'::JSONB;
  v_result JSONB;
  v_error_message TEXT;
  v_error_count INTEGER := 0;
BEGIN
  -- Loop through each row in the JSONB array
  FOR v_row IN SELECT * FROM jsonb_array_elements(p_rows)
  LOOP
    -- Initialize per-row variables
    v_client_id := NULL;
    v_error_message := NULL;
    
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
    v_name := TRIM(v_row->>'name');
    v_email := NULLIF(TRIM(v_row->>'email'), '');
    v_whatsapp := NULLIF(TRIM(v_row->>'whatsapp'), '');
    v_company := NULLIF(TRIM(v_row->>'company'), '');
    v_notes := NULLIF(TRIM(v_row->>'notes'), '');
    v_is_active := COALESCE((v_row->>'is_active')::BOOLEAN, true);
    
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
    
    -- Normalize email to lowercase for comparison (stored in email_lc generated column)
    IF v_email IS NOT NULL THEN
      v_email := LOWER(v_email);
    END IF;
    
    -- Process row based on available deduplication keys
    -- Priority: email first, then whatsapp, else insert new
    
    BEGIN
      IF v_email IS NOT NULL THEN
        -- Try upsert by email using ON CONFLICT
        INSERT INTO public.clients (
          workspace_id,
          name,
          email,
          whatsapp,
          company,
          notes,
          is_active,
          archived_at
        )
        VALUES (
          p_workspace_id,
          v_name,
          v_email,
          v_whatsapp,
          v_company,
          v_notes,
          v_is_active,
          v_archived_at
        )
        ON CONFLICT (workspace_id, email_lc) 
        DO UPDATE SET
          name = EXCLUDED.name,
          email = EXCLUDED.email,
          whatsapp = COALESCE(EXCLUDED.whatsapp, clients.whatsapp),
          company = COALESCE(EXCLUDED.company, clients.company),
          notes = COALESCE(EXCLUDED.notes, clients.notes),
          is_active = EXCLUDED.is_active,
          archived_at = COALESCE(EXCLUDED.archived_at, clients.archived_at),
          updated_at = NOW()
        RETURNING id INTO v_client_id;
        
      ELSIF v_whatsapp IS NOT NULL THEN
        -- Try upsert by whatsapp using ON CONFLICT
        INSERT INTO public.clients (
          workspace_id,
          name,
          email,
          whatsapp,
          company,
          notes,
          is_active,
          archived_at
        )
        VALUES (
          p_workspace_id,
          v_name,
          NULL,
          v_whatsapp,
          v_company,
          v_notes,
          v_is_active,
          v_archived_at
        )
        ON CONFLICT (workspace_id, whatsapp)
        DO UPDATE SET
          name = EXCLUDED.name,
          email = COALESCE(EXCLUDED.email, clients.email),
          whatsapp = EXCLUDED.whatsapp,
          company = COALESCE(EXCLUDED.company, clients.company),
          notes = COALESCE(EXCLUDED.notes, clients.notes),
          is_active = EXCLUDED.is_active,
          archived_at = COALESCE(EXCLUDED.archived_at, clients.archived_at),
          updated_at = NOW()
        RETURNING id INTO v_client_id;
        
      ELSE
        -- No email or whatsapp -> insert new client
        INSERT INTO public.clients (
          workspace_id,
          name,
          email,
          whatsapp,
          company,
          notes,
          is_active,
          archived_at
        )
        VALUES (
          p_workspace_id,
          v_name,
          NULL,
          NULL,
          v_company,
          v_notes,
          v_is_active,
          v_archived_at
        )
        RETURNING id INTO v_client_id;
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
GRANT EXECUTE ON FUNCTION rpc_import_clients TO authenticated;

-- Add comment
COMMENT ON FUNCTION rpc_import_clients IS 
  'Executes client import with transaction-safe inserts/updates. Uses whatsapp (not phone). Upserts by email (case-insensitive) or whatsapp using ON CONFLICT. Single transaction - on any error, raises exception (rollback). Returns JSONB with rowId, status (ok|error), client_id, action, and error message.';

