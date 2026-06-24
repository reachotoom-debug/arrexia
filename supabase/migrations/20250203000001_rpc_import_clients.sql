-- ============================================================================
-- RPC Function: rpc_import_clients
-- ============================================================================
-- 
-- Executes client import with transaction-safe inserts/updates.
-- Single transaction - on any error, raises exception (rollback).
-- Uses email as the deduplication key (case-insensitive).
-- 
-- Parameters:
--   p_workspace_id UUID - Workspace ID
--   p_rows JSONB - Array of client rows as JSONB
-- 
-- JSONB row format:
-- {
--   "rowId": text (required),
--   "action": text ("insert"|"update"|"skip"),
--   "name": text (required for insert/update),
--   "email": text (optional),
--   "phone": text (optional),
--   "whatsapp": text (optional),
--   "company": text (optional),
--   "notes": text (optional),
--   "is_active": boolean (optional, default true),
--   "archived_at": text (optional, date string)
-- }
-- 
-- Returns:
--   JSONB array with objects:
--     {
--       "rowId": text,
--       "status": text ("ok" or "error"),
--       "client_id": uuid (nullable),
--       "action": text,
--       "error": text (nullable)
--     }
-- 
-- Behavior:
-- - Processes each row individually
-- - Returns a result for EVERY input row
-- - Duplicate detection by (workspace_id, lower(email)) if email present
-- - If action="insert" and email exists -> error "Email already exists" (strict)
-- - If action="update" and email exists -> update existing client
-- - If email missing -> insert new client
-- - If archived_at provided -> set it; else keep as-is on update
-- - is_active default true on insert
-- - If ANY row has error -> raise exception to rollback ALL
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
  v_phone TEXT;
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
    v_phone := NULLIF(TRIM(v_row->>'phone'), '');
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
    
    -- Normalize email to lowercase for comparison
    IF v_email IS NOT NULL THEN
      v_email := LOWER(v_email);
    END IF;
    
    -- Duplicate detection by email (if email present)
    IF v_email IS NOT NULL THEN
      -- Count existing clients with this email (workspace-scoped, case-insensitive)
      SELECT COUNT(*)
      INTO v_existing_count
      FROM public.clients
      WHERE workspace_id = p_workspace_id
        AND email IS NOT NULL
        AND LOWER(email) = v_email;
      
      IF v_existing_count > 1 THEN
        -- Multiple matches -> error
        v_error_message := 'Multiple existing clients found with this email; clean up first';
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
      ELSIF v_existing_count = 1 THEN
        -- One match found
        SELECT id
        INTO v_existing_client_id
        FROM public.clients
        WHERE workspace_id = p_workspace_id
          AND email IS NOT NULL
          AND LOWER(email) = v_email
        LIMIT 1;
        
        IF v_action = 'insert' THEN
          -- Strict behavior: insert with existing email -> error
          v_error_message := 'Email already exists';
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
        ELSIF v_action = 'update' THEN
          -- Update existing client
          -- If archived_at provided, set it; else keep as-is
          UPDATE public.clients
          SET
            name = v_name,
            email = v_email,
            phone = v_phone,
            whatsapp = v_whatsapp,
            company = v_company,
            notes = v_notes,
            is_active = v_is_active,
            archived_at = COALESCE(v_archived_at, archived_at), -- Keep existing if not provided
            updated_at = NOW()
          WHERE id = v_existing_client_id
          RETURNING id INTO v_client_id;
        END IF;
      ELSE
        -- No match -> insert new client
        INSERT INTO public.clients (
          workspace_id,
          name,
          email,
          phone,
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
          v_phone,
          v_whatsapp,
          v_company,
          v_notes,
          v_is_active,
          v_archived_at
        )
        RETURNING id INTO v_client_id;
      END IF;
    ELSE
      -- No email -> insert new client
      INSERT INTO public.clients (
        workspace_id,
        name,
        email,
        phone,
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
        v_phone,
        v_whatsapp,
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
  'Executes client import with transaction-safe inserts/updates. Single transaction - on any error, raises exception (rollback). Uses email as deduplication key (case-insensitive). Returns JSONB with rowId, status (ok|error), client_id, action, and error message.';

