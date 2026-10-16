// Disposable local PostgreSQL only. Does not read application credentials or URLs.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { mkdtempSync, readFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { exe, env } = require('./local-postgres-config.cjs');
const root = mkdtempSync(join(tmpdir(), 'arrexia-invoice-totals-'));
const data = join(root, 'data');
const port = '55449';
let started = false;
const sql = text => execFileSync(exe('psql'), ['-X', '-h', '127.0.0.1', '-p', port, '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At'], { input: text, encoding: 'utf8', env, windowsHide: true, stdio: 'pipe' }).trim();
const quote = text => "'" + String(text).replaceAll("'", "''") + "'";
const ws = '00000000-0000-0000-0000-000000000001';
const org = '00000000-0000-0000-0000-000000000002';
function rows(number, total = 100) {
  return [{ row_type: 'invoice', invoice_number: number, client_email: 'synthetic@example.invalid', issue_date: '2026-10-01', due_date: '2026-10-31', currency: 'USD', status: 'sent' },
    { row_type: 'item', invoice_number: number, item_description: 'Synthetic service', quantity: 2, unit_price: total / 2 }];
}
const importRows = (payload, dry = false) => JSON.parse(sql(`select public.internal_import_invoices_grouped('${ws}',${quote(JSON.stringify(payload))}::jsonb,${dry});`));
const financials = number => JSON.parse(sql(`select json_build_array(subtotal,discount_percent,discount_amount,tax_percent,tax_amount,amount) from public.invoices where invoice_number=${quote(number)};`));
before(() => {
  execFileSync(exe('initdb'), ['-D', data, '-U', 'postgres', '-A', 'trust', '--no-locale', '-E', 'UTF8'], { env, windowsHide: true, stdio: 'pipe' });
  execFileSync(exe('pg_ctl'), ['-D', data, '-l', join(root, 'postgres.log'), '-o', `-p ${port} -h 127.0.0.1`, '-w', 'start'], { env, windowsHide: true, stdio: 'ignore' });
  started = true;
  sql(`create role anon; create role authenticated; create role service_role;
    create table public.workspaces(id uuid primary key, organization_id uuid);
    create table public.clients(id uuid primary key default gen_random_uuid(), workspace_id uuid, name text, email text, is_active boolean default true, archived_at timestamptz);
    create table public.settings(workspace_id uuid primary key, timezone text);
    create table public.invoices(id uuid primary key default gen_random_uuid(), workspace_id uuid, organization_id uuid, client_id uuid,
      invoice_number text, issue_date date, due_date date, currency char(3), status text, po_number text, notes text,
      subtotal numeric default 0, discount_percent numeric default 0, discount_amount numeric default 0,
      tax_percent numeric default 0, tax_amount numeric default 0, amount numeric default 0, updated_at timestamptz, archived_at timestamptz);
    create table public.invoice_items(id uuid default gen_random_uuid(), organization_id uuid, invoice_id uuid references public.invoices,
      name text, description text, quantity numeric, unit_price numeric, position integer);
    create table public.payments(workspace_id uuid default '${ws}', invoice_id uuid references public.invoices, amount numeric,
      transaction_fee numeric default 0, net_amount numeric generated always as (amount - coalesce(transaction_fee, 0)) stored, status text, archived_at timestamptz);
    insert into public.workspaces values ('${ws}','${org}');
    insert into public.clients(workspace_id,name,email) values ('${ws}','Synthetic Customer','synthetic@example.invalid');`);
  sql(readFileSync('supabase/migrations/' + (process.env.INVOICE_TOTALS_BASELINE === '1'
    ? '20260825150000_invoice_import_financial_hardening.sql'
    : '20261015120000_invoice_import_stored_totals_consistency.sql'), 'utf8'));
  sql(readFileSync('supabase/migrations/20260725000000_invoices_view_workspace_business_date.sql', 'utf8'));
  console.log('Fixture server: '+sql('select version()'));
});
after(() => {
  if (started) execFileSync(exe('pg_ctl'), ['-D', data, '-m', 'fast', '-w', 'stop'], { env, windowsHide: true, stdio: 'ignore' });
});
test('new grouped import stores matching subtotal and total with zero unsupported adjustments', () => {
  assert.equal(importRows(rows('FIXTURE-NEW')).ok, true);
  assert.deepEqual(financials('FIXTURE-NEW'), [100, 0, 0, 0, 0, 100]);
});
test('reimport replaces previous financial fields consistently; dry run does not change them', () => {
  assert.equal(importRows(rows('FIXTURE-REIMPORT')).ok, true);
  sql("update public.invoices set subtotal=100,discount_percent=10,discount_amount=10,tax_percent=20,tax_amount=18,amount=108 where invoice_number='FIXTURE-REIMPORT';");
  assert.equal(importRows(rows('FIXTURE-REIMPORT', 200), true).ok, true);
  assert.deepEqual(financials('FIXTURE-REIMPORT'), [100, 10, 10, 20, 18, 108]);
  assert.equal(importRows(rows('FIXTURE-REIMPORT', 200)).ok, true);
  assert.deepEqual(financials('FIXTURE-REIMPORT'), [200, 0, 0, 0, 0, 200]);
  assert.equal(sql("select sum(quantity*unit_price) from public.invoice_items where invoice_id=(select id from public.invoices where invoice_number='FIXTURE-REIMPORT');"), '200');
});
test('paid-floor rejects preview and execution before changing financial fields or items', () => {
  assert.equal(importRows(rows('FIXTURE-PAID')).ok, true);
  sql("insert into public.payments(invoice_id,amount,transaction_fee,status) select id,90,10,'completed' from public.invoices where invoice_number='FIXTURE-PAID';");
  const before = financials('FIXTURE-PAID');
  for (const dry of [true, false]) assert.equal(importRows(rows('FIXTURE-PAID', 70), dry).ok, false);
  assert.deepEqual(financials('FIXTURE-PAID'), before);
  assert.equal(sql("select sum(quantity*unit_price) from public.invoice_items where invoice_id=(select id from public.invoices where invoice_number='FIXTURE-PAID');"), '100');
  assert.equal(importRows(rows('FIXTURE-PAID', 80)).ok, true); // effective payment remains net_amount
});
test('invalid line rejects the whole batch without replacing existing headers or totals', () => {
  assert.equal(importRows(rows('FIXTURE-ATOMIC')).ok, true);
  const payload = [...rows('FIXTURE-ATOMIC', 200), ...rows('FIXTURE-BAD')];
  payload.at(-1).quantity = 0;
  assert.equal(importRows(payload).ok, false);
  assert.deepEqual(financials('FIXTURE-ATOMIC'), [100, 0, 0, 0, 0, 100]);
  assert.equal(sql("select count(*) from public.invoices where invoice_number='FIXTURE-BAD';"), '0');
});
test('documents existing fee semantics in canonical invoices_view without changing accounting', () => {
  assert.equal(importRows(rows('FIXTURE-FEE')).ok, true);
  sql("insert into public.payments(invoice_id,amount,transaction_fee,status) select id,100,3,'completed' from public.invoices where invoice_number='FIXTURE-FEE';");
  const actual = JSON.parse(sql("select json_build_array(total,paid,outstanding) from public.invoices_view where invoice_number='FIXTURE-FEE';"));
  assert.deepEqual(actual, [100, 97, 3]);
});
