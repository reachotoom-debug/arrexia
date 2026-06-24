# Risk Logic Audit Report - FlowCollect

**Date**: 2025-01-XX  
**Scope**: Invoice risk logic consistency across Invoices, Collections, Reminders, and Dashboard modules

---

## Executive Summary

The audit found that **most modules correctly use `invoices_view.risk_level` as the single source of truth**. However, there are some discrepancies in:
1. **Unused/outdated TypeScript helper functions** with different risk thresholds
2. **Outdated comments** in helper files
3. **Client filtering inconsistencies** across modules (active/inactive client handling)

---

## 1. Canonical Source of Truth

### Location
**File**: `supabase/migrations/20260109000000_fix_invoices_view_exclude_archived.sql`  
**Column**: `invoices_view.risk_level`

### Definition
The canonical risk definition is in the SQL view `invoices_view`:

```sql
CASE
  -- Only calculate risk for overdue invoices (display_status = 'overdue')
  WHEN display_status <> 'overdue' THEN NULL
  -- Calculate risk based on overdue_days and outstanding amount
  WHEN overdue_days >= 60 OR outstanding >= 5000 THEN 'high'
  WHEN overdue_days BETWEEN 15 AND 59 THEN 'medium'
  WHEN overdue_days BETWEEN 1 AND 14 THEN 'low'
  ELSE NULL
END AS risk_level
```

### Key Rules
- **Risk is only calculated for overdue invoices** (`display_status = 'overdue'`)
- **High Risk**: `overdue_days >= 60` OR `outstanding >= 5000`
- **Medium Risk**: `overdue_days BETWEEN 15 AND 59`
- **Low Risk**: `overdue_days BETWEEN 1 AND 14`
- **NULL**: Not overdue (or draft/void/paid)

### Exclusions (from invoices_view)
- ✅ **Archived invoices**: Excluded (WHERE `i.archived_at IS NULL`)
- ✅ **Archived payments**: Excluded from paid calculations (WHERE `p.archived_at IS NULL`)
- ✅ **Void invoices**: `display_status = 'void'`, `risk_level = NULL`
- ✅ **Draft invoices**: `display_status = 'draft'`, `risk_level = NULL` (protected from overdue)
- ✅ **Paid invoices**: `display_status = 'paid'`, `risk_level = NULL` (outstanding <= 0)

---

## 2. Module-by-Module Analysis

### 2.1 Invoices Module

**File**: `app/[workspaceId]/invoices/page.tsx`

#### Query Source
- **Table/View**: `invoices_view`
- **Risk Field**: `risk_level` (used directly from view)
- **Filtering**:
  - ✅ Uses `invoices_view.risk_level` for smart views (high/medium/low)
  - ✅ Filters: `is_overdue = true`, `outstanding > 0`, `risk_level = 'high'|'medium'|'low'`
  - ✅ Excludes archived invoices (via `invoices_view` WHERE clause)
  - ⚠️ **Does NOT filter by client `is_active` or `archived_at`** (relies on invoices_view only)

#### Status: ✅ **CORRECT**
- Uses `invoices_view.risk_level` directly
- No client-side risk computation
- Consistent with canonical definition

---

### 2.2 Collections Module

**File**: `app/[workspaceId]/collections/page.tsx`

#### Query Source
- **Table/View**: `invoices_view`
- **Risk Field**: `risk_level` (used directly from view)
- **Filtering**:
  - ✅ Uses `invoices_view.risk_level` for risk filters (all/high/medium/low)
  - ✅ Filters: `workspace_id`, `is_overdue = true`, `outstanding > 0`, `risk_level = risk`
  - ✅ Excludes archived invoices (via `invoices_view` WHERE clause)
  - ✅ **Post-query filtering**: Filters out invoices with archived/inactive clients
    - Loads clients separately
    - Filters: `archived_at IS NULL AND is_active = true`
    - Removes invoices with archived/inactive clients from results

#### Status: ✅ **CORRECT**
- Uses `invoices_view.risk_level` directly
- No client-side risk computation
- Consistent with canonical definition
- **Additional client filtering**: Correctly excludes archived/inactive clients

