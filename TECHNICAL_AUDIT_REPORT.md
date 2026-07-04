# Arrexia Technical Audit Report

**Date:** 2025-01-XX  
**Codebase:** Arrexia (Next.js 16, TypeScript, Supabase/Postgres)  
**Audit Scope:** Core features across Phases A–I

---

## 1. High-Level Feature Matrix

| Phase | Feature | Status | Evidence | Main TODO |
|-------|---------|--------|----------|-----------|
| A1 | Centralized invoice status engine | **partial** | `lib/invoices/deriveState.ts` exists but `invoices_view` also calculates `display_status` in SQL. Status logic duplicated between TS and SQL. | Consolidate: either use SQL view exclusively OR use TS function everywhere. Currently mixed. |
| A2 | Invoice amounts & balances (SQL + TS) | **implemented** | `invoices_view` exists (`supabase/migrations/20250103000000_create_invoices_view.sql`), includes `total_amount`, `paid_amount`, `outstanding`, `overdue_days`. Used in dashboard (`app/[workspaceId]/dashboard/_utils/dataLoader.ts:101`) and invoices page. | None - view is properly used. |
| A3 | Invoice PDF generator | **implemented** | `lib/invoices/pdf.ts` (pdf-lib), API route `app/[workspaceId]/invoices/[invoiceId]/pdf/route.ts` exists. | Verify UI button/link exists to trigger download. |
| A4 | Invoice delivery (email + logs) | **missing** | No `invoice_delivery_logs` table found. No `sendInvoiceEmail` function. Reminder sending exists (`app/api/workspaces/[workspaceId]/reminders/send/route.ts`) but not invoice sending. | Create invoice delivery system: table, API endpoint, UI action. |
| B1 | Payment CRUD & invoice recalculation | **implemented** | `app/[workspaceId]/payments/actions.ts` has create/update/delete. `recalculateInvoiceState()` called after each payment change. | Add validation to prevent payments > outstanding (currently missing). |
| B2 | Payment sources | **implemented** | `lib/payments/schema.ts` defines `PaymentMethodEnum` (cash, bank_transfer, card, check, other). Used in forms. | None. |
| C1 | Reminder rules & templates | **implemented** | Tables: `reminder_rules`, `reminder_templates` (migrations exist). UI: `app/[workspaceId]/settings/_components/ReminderSettingsForm.tsx`. Logic: `lib/reminders/engine.ts` has `findApplicableRuleForInvoice()`. | None. |
| C2 | Reminder cron / worker | **missing** | No cron/worker found. Only manual sending via API (`app/api/workspaces/[workspaceId]/reminders/send/route.ts`). `lib/reminders/engine.ts` has suggestion logic but no automated execution. | Implement scheduled job (Supabase Edge Function or external cron) to process reminders. |
| D | Dashboard data correctness | **implemented** | Dashboard uses `invoices_view` (`app/[workspaceId]/dashboard/_utils/dataLoader.ts:101`). Metrics calculated from view fields. No obvious duplication. | None. |
| E | Multi-workspace & permissions | **partial** | `workspace_id` filtering present in queries (`app/[workspaceId]/invoices/actions.ts:83`, `app/[workspaceId]/payments/actions.ts:91`). RLS exists for `reminder_rules` and `reminder_templates` but need to verify on `invoices`, `payments`, `clients`. | Audit RLS policies on all main tables. Verify workspace_members table exists and is used. |
| F | Import / Export (CSV) | **missing** | No CSV import/export code found. No PapaParse or similar. | Implement CSV import for clients/invoices. Add export endpoints. |
| G | Settings module | **implemented** | Tables: `workspace_email_settings`, `settings` (from types). UI: `app/[workspaceId]/settings/page.tsx` with tabs. Forms exist for profile, email, reminders, payments. | Verify settings values are used in PDF generation (workspace name/email/phone/address - confirmed in `app/[workspaceId]/invoices/[invoiceId]/pdf/route.ts:14-18`). |
| H | Audit logs | **schema only** | `activity_logs` table exists in `types/supabase.ts:17-64` but no usage found in app code. No `logAction` or `logAudit` functions. | Wire audit logging: invoice created/sent, payment added/deleted, reminder sent. |
| I | Deployment & stability | **uncertain** | RLS enabled on `reminder_rules` and `reminder_templates`. Need to verify on `invoices`, `payments`, `clients`. No error boundaries found. No rate limiting middleware found. | Complete RLS audit. Add error boundaries. Consider rate limiting for API routes. |

