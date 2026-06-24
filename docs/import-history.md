# Import RPC Functions - Migration History

This document catalogs all migrations related to the three import RPC functions:
- `rpc_import_clients`
- `rpc_import_invoices`
- `rpc_import_payments`

**Purpose**: Documentation only. These migrations are preserved for historical reference and should NOT be deleted.

---

## rpc_import_clients

### 20250203000001_rpc_import_clients.sql
**What it fixed**: Initial creation of `rpc_import_clients` function.
**Why it existed**: First implementation with transaction-safe inserts/updates. Used email as deduplication key (case-insensitive). Raised exceptions on any error (all-or-nothing rollback).

### 20250203000002_verify_rpc_import_clients.sql
**What it fixed**: Verification query to check if function exists.
**Why it existed**: Diagnostic migration to verify function creation in Supabase SQL Editor.

### 20250204000000_fix_clients_import_whatsapp_phone.sql
**What it fixed**: Changed from `phone` column to `whatsapp` column. Created unique partial indexes for email and whatsapp deduplication. Implemented ON CONFLICT upsert logic.
**Why it existed**: The `clients` table uses `whatsapp` (not `phone`). Needed proper deduplication indexes and upsert behavior.

### 20250204010000_rpc_import_clients_v2.sql
**What it fixed**: Return per-row errors instead of raising exceptions. Changed to never raise exceptions for per-row errors (only for fatal conditions). Used ON CONFLICT with unique indexes for upsert logic. Added organization_id support.
**Why it existed**: Original function raised exceptions on any error, causing full rollback. Needed granular error handling per row.

### 20250204020000_rpc_import_clients_fix_org_resolution.sql
**What it fixed**: Resolved organization_id from existing workspace data (clients/invoices/payments) instead of querying workspaces table.
**Why it existed**: The `workspaces` table does not have an `organization_id` column. Needed to resolve it from existing data in the workspace.