---

### 2.3 Reminders Module

**Files**:
- `app/[workspaceId]/reminders/page.tsx`
- `lib/reminders/get-eligible-invoices.ts`
- `lib/reminders/run-reminders.ts`
- `lib/reminders/suggested.ts`

#### Query Source
- **Table/View**: `invoices_view`
- **Risk Field**: ⚠️ **NOT USED** (reminders don't filter by risk)
- **Filtering**:
  - ✅ Uses `invoices_view` for eligible invoices
  - ✅ Filters: `workspace_id`, `outstanding > 0`, `display_status IN ('sent', 'partially_paid', 'overdue')`
  - ✅ Excludes archived invoices (via `invoices_view` WHERE clause)
  - ✅ **Post-query filtering**: Filters by client status
    - `lib/reminders/run-reminders.ts`: `archived_at IS NULL AND is_active = true`
    - `lib/reminders/get-eligible-invoices.ts`: `archived_at IS NULL OR is_active = true` (different logic!)
    - `lib/reminders/suggested.ts`: Uses `invoices_view` with client relation (no explicit filtering)

#### Status: ⚠️ **PARTIALLY CORRECT**
- Uses `invoices_view` (correct)
- **Does NOT use risk_level** (by design - reminders don't filter by risk)
- ⚠️ **Client filtering inconsistency**: 
  - `run-reminders.ts`: Requires `archived_at IS NULL AND is_active = true` (both conditions)
  - `get-eligible-invoices.ts`: Allows `archived_at IS NULL OR is_active = true` (either condition)
  - This is a **discrepancy** that should be unified

---

### 2.4 Dashboard Module

**File**: `app/[workspaceId]/dashboard/_utils/dataLoader.ts`

#### Query Source
- **Table/View**: `invoices_view`
- **Risk Field**: `risk_level` (used directly from view)
- **Filtering**:
  - ✅ Uses `invoices_view.risk_level` for risk overview calculations
  - ✅ Loads all invoices from `invoices_view` (no additional filters in query)
  - ✅ Filters client-side: `status = 'overdue'` to get overdue invoices
  - ✅ Then filters by `riskLevel === 'high'|'medium'|'low'` for risk breakdown
  - ✅ Excludes archived invoices (via `invoices_view` WHERE clause)
  - ⚠️ **Does NOT filter by client `is_active` or `archived_at`** (relies on invoices_view only)

#### Status: ✅ **CORRECT**
- Uses `invoices_view.risk_level` directly
- No client-side risk computation
- Consistent with canonical definition
- Client filtering: Relies on `invoices_view` only (no additional client status filtering)

---

## 3. Discrepancies Found

### 3.1 Unused TypeScript Helper with Different Thresholds

**File**: `lib/invoices/risk.ts`

**Function**: `classifyRisk()`

**Issue**: This function has **DIFFERENT risk thresholds** than the canonical SQL definition:
- **High**: `daysOverdue >= 60 OR outstanding >= 3000` (SQL: >= 5000)
- **Medium**: `daysOverdue >= 30 OR outstanding >= 1500` (SQL: 15-59 days, no outstanding threshold)
- **Low**: `daysOverdue > 0` with `outstanding < 1500` (SQL: 1-14 days)

**Status**: ⚠️ **UNUSED** (grep shows no usage in app code)
- This function appears to be **dead code**
- Could cause confusion if someone uses it in the future
- Should be **removed or updated** to match canonical definition

**Recommendation**: Remove or deprecate this function, or update it to match `invoices_view.risk_level` thresholds (but it's still redundant since we should use the DB value).

---

### 3.2 Outdated Comments in Helper File

**File**: `lib/analytics/smartRisk.ts`

**Issue**: Comments document **OUTDATED risk thresholds**:
```typescript
/**
 * Risk levels from invoices_view:
 * - High: days_overdue >= 30 OR outstanding_amount >= 5000  // WRONG: should be >= 60
 * - Medium: days_overdue BETWEEN 8 AND 29                    // WRONG: should be 15-59
 * - Low: days_overdue BETWEEN 1 AND 7                        // WRONG: should be 1-14
 */
```

**Actual SQL thresholds** (from `invoices_view`):
- High: `overdue_days >= 60 OR outstanding >= 5000`
- Medium: `overdue_days BETWEEN 15 AND 59`
- Low: `overdue_days BETWEEN 1 AND 14`

**Status**: ⚠️ **OUTDATED DOCUMENTATION**
- The code correctly uses `invoices_view.risk_level` (doesn't compute risk)
- But the comments are misleading/wrong
- Could confuse future developers

**Recommendation**: Update comments to match actual SQL definition.

---

### 3.3 Client Filtering Inconsistencies

#### Collections Module
- ✅ **Correct**: Filters invoices post-query for clients with `archived_at IS NULL AND is_active = true`
- ✅ **Rationale**: Collections should only show invoices for active, non-archived clients

#### Reminders Module
- ⚠️ **Inconsistent**: Different files use different client filtering logic:
  - `lib/reminders/run-reminders.ts`: `archived_at IS NULL AND is_active = true` (both)
  - `lib/reminders/get-eligible-invoices.ts`: `archived_at IS NULL OR is_active = true` (either)
- ⚠️ **Rationale unclear**: Why should reminders allow archived clients if they're active?

#### Dashboard Module
- ⚠️ **No client filtering**: Relies on `invoices_view` only (no additional client status filtering)
- ⚠️ **Rationale**: Dashboard shows all invoices, but should it exclude inactive/archived clients?

#### Invoices Module (Smart Views)
- ⚠️ **No client filtering**: Relies on `invoices_view` only (no additional client status filtering)
- ⚠️ **Rationale**: Smart views show all overdue invoices, but should they exclude inactive/archived clients?

**Recommendation**: **Define and document** the expected behavior for each module:
- Should Collections exclude invoices for inactive clients? **YES** (already does)
- Should Reminders exclude invoices for inactive clients? **YES** (should unify the logic)
- Should Dashboard exclude invoices for inactive clients? **UNCLEAR** (document decision)
- Should Invoices Smart Views exclude invoices for inactive clients? **UNCLEAR** (document decision)

---

## 4. Proposed Patches (DO NOT APPLY YET)

### Patch 1: Remove or Update `lib/invoices/risk.ts`

**Option A: Remove** (recommended)
- Delete `lib/invoices/risk.ts` entirely
- It's unused and has incorrect thresholds
- All modules should use `invoices_view.risk_level` directly

**Option B: Keep but Deprecate**
- Add `@deprecated` JSDoc comment
- Update function to match SQL thresholds (but still redundant)
- Add warning in function body: "Use invoices_view.risk_level instead"

**Recommendation**: **Option A** - Remove the file entirely since it's unused.

---

### Patch 2: Fix Comments in `lib/analytics/smartRisk.ts`

**File**: `lib/analytics/smartRisk.ts`

**Change**: Update JSDoc comments to match actual SQL definition:

```typescript
/**
 * Get smart-risk buckets for a workspace.
 * 
 * Only includes overdue invoices (display_status = 'overdue') with risk_level set.
 * Risk levels from invoices_view:
 * - High: overdue_days >= 60 OR outstanding >= 5000
 * - Medium: overdue_days BETWEEN 15 AND 59
 * - Low: overdue_days BETWEEN 1 AND 14
 * 
 * @param supabase - Supabase client instance
 * @param workspaceId - Workspace ID to filter by
 * @returns Array of risk bucket summaries, or empty array on error
 */
```

---

### Patch 3: Unify Reminders Client Filtering Logic

**Files**: 
- `lib/reminders/run-reminders.ts`
- `lib/reminders/get-eligible-invoices.ts`

**Issue**: Inconsistent client filtering logic

**Current**:
- `run-reminders.ts`: `archived_at IS NULL AND is_active = true`
- `get-eligible-invoices.ts`: `archived_at IS NULL OR is_active = true`

**Recommendation**: **Use `archived_at IS NULL AND is_active = true`** (both conditions) for consistency with Collections.

**Rationale**: 
- Reminders should only be sent for active, non-archived clients
- If a client is archived, they shouldn't receive reminders (even if active)
- This matches Collections behavior (which is clearer)

**Change in `lib/reminders/get-eligible-invoices.ts`**:
```typescript
// OLD:
const isEligible = !client.archived_at || client.is_active === true;

// NEW:
const isEligible = !client.archived_at && client.is_active === true;
```

---

### Patch 4: Document Client Filtering Policy

**Recommendation**: Add a comment or documentation file explaining when client filtering (active/inactive, archived) should be applied:

**Policy**:
1. **Collections**: ✅ Filter out invoices for archived/inactive clients (post-query)
2. **Reminders**: ✅ Filter out invoices for archived/inactive clients (post-query) - unify logic
3. **Dashboard**: ⚠️ **DECISION NEEDED**: Should it filter? (Currently doesn't)
4. **Invoices Smart Views**: ⚠️ **DECISION NEEDED**: Should it filter? (Currently doesn't)

**Current Behavior**:
- Collections: Filters by client status ✅
- Reminders: Filters by client status (but inconsistent) ⚠️
- Dashboard: No client filtering (uses invoices_view only)
- Invoices: No client filtering (uses invoices_view only)

---

## 5. Summary of Discrepancies

### Critical Issues (Action Required)
1. ⚠️ **Unused TypeScript helper** (`lib/invoices/risk.ts`) with wrong thresholds
2. ⚠️ **Inconsistent client filtering** in Reminders module (OR vs AND logic)

### Documentation Issues (Should Fix)
3. ⚠️ **Outdated comments** in `lib/analytics/smartRisk.ts` (wrong thresholds in JSDoc)

### Design Decisions Needed
4. ⚠️ **Client filtering policy**: Should Dashboard and Invoices Smart Views filter by client `is_active`/`archived_at`?
   - Currently: Collections does, Reminders does (inconsistent), Dashboard/Invoices don't
   - Need: Clear policy document

---

## 6. Minimum Changes Needed

To unify risk across all modules with minimal changes:

### Must Do (Critical)
1. **Remove `lib/invoices/risk.ts`** (unused, wrong thresholds)
2. **Unify Reminders client filtering**: Change `get-eligible-invoices.ts` to use `AND` instead of `OR`

### Should Do (Documentation)
3. **Fix comments** in `lib/analytics/smartRisk.ts` (update JSDoc to match SQL)

### Nice to Have (Policy)
4. **Document client filtering policy**: Create decision document for when to filter by client status
5. **Consider Dashboard/Invoices client filtering**: Decide if these modules should also filter by client status (currently they don't)

---

## 7. Risk Level Usage Matrix

| Module | Uses `invoices_view.risk_level`? | Client Filtering | Status |
|--------|----------------------------------|------------------|--------|
| **Invoices** | ✅ Yes (directly) | ❌ No | ✅ Correct |
| **Collections** | ✅ Yes (directly) | ✅ Yes (`archived_at IS NULL AND is_active = true`) | ✅ Correct |
| **Reminders** | ❌ No (by design - doesn't filter by risk) | ⚠️ Inconsistent (`AND` vs `OR`) | ⚠️ Needs unification |
| **Dashboard** | ✅ Yes (directly) | ❌ No | ✅ Correct |

---

## 8. Conclusion

**Overall Status**: ✅ **Mostly Consistent**

- All modules that use risk correctly use `invoices_view.risk_level` as the single source of truth
- No modules are computing risk with different thresholds (except unused helper)
- Main issues are:
  1. Unused helper file with wrong thresholds (should be removed)
  2. Inconsistent client filtering in Reminders (should be unified)
  3. Outdated documentation comments (should be updated)

**Recommendation**: 
- Apply Patches 1, 2, 3 (critical fixes)
- Document client filtering policy (Patch 4)
- Consider whether Dashboard/Invoices should also filter by client status (design decision)