---

## 2. Detailed Notes Per Phase

### Phase A — Invoices Engine

#### A1. Centralized Invoice Status Engine

**What exists:**
- `lib/invoices/deriveState.ts` exports `deriveInvoiceState()` function that calculates payment state and overdue status.
- `supabase/migrations/20250103000000_create_invoices_view.sql` creates `invoices_view` with SQL-based `display_status` calculation.
- `app/[workspaceId]/invoices/actions.ts:10` imports `deriveInvoiceState` but uses it only for payment state recalculation.
- `app/[workspaceId]/invoices/page.tsx` queries `invoices_view` and uses `display_status` from SQL view.

**What is missing:**
- **Duplication**: Status is calculated in both SQL (`invoices_view.display_status`) and TypeScript (`deriveInvoiceState`). The SQL view is the primary source for list pages, but TS function exists for payment recalculation.
- **Inconsistency risk**: If SQL view logic and TS function diverge, status will be inconsistent.
- **No single source of truth**: Should either:
  1. Use SQL view exclusively (recommended for performance), OR
  2. Use TS function everywhere and remove SQL status calculation.

**Files:**
- `lib/invoices/deriveState.ts` (TS function)
- `supabase/migrations/20250103000000_create_invoices_view.sql` (SQL view)
- `app/[workspaceId]/invoices/page.tsx:200` (uses SQL view)
- `app/[workspaceId]/payments/actions.ts:43` (uses TS function for recalculation)

#### A2. Invoice Amounts & Balances

**What exists:**
- `invoices_view` SQL view (`supabase/migrations/20250103000000_create_invoices_view.sql`) calculates:
  - `total_amount` (from `invoices.amount`)
  - `paid_amount` (from `invoices.total_paid`)
  - `outstanding` (calculated: `total_amount - paid_amount`)
  - `overdue_days` (calculated from `due_date`)
- View is used in:
  - Dashboard: `app/[workspaceId]/dashboard/_utils/dataLoader.ts:101`
  - Invoices list: `app/[workspaceId]/invoices/page.tsx:200`
  - Collections: `app/[workspaceId]/collections/page.tsx:20`
- `lib/invoices/calc.ts` has `calculateInvoiceMoney()` for form-time calculations (subtotal, discount, tax, total).

