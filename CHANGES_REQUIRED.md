# Required Changes for Invoice/Payment/Client Consistency

## Summary
This document outlines all changes needed to:
1. Ensure workspace_id is always set from requireWorkspace() and written into rows on insert
2. Ensure invoices.status is always lowercase: 'draft' | 'sent' | 'void'
3. Remove usage of invoices.total_paid/outstanding_amount/payment_state (columns were dropped)
4. Add guards that reject writes when workspace_id is missing

---

## 1. Invoice Schema (lib/invoices/schema.ts)

**Change**: Add `.transform()` to lowercase status and ensure validation

```typescript
// BEFORE:
status: z.enum(["draft", "sent", "void"], {
  required_error: "Status is required",
}),

// AFTER:
status: z.enum(["draft", "sent", "void"], {
  required_error: "Status is required",
}).transform((val) => val.toLowerCase() as "draft" | "sent" | "void"),
```

---

## 2. Invoice Actions (app/[workspaceId]/invoices/actions.ts)

### 2.1 createInvoice function

**Changes needed:**
1. Remove total_paid, outstanding_amount, payment_state from insert
2. Ensure status is lowercase
3. Add workspace_id guard
4. Use validatedWorkspaceId from requireWorkspace

```typescript
// Line 31: Already has requireWorkspace - GOOD
const { workspaceId: validatedWorkspaceId } = await requireWorkspace(workspaceId);

// Line 113-137: Remove total_paid, outstanding_amount, payment_state from insert
// BEFORE:
.insert({
  workspace_id: workspaceId, // MUST be set - used for filtering in list page
  organization_id: ORGANIZATION_ID,
  client_id: parsed.clientId,
  invoice_number: parsed.invoiceNumber,
  issue_date: parsed.issueDate,
  due_date: dueDate,
  po_number: parsed.poNumber ?? null,
  notes: parsed.notes ?? null,
  status: parsed.status, // ❌ Need to lowercase
  payment_terms: parsed.paymentTerms,
  payment_terms_days: effectiveDays,
  currency: "USD",
  subtotal: money.subtotal,
  discount_percent: money.discountPercent,
  discount_amount: money.discountAmount,
  tax_percent: money.taxPercent,
  tax_amount: money.taxAmount,
  amount: money.total,
  total_paid: 0, // ❌ REMOVE - column dropped
  outstanding_amount: money.total, // ❌ REMOVE - column dropped
  payment_state: "unpaid", // ❌ REMOVE - column dropped
})

// AFTER:
.insert({
  workspace_id: validatedWorkspaceId, // ✅ Use validated workspace_id
  organization_id: ORGANIZATION_ID,
  client_id: parsed.clientId,
  invoice_number: parsed.invoiceNumber,
  issue_date: parsed.issueDate,
  due_date: dueDate,
  po_number: parsed.poNumber ?? null,
  notes: parsed.notes ?? null,
  status: parsed.status.toLowerCase() as "draft" | "sent" | "void", // ✅ Lowercase
  payment_terms: parsed.paymentTerms,
  payment_terms_days: effectiveDays,
  currency: "USD",
  subtotal: money.subtotal,
  discount_percent: money.discountPercent,
  discount_amount: money.discountAmount,
  tax_percent: money.taxPercent,
  tax_amount: money.taxAmount,
  amount: money.total,
  // ✅ REMOVED: total_paid, outstanding_amount, payment_state
})

// Lines 172-185: Remove update with total_paid/outstanding_amount/payment_state
// DELETE ENTIRE BLOCK:
//  // 3) Calculate derived state (no payments yet for new invoice)
//  // For new invoices, total_paid = 0, outstanding_amount = amount
//  // outstanding_amount cannot go negative
//  const outstandingAmount = Math.max(0, money.total - 0);
//
//  // 4) Update invoice with final state
//  await supabase
//    .from("invoices")
//    .update({
//      total_paid: 0,
//      outstanding_amount: outstandingAmount,
//      payment_state: "unpaid",
//    })
//    .eq("id", invoice.id);
```

### 2.2 updateInvoice function

**Changes needed:**
1. Remove total_paid, outstanding_amount, payment_state from update
2. Ensure status is lowercase
3. Remove references to total_paid in calculations