### 20250204023000_fix_rpc_import_clients_no_workspace_org.sql
**What it fixed**: Removed query to `workspaces.organization_id` (column doesn't exist). Replaced with resolution from existing clients/invoices/payments in workspace.
**Why it existed**: Same as above - workspaces table doesn't have organization_id column.

### 20250204030000_fix_rpc_import_clients_org_resolution.sql
**What it fixed**: Resolved organization_id from workspace data (NOT from workspaces table). Used whatsapp_phone (not phone).
**Why it existed**: Continued refinement of organization_id resolution logic.

### 20250204050000_fix_rpc_import_clients_remove_workspace_org.sql
**What it fixed**: Removed workspaces.organization_id query. Resolved organization_id from existing clients/invoices/payments in workspace. Marked rows as failed if organization_id cannot be resolved (per-row, not global).
**Why it existed**: Final fix to ensure organization_id is never queried from workspaces table.

### 20250204060000_force_replace_rpc_import_clients.sql
**What it fixed**: Final version that resolves organization_id WITHOUT workspaces table. Uses whatsapp (not whatsapp_phone). Matches existing clients by email or whatsapp. Returns action: insert|update|fail.
**Why it existed**: Unified final version before the canonical migration. Fixed column name mismatch (whatsapp vs whatsapp_phone).

### 20250205000000_fix_rpc_import_clients_whatsapp_phone.sql
**What it fixed**: Used whatsapp_phone + update-if-exists-else-insert logic (no ON CONFLICT). Included organization_id if column exists.
**Why it existed**: Attempted to use whatsapp_phone column name, but later migrations confirmed the column is actually `whatsapp`.

### 20250205000001_fix_rpc_import_clients_row_errors.sql
**What it fixed**: Return per-row errors instead of raising exceptions. Each result includes: { rowId, status: 'ok'|'failed', client_id, action, error }.
**Why it existed**: Improved error handling to return results for every row instead of throwing exceptions.

---

## rpc_import_invoices

### 20250204090000_rpc_import_invoices.sql
**What it fixed**: Initial creation of `rpc_import_invoices` function. Created unique partial index on (workspace_id, invoice_number) where archived_at IS NULL. Transaction-safe invoice + items import (commit together).
**Why it existed**: First implementation for importing invoices with items. Each element in p_rows represents ONE invoice group with items array.

### 20260103124742_force_replace_rpc_import_invoices.sql
**What it fixed**: Dropped all existing overloads and created canonical function. All-or-nothing: if ANY invoice group fails, rollback everything. Resolved client by email first, then name. Upsert invoices, replace items.
**Why it existed**: Unified function signature and behavior. Removed references to deprecated columns (total_paid, outstanding_amount, payment_state).

### 20260106120001_revoke_legacy_rpc_import_invoices.sql
**What it fixed**: Revoked execute permission on legacy rpc_import_invoices function.
**Why it existed**: Hardened against accidental legacy usage. The new function `import_invoices_grouped` should be used instead (though this migration predates that).

---

## rpc_import_payments

### 20250202000002_rpc_import_payments.sql
**What it fixed**: Initial creation of `rpc_import_payments` function. Used transaction_id as deduplication key. Resolved invoice_id by invoice_number (workspace scoped). client_id comes from invoice, not CSV.
**Why it existed**: First implementation for importing payments from CSV/TSV. Per-row error handling with results for every input row.

### 20260104190000_fix_rpc_import_payments_net_amount.sql
**What it fixed**: Removed net_amount from INSERT (let DB default or compute it). Removed transaction_fee from INSERT (let DB default). Added organization_id support if column exists.
**Why it existed**: `payments.net_amount` is a GENERATED ALWAYS column and cannot be inserted. Function was trying to insert it, causing errors.

### 20260106150000_fix_rpc_import_payments_net_amount.sql
**What it fixed**: Canonical unified function. Signature: (p_workspace_id uuid, p_rows jsonb, p_dry_run boolean DEFAULT false). NEVER references net_amount in INSERT/UPDATE. Returns structured JSONB with ok, dry_run, rows_received, inserted, skipped, errors, results array.
**Why it existed**: Unified all payment import logic into one canonical function. Fixed parameter order (default parameters must come after non-default). Renamed output column from "row" to "row_index" to avoid reserved word.

### 20260106170000_fix_payments_import_net_amount.sql
**What it fixed**: Placeholder migration (already exists on remote).
**Why it existed**: Kept locally so Supabase CLI migration history matches remote.

### 20260106210000_fix_payments_import_net_amount_v2.sql
**What it fixed**: NO-OP migration. Function already unified in 20260106150000.
**Why it existed**: Prevented duplicate function definitions. Marked as no-op to avoid conflicts.

### 20260106211000_fix_rpc_import_payments_v2.sql
**What it fixed**: NO-OP migration. Function already unified in 20260106150000.
**Why it existed**: Prevented duplicate function definitions. Marked as no-op to avoid conflicts.

### 20260107000000_fix_rpc_import_payments_net_amount.sql
**What it fixed**: NO-OP migration. Function already unified in 20260106150000.
**Why it existed**: Prevented duplicate function definitions. Marked as no-op to avoid conflicts.

### 20260107130000_unify_rpc_import_payments.sql
**What it fixed**: NO-OP migration. Function already unified in 20260106150000.
**Why it existed**: Prevented duplicate function definitions. Marked as no-op to avoid conflicts.

### 20260106225021_rpc_import_payments_wrapper.sql
**What it fixed**: NO-OP migration. Function already defined correctly in earlier migrations.
**Why it existed**: Wrapper kept for migration history but does nothing.

### 20260120000000_fix_rpc_import_payments_signature.sql
**What it fixed**: NO-OP migration. Function already unified in 20260106150000.
**Why it existed**: Prevented duplicate function definitions. Marked as no-op to avoid conflicts.

---

## Final Canonical Migration

### 20260108_000000_finalize_all_import_rpcs.sql
**What it fixed**: **FINAL, canonical unified functions** for all three import RPCs. Each function:
- Signature: `(p_workspace_id UUID, p_rows JSONB)`
- Returns: JSONB array of `{ rowId, status: ok|failed, entity_id, action, error }`
- NEVER raises exceptions for row-level errors
- Validates workspace existence ONCE at the top
- All financial math computed in SQL
- One transaction per function call
- GRANT EXECUTE to authenticated
- COMMENT describing exact behavior
- No dry_run, no optional parameters, no versioning

**Why it existed**: This migration represents the **FINAL import contract**. All previous migrations are historical. This is the single source of truth for import behavior going forward.

---

## Summary

**Total migrations**: 24 files
- **rpc_import_clients**: 11 migrations
- **rpc_import_invoices**: 3 migrations
- **rpc_import_payments**: 10 migrations

**Evolution pattern**:
1. Initial implementations with transaction rollback on errors
2. Gradual shift to per-row error handling (no exceptions)
3. Fixes for column name mismatches (whatsapp vs whatsapp_phone, phone)
4. Organization_id resolution fixes (workspaces table doesn't have it)
5. Net_amount fixes (GENERATED ALWAYS column)
6. Signature unification (parameter order, return format)
7. Final canonical migration consolidating all three functions

**Key lessons**:
- Never query `workspaces.organization_id` (column doesn't exist)
- Never insert into `payments.net_amount` (GENERATED ALWAYS)
- Always validate workspace existence once at the top
- Always return per-row results, never raise exceptions for row-level errors
- All financial math must be computed in SQL, never passed in

