# Invoice Import Stabilization Summary

## Status: ✅ COMPLETE

All invoice import code now uses ONLY `import_invoices_grouped` RPC function. No references to dropped columns or old RPC functions.

---

## Files Changed

### 1. `app/[workspaceId]/settings/import/actions/invoices.ts`

**Changes:**
- ✅ Status normalization: Added `.toLowerCase()` to ensure status is always lowercase (`draft`|`sent`|`void`) before sending to RPC
- ✅ Verification queries: Added dev log queries after execute to verify imported invoices appear in `invoices_view`
- ✅ No dropped columns: Confirmed no references to `total_paid`, `outstanding_amount`, or `payment_state`

**Key Code Snippets:**

```typescript
// Preview: Normalize status to lowercase
const statusRaw = getField(row, "status");
const statusNormalized = statusRaw ? statusRaw.toLowerCase().trim() as "draft" | "sent" | "void" : "sent";

rpcRows.push({
  // ...
  status: statusNormalized, // Lowercase: draft|sent|void
  // ...
});

// Execute: Ensure status is lowercase
rawRows.push({
  // ...
  status: group.base_status.toLowerCase() as "draft" | "sent" | "void", // Ensure lowercase
  // ...
});

// RPC Call (matches function signature exactly)
const { data: rpcResult, error: rpcError } = await supabase.rpc('import_invoices_grouped', {
  p_workspace_id: workspaceId,
  p_rows: rawRows,
  p_dry_run: dryRun,
});

// Verification queries (dev logs)
if (ok && rpcData.created) {
  const { data: importedInvoices } = await supabase
    .from("invoices_view")
    .select("id, invoice_number, total, paid, outstanding, display_status")
    .eq("workspace_id", workspaceId)
    .in("invoice_number", invoiceNumbers);
  // Log results...
}
```

---

## RPC Function Signature

**Function:** `public.import_invoices_grouped(uuid, jsonb, boolean)`

**Parameters:**
- `p_workspace_id` (uuid) - Required, workspace-scoped
- `p_rows` (jsonb) - Array of invoice/item rows
- `p_dry_run` (boolean) - Default: true

**Returns:** `jsonb` with structure:
```json
{
  "ok": boolean,
  "errors": string[],
  "created": {
    "clients": number,
    "invoices": number,
    "items": number
  }
}
```

---

## Payload Schema

### Invoice Row (row_type: "invoice")
```typescript
{
  row_type: "invoice",
  invoice_number: string,        // Required, workspace-scoped unique
  client_email?: string | null,  // Optional, used for client lookup
  client_name: string,            // Required if client_email missing
  issue_date: string,            // Required, YYYY-MM-DD format
  due_date?: string | null,      // Optional, YYYY-MM-DD format
  currency?: string,              // Optional, defaults to "USD", must be 3-letter ISO code
  status: "draft" | "sent" | "void", // Required, lowercase
  po_number?: string | null,     // Optional
  notes?: string | null           // Optional
}
```

### Item Row (row_type: "item")
```typescript
{
  row_type: "item",
  invoice_number: string,        // Required, must reference invoice row
  item_description: string,       // Required
  quantity: string,              // Required, numeric > 0
  unit_price: string,             // Required, numeric > 0
  amount?: string | null          // Optional, ignored (computed from quantity * unit_price)
}
```

---

## Status Handling

- ✅ **Input**: Accepts "Draft", "Sent", "Void" (case-insensitive) or "draft", "sent", "void"
- ✅ **Normalization**: Always converted to lowercase before sending to RPC
- ✅ **Validation**: RPC validates status is one of: `'draft'`, `'sent'`, `'void'`
- ✅ **Storage**: Stored in database as lowercase: `'draft'`, `'sent'`, `'void'`
- ✅ **System-derived**: `paid`, `partially_paid`, `overdue` are computed by `invoices_view` (not user-editable)

---

## Verification

After import execution, the code logs verification queries:

```typescript
// Count imported invoices in invoices_view
const { data: importedInvoices } = await supabase
  .from("invoices_view")
  .select("id, invoice_number, total, paid, outstanding, display_status")
  .eq("workspace_id", workspaceId)
  .in("invoice_number", invoiceNumbers);
```

**Expected Results:**
- All imported invoice_numbers should appear in `invoices_view`
- `paid` should be 0 (no payments yet)
- `outstanding` should equal `total`
- `display_status` should match `base_status` for new invoices

---

## Checklist

- [x] All code uses ONLY `import_invoices_grouped` RPC
- [x] No references to `rpc_import_invoices` (old function)
- [x] No references to `import_preview_invoices` or `import_execute_invoices`
- [x] Status normalized to lowercase before RPC call
- [x] No references to dropped columns (`total_paid`, `outstanding_amount`, `payment_state`)
- [x] RPC call matches function signature exactly
- [x] Payload schema matches RPC expectations
- [x] Verification queries added for dev logs
- [x] Workspace_id always validated via `requireWorkspace()`
- [x] Multi-tenant: All operations workspace-scoped

---

## Final RPC Call

```typescript
const { data: rpcResult, error: rpcError } = await supabase.rpc('import_invoices_grouped', {
  p_workspace_id: workspaceId,  // Validated via requireWorkspace()
  p_rows: rawRows,               // Array of invoice/item rows
  p_dry_run: dryRun,             // true for preview, false for execute
});
```

**Payload Example:**
```json
[
  {
    "row_type": "invoice",
    "invoice_number": "INV-001",
    "client_name": "Acme Corp",
    "client_email": "acme@example.com",
    "issue_date": "2025-01-15",
    "due_date": "2025-02-15",
    "currency": "USD",
    "status": "sent",
    "po_number": null,
    "notes": null
  },
  {
    "row_type": "item",
    "invoice_number": "INV-001",
    "item_description": "Service A",
    "quantity": "10",
    "unit_price": "150.00",
    "amount": null
  }
]
```

---

## No Breaking Changes

- ✅ Existing UI components unchanged
- ✅ Preview/Execute flow unchanged
- ✅ Error handling unchanged
- ✅ All validation logic preserved
- ✅ Only internal improvements (status normalization, verification queries)