```typescript
// Line 218-221: Remove total_paid from select
// BEFORE:
.select("id, organization_id, invoice_number, status, issue_date, due_date, total_paid, client_id")

// AFTER:
.select("id, organization_id, invoice_number, status, issue_date, due_date, client_id")

// Line 273-274: Remove total_paid calculation
// DELETE:
//  // Get existing total_paid (from database or calculate from payments)
//  const existingTotalPaid = Number(invoiceRow.total_paid ?? 0);

// Line 286: Ensure status is lowercase
// BEFORE:
status: parsed.status,

// AFTER:
status: parsed.status.toLowerCase() as "draft" | "sent" | "void",

// Line 296-297: Remove outstanding_amount calculation
// BEFORE:
// Calculate outstanding_amount = amount - total_paid (cannot go negative)
outstanding_amount: Math.max(0, money.total - existingTotalPaid),

// AFTER:
// ✅ REMOVED - outstanding_amount is computed by invoices_view

// Lines 330-370: Remove entire payment state recalculation block
// DELETE ENTIRE BLOCK:
//  // Recalculate payment state after updating invoice
//  // Fetch ACTIVE payments to recalculate total_paid and outstanding_amount
//  // ✅ CRITICAL: Exclude archived payments (p.archived_at IS NULL)
//  // Archived payments must NOT affect invoice paid totals or outstanding calculations
//  const { data: payments } = await supabase
//    .from("payments")
//    .select("amount, status")
//    .eq("invoice_id", invoiceId)
//    .is("archived_at", null);
//
//  // Calculate total_paid from payments
//  const totalPaid = (payments ?? [])
//    .filter((p) => p.status === "completed" || p.status === "paid" || !p.status)
//    .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
//
//  // Calculate outstanding_amount = amount - total_paid (cannot go negative)
//  const outstandingAmount = Math.max(0, money.total - totalPaid);
//
//  // Determine payment state
//  let paymentState: "unpaid" | "partially_paid" | "paid" = "unpaid";
//  if (outstandingAmount <= 0 && totalPaid > 0) {
//    paymentState = "paid";
//  } else if (outstandingAmount > 0 && totalPaid > 0) {
//    paymentState = "partially_paid";
//  }
//
//  // Determine if overdue
//  // Use computed dueDate (server-side authoritative) instead of parsed.dueDate
//  const dueDateObj = new Date(dueDate);
//  const today = new Date();
//  today.setHours(0, 0, 0, 0);
//  // Update invoice with payment state
//  // Note: is_overdue is deprecated - use dynamic logic: (due_date < today) AND (outstanding_amount > 0)
//  await supabase
//    .from("invoices")
//    .update({
//      total_paid: totalPaid,
//      outstanding_amount: outstandingAmount,
//      payment_state: paymentState,
//    })
//    .eq("id", invoiceId);
```

---

## 3. Payment Actions (app/[workspaceId]/payments/actions.ts)

### 3.1 recalculateInvoiceState function

**Changes needed:**
1. Remove total_paid, outstanding_amount, payment_state from update
2. This function should NO LONGER update invoices table - invoices_view computes these

```typescript
// Lines 32-108: DELETE ENTIRE FUNCTION OR REMOVE UPDATE
// The function should either:
// A) Be deleted entirely (recommended - invoices_view handles this)
// B) Be kept but remove the update block

// BEFORE (lines 87-107):
//  // 4) Update invoice numeric fields
//  // NOTE: Status is NOT stored here - it's computed by invoices_view.display_status
//  // We only update numeric fields that affect the status calculation
//  const { error: updateError } = await supabase
//    .from("invoices")
//    .update({
//      total_paid: derived.totalPaid,
//      outstanding_amount: derived.outstanding,
//      payment_state: derived.paymentState,
//    })
//    .eq("id", invoiceId);
//
//  if (updateError) {
//    const errorDetails = {
//      message: updateError?.message || "Unknown error",
//      code: updateError?.code || null,
//      details: (updateError as any)?.details || null,
//      hint: (updateError as any)?.hint || null,
//    };
//    console.error("[recalculateInvoiceState] failed to update invoice:", errorDetails);
//  }

// AFTER:
// ✅ REMOVED - invoices_view computes paid/outstanding automatically
// This function can be deleted or kept as a no-op for backward compatibility
```

### 3.2 createPayment function

**Changes needed:**
1. Ensure workspace_id is set from requireWorkspace
2. Add workspace_id guard