**What is missing:**
- No separate `invoice_amounts_calc` or `invoice_totals` views (not needed - `invoices_view` covers this).
- `invoice_amounts` table exists in types (`types/supabase.ts:209`) but appears unused (has `discount_total`, `manual_tax_rate`, `shipping` fields that don't match current schema).

**Status:** ✅ **Implemented & wired correctly**

#### A3. Invoice PDF Generator

**What exists:**
- `lib/invoices/pdf.ts` implements `generateInvoicePdf()` using `pdf-lib`.
- API route: `app/[workspaceId]/invoices/[invoiceId]/pdf/route.ts` serves PDF.
- PDF includes: invoice number, dates, client info, line items, totals (from DB, not recalculated), workspace info.

**What is missing:**
- Need to verify UI has "Download PDF" button/link on invoice detail page.

**Files:**
- `lib/invoices/pdf.ts` (implementation)
- `app/[workspaceId]/invoices/[invoiceId]/pdf/route.ts` (API route)

**Status:** ✅ **Implemented** (verify UI button exists)

#### A4. Invoice Delivery (Email + Logs)

**What exists:**
- Reminder email sending exists: `app/api/workspaces/[workspaceId]/reminders/send/route.ts` (uses nodemailer/SMTP).
- `workspace_email_settings` table exists for SMTP config.
- Reminder sending logs to `reminders` table.

**What is missing:**
- ❌ No `invoice_delivery_logs` table.
- ❌ No `sendInvoiceEmail` function or API endpoint.
- ❌ No UI action to "Send invoice via email".
- ❌ No logging of invoice delivery attempts.

**Status:** ❌ **Missing** - Invoice delivery system not implemented.

---

### Phase B — Payments Module

#### B1. Payment CRUD & Invoice Recalculation

**What exists:**
- `app/[workspaceId]/payments/actions.ts` implements:
  - `createPayment()` - inserts payment, calls `recalculateInvoiceState()`
  - `updatePayment()` - updates payment, recalculates for old and new invoice
  - `deletePayment()` - deletes payment, recalculates invoice state
- `recalculateInvoiceState()` helper uses `deriveInvoiceState()` from `lib/invoices/deriveState.ts`.
- Invoice `total_paid`, `outstanding_amount`, `payment_state` are updated after payment changes.

**What is missing:**
- ❌ **No validation to prevent overpayment**: Payment form (`app/[workspaceId]/payments/_components/PaymentForm.tsx`) filters invoices by `outstanding_amount > 0` but doesn't validate that payment amount ≤ outstanding.
- Payment can be created with amount > outstanding, which would result in negative outstanding (though `deriveInvoiceState` caps it at 0).

**Files:**
- `app/[workspaceId]/payments/actions.ts` (CRUD + recalculation)
- `app/[workspaceId]/payments/_components/PaymentForm.tsx` (form, no overpayment validation)

**Status:** ⚠️ **Partially implemented** - Missing overpayment validation.

#### B2. Payment Sources

**What exists:**
- `lib/payments/schema.ts` defines `PaymentMethodEnum`: `cash`, `bank_transfer`, `card`, `check`, `other`.
- Schema used in `PaymentFormSchema`.
- `payments` table has `method` field (confirmed in types).

**Status:** ✅ **Implemented & wired correctly**

---

### Phase C — Reminders Engine

#### C1. Reminder Rules & Templates

**What exists:**
- Tables:
  - `reminder_rules` (`supabase/migrations/20250101000003_create_reminder_rules.sql`) with fields: `trigger_type`, `offset_days`, `for_status`, `is_enabled`, `template_id`.
  - `reminder_templates` (`supabase/migrations/20250101000001_create_reminder_templates.sql`) with `subject`, `body`, `is_enabled`.
- UI: `app/[workspaceId]/settings/_components/ReminderSettingsForm.tsx` (editable).
- Logic: `lib/reminders/engine.ts` has:
  - `findApplicableRuleForInvoice()` - matches rules to invoices based on timing
  - `getSuggestedRemindersForWorkspace()` - suggests reminders based on rules
- Template resolution: `lib/reminders/resolve-template.ts` exists.

**Status:** ✅ **Implemented & wired correctly**

#### C2. Reminder Cron / Worker

**What exists:**
- Manual sending: `app/api/workspaces/[workspaceId]/reminders/send/route.ts` (POST endpoint).
- Suggestion logic: `lib/reminders/engine.ts` can find applicable reminders.
- Duplicate protection: `findApplicableRuleForInvoice()` checks if reminder already sent today (lines 133-149).

**What is missing:**
- ❌ No automated cron/worker/scheduled job.
- ❌ No script or Edge Function that runs periodically to:
  1. Find invoices due for reminder
  2. Send reminders via API
  3. Log results

**Status:** ❌ **Missing** - No automated reminder processing.

---

### Phase D — Dashboard Data Correctness

**What exists:**
- Dashboard data loader (`app/[workspaceId]/dashboard/_utils/dataLoader.ts`) queries `invoices_view` (line 101).
- Metrics calculated from view fields:
  - `total_amount`, `paid_amount`, `outstanding` from view
  - `overdue_days`, `risk_level` from view
  - `display_status` from view
- No manual sums that bypass the view.
- Charts use aggregated data from the view.

**Status:** ✅ **Implemented & wired correctly**

---

### Phase E — Multi-Workspace & Permissions

**What exists:**
- `workspace_id` filtering in queries:
  - Invoices: `app/[workspaceId]/invoices/actions.ts:83` sets `workspace_id` on insert.
  - Payments: `app/[workspaceId]/payments/actions.ts:91` sets `workspace_id` on insert.
  - Dashboard: `app/[workspaceId]/dashboard/_utils/dataLoader.ts:101` filters by `workspace_id`.
- RLS policies found for:
  - `reminder_rules` (migration file)
  - `reminder_templates` (migration file)

**What is missing:**
- ❓ Need to verify RLS on `invoices`, `payments`, `clients` tables (migrations not fully reviewed).
- ❓ `workspace_members` table existence and usage unclear (mentioned in RLS policy TODOs but not confirmed).

**Files checked:**
- `app/[workspaceId]/invoices/actions.ts` (has workspace_id)
- `app/[workspaceId]/payments/actions.ts` (has workspace_id)
- `supabase/migrations/20250101000003_create_reminder_rules.sql` (RLS policies)

**Status:** ⚠️ **Partially implemented** - Workspace filtering exists but RLS audit incomplete.

---

### Phase F — Import / Export (CSV)

**What exists:**
- ❌ No CSV import code found.
- ❌ No CSV export code found.
- ❌ No PapaParse or similar library in dependencies.

**Status:** ❌ **Missing**

---

### Phase G — Settings Module

**What exists:**
- Tables:
  - `workspace_email_settings` (migration exists, used in settings page)
  - `settings` (from types, has `logo_url`)
  - `workspaces` (has `name`, `email`, `phone`, `address` fields)
- UI: `app/[workspaceId]/settings/page.tsx` with tabs:
  - `WorkspaceProfileForm` (name, logo)
  - `EmailSettingsForm` (SMTP config)
  - `ReminderSettingsForm` (auto-send toggle)
  - `PaymentSettingsForm`
- Settings used in:
  - PDF generation: `app/[workspaceId]/invoices/[invoiceId]/pdf/route.ts:14-18` loads workspace name/email/phone/address.
  - Email sending: `app/api/workspaces/[workspaceId]/reminders/send/route.ts:217` loads `workspace_email_settings`.

**What is missing:**
- Need to verify all settings fields are actually used (logo_url, tax number, etc.).

**Status:** ✅ **Implemented & wired correctly**

---

### Phase H — Audit Logs

**What exists:**
- `activity_logs` table defined in `types/supabase.ts:17-64` with fields:
  - `action`, `entity_type`, `entity_id`, `metadata`, `user_id`, `organization_id`

**What is missing:**
- ❌ No usage of `activity_logs` table in app code.
- ❌ No `logAction()` or `logAudit()` helper functions.
- ❌ No logging of:
  - Invoice created/updated/deleted
  - Invoice sent
  - Payment added/updated/deleted
  - Reminder sent

**Status:** ❌ **Schema only (not used in app)**

---

### Phase I — Deployment & Stability

**What exists:**
- RLS enabled on `reminder_rules` and `reminder_templates` (confirmed in migrations).
- Workspace filtering in queries (confirmed).

**What is missing:**
- ❓ RLS on `invoices`, `payments`, `clients` tables not verified (need to check all migrations).
- ❌ No error boundaries found in app code.
- ❌ No rate limiting middleware found for API routes.
- ❓ Environment variable usage for Supabase (need to verify `.env` patterns).

**Status:** ⚠️ **Uncertain** - Partial RLS, missing error handling.

---

## 3. Prioritized TODO List

### 1) MUST FIX NOW (Blocking MVP)

- [ ] **Add overpayment validation** in `app/[workspaceId]/payments/actions.ts`
  - In `createPayment()`, validate: `parsed.amount <= invoice.outstanding_amount`
  - Return error if payment would exceed outstanding
  - File: `app/[workspaceId]/payments/actions.ts:66-118`

- [ ] **Consolidate invoice status calculation**
  - Decision: Use SQL view (`invoices_view.display_status`) as single source of truth
  - Remove or deprecate `deriveInvoiceState()` for status (keep only for payment state recalculation)
  - Update all code to use `display_status` from view
  - Files: `lib/invoices/deriveState.ts`, `app/[workspaceId]/payments/actions.ts:43`

- [ ] **Complete RLS audit**
  - Verify RLS enabled on `invoices`, `payments`, `clients` tables
  - Check all migrations for RLS policies
  - Ensure workspace_id filtering is enforced at DB level, not just app level

### 2) IMPORTANT BEFORE BETA

- [ ] **Implement invoice delivery system**
  - Create `invoice_delivery_logs` table (migration)
  - Create API endpoint: `app/api/workspaces/[workspaceId]/invoices/[invoiceId]/send/route.ts`
  - Reuse email sending logic from reminders (nodemailer/SMTP)
  - Add "Send invoice" button to invoice detail page
  - Log delivery attempts (success/failure, timestamp, error message)
  - Files to create: migration, API route, UI component

- [ ] **Wire audit logging**
  - Create helper: `lib/audit/logAction.ts`
  - Log in `app/[workspaceId]/invoices/actions.ts`:
    - Invoice created (line 19)
    - Invoice updated (line 160)
    - Invoice deleted (line 322)
  - Log in `app/[workspaceId]/payments/actions.ts`:
    - Payment created (line 66)
    - Payment updated (line 120)
    - Payment deleted (line 173)
  - Log in reminder API: reminder sent (already has logging to `reminders` table, but add to `activity_logs` too)

- [ ] **Implement reminder cron/worker**
  - Option A: Supabase Edge Function with pg_cron
  - Option B: External cron service (Vercel Cron, GitHub Actions, etc.)
  - Script should:
    1. Call `getSuggestedRemindersForWorkspace()` for each workspace
    2. For each suggestion, call reminder send API
    3. Handle errors gracefully
  - File: Create `supabase/functions/process-reminders/index.ts` or external script

### 3) NICE TO HAVE LATER

- [ ] **CSV import for clients**
  - Create UI: `app/[workspaceId]/clients/import/page.tsx`
  - Use PapaParse or similar
  - Map CSV columns to client fields
  - Validate and bulk insert

- [ ] **CSV export for invoices**
  - Create API route: `app/api/workspaces/[workspaceId]/invoices/export/route.ts`
  - Export filtered invoices as CSV
  - Include all relevant columns

- [ ] **Add error boundaries**
  - Create `components/ErrorBoundary.tsx`
  - Wrap main app routes
  - Show user-friendly error messages

- [ ] **Rate limiting for API routes**
  - Add middleware for `/api/workspaces/[workspaceId]/reminders/send`
  - Prevent abuse
  - Use Vercel Edge Config or similar

- [ ] **Verify PDF download UI exists**
  - Check `app/[workspaceId]/invoices/[invoiceId]/page.tsx` for PDF download link
  - Add if missing: `<Link href={`/${workspaceId}/invoices/${id}/pdf`}>Download PDF</Link>`

---

## Summary Statistics

- **Implemented & wired correctly:** 6 features (A2, A3, B2, C1, D, G)
- **Partially implemented:** 3 features (A1, B1, E)
- **Schema only (not used):** 1 feature (H)
- **Missing:** 3 features (A4, C2, F)

**Overall Health:** 🟡 **Moderate** - Core functionality exists but missing critical features (invoice delivery, automated reminders) and has some technical debt (status duplication, missing validations).

---

**End of Audit Report**