```typescript
// Line 116: Already has requireWorkspace but doesn't capture result
// BEFORE:
await requireWorkspace(workspaceId);

// AFTER:
const { workspaceId: validatedWorkspaceId } = await requireWorkspace(workspaceId);

// Line 234: Use validatedWorkspaceId
// BEFORE:
workspace_id: workspaceId,

// AFTER:
workspace_id: validatedWorkspaceId,

// Line 268: Remove recalculateInvoiceState call (or keep if function is no-op)
// BEFORE:
await recalculateInvoiceState(parsed.invoiceId);

// AFTER:
// ✅ REMOVED - invoices_view computes paid/outstanding automatically
// Or keep if recalculateInvoiceState is now a no-op
```

### 3.3 updatePayment function

**Changes needed:**
1. Ensure workspace_id is validated
2. Remove recalculateInvoiceState call

```typescript
// Line 307: Already has requireWorkspace but doesn't capture result
// BEFORE:
await requireWorkspace(workspaceId);

// AFTER:
const { workspaceId: validatedWorkspaceId } = await requireWorkspace(workspaceId);

// Line 446-448: Remove recalculateInvoiceState call
// BEFORE:
// 8) Recalculate invoice state (invoice cannot be changed, so only recalculate the existing one)
if (oldInvoiceId) {
  await recalculateInvoiceState(oldInvoiceId);
}

// AFTER:
// ✅ REMOVED - invoices_view computes paid/outstanding automatically
```

---

## 4. Client Actions (app/[workspaceId]/clients/actions.ts)

### 4.1 createClient function

**Changes needed:**
1. Add requireWorkspace validation
2. Add workspace_id guard

```typescript
// Add at top of function (after line 15):
import { requireWorkspace } from "@/lib/auth/server";

// Add after line 15:
const { workspaceId: validatedWorkspaceId } = await requireWorkspace(workspaceId);

// Line 45: Use validatedWorkspaceId
// BEFORE:
workspace_id: workspaceId,

// AFTER:
workspace_id: validatedWorkspaceId,

// Add guard before insert (after line 57):
if (!validatedWorkspaceId) {
  return fail("workspace_id is required");
}
```

### 4.2 updateClient function

**Changes needed:**
1. Add requireWorkspace validation
2. Add workspace_id guard

```typescript
// Add at top of function (after line 98):
import { requireWorkspace } from "@/lib/auth/server";

// Add after line 98:
const { workspaceId: validatedWorkspaceId } = await requireWorkspace(workspaceId);

// Line 122: Use validatedWorkspaceId in filter
// BEFORE:
.eq("workspace_id", workspaceId);

// AFTER:
.eq("workspace_id", validatedWorkspaceId);

// Add guard before update (after line 107):
if (!validatedWorkspaceId) {
  return fail("workspace_id is required");
}
```

---

## 5. RPC Import Functions

### 5.1 import_invoices_grouped (supabase/migrations/20260103000000_import_invoices_grouped.sql)

**Changes needed:**
1. Remove total_paid, outstanding_amount, payment_state from inserts/updates
2. Ensure status is lowercase
3. Add workspace_id guard

```sql
-- Line 92: Already validates status - GOOD
if lower(coalesce(v_row->>'status','')) not in ('draft','sent','void') then
  v_errors := v_errors || jsonb_build_array(format('Invalid status "%s" for %s (allowed Draft/Sent/Void)', coalesce(v_row->>'status',''), v_inv));
end if;

-- Lines 174-189: Remove total_paid, outstanding_amount, payment_state from insert
-- BEFORE:
insert into invoices (
  workspace_id, organization_id, client_id, invoice_number, issue_date, due_date, currency, status, po_number, notes,
  amount, total_paid, outstanding_amount, payment_state
)
values (
  p_workspace_id, v_org_id, v_client_id, v_inv,
  (v_row->>'issue_date')::date,
  (v_row->>'due_date')::date,
  coalesce(nullif(upper(trim(v_row->>'currency')), ''), 'USD'),
  lower(trim(v_row->>'status')), -- ✅ Already lowercase - GOOD
  nullif(v_row->>'po_number',''),
  nullif(v_row->>'notes',''),
  0, 0, 0, 'unpaid' -- ❌ REMOVE - columns dropped
)

-- AFTER:
insert into invoices (
  workspace_id, organization_id, client_id, invoice_number, issue_date, due_date, currency, status, po_number, notes,
  amount
)
values (
  p_workspace_id, v_org_id, v_client_id, v_inv,
  (v_row->>'issue_date')::date,
  (v_row->>'due_date')::date,
  coalesce(nullif(upper(trim(v_row->>'currency')), ''), 'USD'),
  lower(trim(v_row->>'status')), -- ✅ Already lowercase - GOOD
  nullif(v_row->>'po_number',''),
  nullif(v_row->>'notes',''),
  0 -- ✅ Only amount (will be computed from items)
)

-- Lines 191-205: Same change for non-org_id branch

-- Lines 265-271: Remove update with total_paid/outstanding_amount/payment_state
-- BEFORE:
update invoices
set amount = v_subtotal,
    outstanding_amount = v_subtotal,
    total_paid = 0,
    payment_state = 'unpaid'
where id = v_invoice_id;

-- AFTER:
update invoices
set amount = v_subtotal
where id = v_invoice_id;
-- ✅ REMOVED: outstanding_amount, total_paid, payment_state (computed by invoices_view)

-- Add workspace_id guard at start of function (after line 33):
if p_workspace_id is null then
  return jsonb_build_object(
    'ok', false,
    'errors', jsonb_build_array('workspace_id is required')
  );
end if;
```

### 5.2 rpc_import_invoices (supabase/migrations/20250204090000_rpc_import_invoices.sql)

**Changes needed:**
1. Remove total_paid, outstanding_amount, payment_state from inserts/updates
2. Ensure status is lowercase
3. Add workspace_id guard

```sql
-- Line 113: Already has default - ensure lowercase
-- BEFORE:
v_status := COALESCE(NULLIF(TRIM(r->>'status'), ''), 'sent');

-- AFTER:
v_status := lower(COALESCE(NULLIF(TRIM(r->>'status'), ''), 'sent'));

-- Line 146: Already validates - GOOD, but ensure lowercase
-- BEFORE:
IF v_status NOT IN ('draft', 'sent', 'void') THEN
  v_err := 'status must be draft, sent, or void';
END IF;

-- AFTER:
v_status := lower(v_status); -- ✅ Ensure lowercase before validation
IF v_status NOT IN ('draft', 'sent', 'void') THEN
  v_err := 'status must be draft, sent, or void';
END IF;

-- Lines 234-259: Remove total_paid, outstanding_amount, payment_state from update
-- BEFORE (in UPDATE block):
UPDATE public.invoices
SET
  client_id = v_client_id,
  issue_date = v_issue_date,
  due_date = v_due_date,
  currency = v_currency,
  status = v_status, -- ✅ Should be lowercase
  notes = v_notes,
  amount = v_total,
  updated_at = NOW()
WHERE id = v_existing_invoice_id

-- AFTER: Same (no total_paid/outstanding_amount/payment_state) - GOOD

-- Lines 300-350: Check INSERT block - remove total_paid/outstanding_amount/payment_state
-- Need to check if INSERT includes these columns and remove them

-- Add workspace_id guard at start of function (after line 62):
IF p_workspace_id IS NULL THEN
  RETURN jsonb_build_object(
    'ok', false,
    'errors', jsonb_build_array('workspace_id is required')
  );
END IF;
```

---

## Summary of All Changes

### Files to Modify:
1. `lib/invoices/schema.ts` - Add lowercase transform to status
2. `app/[workspaceId]/invoices/actions.ts` - Remove dropped columns, ensure workspace_id, lowercase status
3. `app/[workspaceId]/payments/actions.ts` - Remove dropped columns, ensure workspace_id
4. `app/[workspaceId]/clients/actions.ts` - Add requireWorkspace, ensure workspace_id
5. `supabase/migrations/20260103000000_import_invoices_grouped.sql` - Remove dropped columns, add workspace_id guard
6. `supabase/migrations/20250204090000_rpc_import_invoices.sql` - Remove dropped columns, ensure lowercase status, add workspace_id guard

### Key Principles:
- ✅ Always use `validatedWorkspaceId` from `requireWorkspace()`
- ✅ Always lowercase `invoices.status` before insert/update
- ✅ Never write to `total_paid`, `outstanding_amount`, `payment_state` (computed by invoices_view)
- ✅ Add workspace_id guards that reject null/missing values

