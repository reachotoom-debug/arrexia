// Synthetic disposable loopback PostgreSQL only; never reads app credentials.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { mkdtempSync, readFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const root = mkdtempSync(join(tmpdir(), 'arrexia-payment-net-'));
const data = join(root, 'data'), port = '55451';
const { exe, env } = require('./local-postgres-config.cjs');
const ws = '00000000-0000-0000-0000-000000000001';
const user = '00000000-0000-0000-0000-000000000002';
const inv = '00000000-0000-0000-0000-000000000003';
const pay = '00000000-0000-0000-0000-000000000004';
const other = '00000000-0000-0000-0000-000000000005';
const q = x => x === null ? 'NULL' : "'" + String(x).replaceAll("'", "''") + "'";
const sql = input => execFileSync(exe('psql'), ['-X','-h','127.0.0.1','-p',port,'-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-At'], { input, encoding:'utf8',env,windowsHide:true,stdio:'pipe' }).trim();
let started = false;
before(() => {
  execFileSync(exe('initdb'), ['-D',data,'-U','postgres','-A','trust','--no-locale','-E','UTF8'], {env,windowsHide:true,stdio:'pipe'});
  execFileSync(exe('pg_ctl'), ['-D',data,'-l',join(root,'postgres.log'),'-o',`-p ${port} -h 127.0.0.1`,'-w','start'], {env,windowsHide:true,stdio:'ignore'});
  started = true;
  sql(`create role anon; create role authenticated; create schema auth;
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('fixture.uid',true),'')::uuid$$;
    create table workspace_members(workspace_id uuid,user_id uuid);
    insert into workspace_members values ('${ws}','${user}');
    create table clients(id uuid primary key,name text,is_active boolean,archived_at timestamptz);
    create table settings(workspace_id uuid,timezone text);
    create table invoices(id uuid primary key,workspace_id uuid,client_id uuid,invoice_number text,issue_date date,due_date date,status text,amount numeric,currency text,po_number text,notes text,archived_at timestamptz);
    create table payments(id uuid primary key,workspace_id uuid,invoice_id uuid,client_id uuid,amount numeric,transaction_fee numeric default 0,net_amount numeric generated always as (amount - transaction_fee) stored,status text,archived_at timestamptz,payment_date date,method text,transaction_id text,notes text,payment_provider text);
    insert into invoices(id,workspace_id,amount,status) values ('${inv}','${ws}',100,'sent');`);
  sql(readFileSync('supabase/migrations/20260725000000_invoices_view_workspace_business_date.sql','utf8'));
  sql(readFileSync('supabase/migrations/20260825140000_rpc_unarchive_payment_manual_and_legacy_paid.sql','utf8'));
  if (process.env.PAYMENT_NET_BASELINE !== '1') sql(readFileSync('supabase/migrations/20261015140000_payment_update_generated_net_guard.sql','utf8'));
  console.log('Fixture server: '+sql('select version()'));
});
after(() => { if(started) execFileSync(exe('pg_ctl'),['-D',data,'-m','fast','-w','stop'],{env,windowsHide:true,stdio:'ignore'}); });
function fixture(amount=50,fee=0,status='completed',archived=false,extra=0) {
  sql(`delete from payments; update invoices set amount=100,archived_at=null; insert into payments(id,workspace_id,invoice_id,amount,transaction_fee,status,archived_at) values ('${pay}','${ws}','${inv}',${amount},${q(fee)},${q(status)},${archived?"now()":'NULL'});` + (extra ? `insert into payments(id,workspace_id,invoice_id,amount,status) values ('${other}','${ws}','${inv}',${extra},'paid');` : ''));
}
const state = () => JSON.parse(sql(`select json_build_array((select row_to_json(p) from payments p where id='${pay}'),(select json_build_array(total,paid,outstanding) from invoices_view where id='${inv}'));`));
function update(amount,status='completed',workspace=ws,uid=user,invoice=inv,client=null) {
  return sql(`set fixture.uid=${q(uid)}; select rpc_update_payment_manual('${workspace}','${pay}',${q(client)},${q(invoice)},${amount},'2026-10-15','manual',${q(status)},null,null,null);`);
}
function rejected(amount,status='completed',pattern=/overpayment/, ...args) { const prior=state(); assert.throws(()=>update(amount,status,...args),pattern); assert.deepEqual(state(),prior); }
test('generated net increase cannot silently overpay; rejection is atomic',()=>{fixture(50); rejected(101);});
test('fee net is recomputed on increases and decreases, fee remains fixed',()=>{
  for(const fee of [0,3]) { fixture(50,fee); update(80); assert.equal(state()[0].net_amount,80-fee); assert.equal(state()[0].transaction_fee,fee); assert.deepEqual(state()[1],[100,80-fee,20+fee]); update(40); assert.deepEqual(state()[1],[100,40-fee,60+fee]); }
});
test('all canonical status transitions use the persisted generated net',()=>{
  for(const old of [null,'completed','paid','pending','refunded','failed']) for(const next of [null,'completed','paid','pending','refunded','failed']) {
    fixture(50,3,old); update(80,next); const effective=next===null||['completed','paid'].includes(next)?77:0;
    assert.equal(state()[0].net_amount,77); assert.deepEqual(state()[1],[100,effective,100-effective]);
  }
});
test('other payments, fee and one-cent tolerance constrain real new total',()=>{
  fixture(50,3,'completed',false,40); update(63.01); assert.deepEqual(state()[1],[100,100.01,0]); rejected(63.02);
  fixture(50,3,'pending',false,40); rejected(64,'paid'); update(63,'paid'); assert.deepEqual(state()[1],[100,100,0]);
});
test('archived edits remain archived and contribute zero before and after',()=>{
  for(const status of [null,'completed','paid','pending','refunded','failed']) { fixture(50,3,status,true,100); update(500,'paid'); assert.ok(state()[0].archived_at); assert.deepEqual(state()[1],[100,100,0]); }
});
test('existing overpayment permits corrections but rejects further increases',()=>{
  fixture(120,0,'completed'); rejected(121); update(115); assert.deepEqual(state()[1],[100,115,0]); update(115); update(100); assert.deepEqual(state()[1],[100,100,0]);
});
test('old noncanonical statuses do not subtract invisible contribution',()=>{
  for(const status of ['COMPLETED',' paid ','']) { fixture(50,0,status,false,80); rejected(30,'paid'); update(20,'paid'); assert.deepEqual(state()[1],[100,100,0]); }
});
test('nullable fee preserves generated NULL and canonical gross fallback',()=>{
  fixture(50,null); rejected(101); update(80); assert.equal(state()[0].net_amount,null); assert.equal(state()[0].transaction_fee,null); assert.deepEqual(state()[1],[100,80,20]);
});
test('authentication, membership, workspace, invoice and client immutability remain enforced',()=>{
  fixture(); rejected(60,'paid',/Not authenticated/,ws,''); rejected(60,'paid',/Not a workspace member/,ws,other); rejected(60,'paid',/Not a workspace member/,other); rejected(60,'paid',/Cannot change invoice/,ws,user,other);
  sql(`update payments set client_id='${user}'`); rejected(60,'paid',/Cannot change client/,ws,user,inv,other);
  sql(`insert into workspace_members values ('${other}','${user}')`); rejected(60,'paid',/Payment not found/,other);
});
test('execution grants and security context remain restricted',()=>{
  assert.deepEqual(JSON.parse(sql(`select json_build_array(prosecdef,proconfig,has_function_privilege('anon',oid,'EXECUTE'),has_function_privilege('authenticated',oid,'EXECUTE')) from pg_proc where oid='public.rpc_update_payment_manual(uuid,uuid,uuid,uuid,numeric,date,text,text,text,text,text)'::regprocedure;`)),[true,['search_path=pg_catalog, public'],false,true]);
});
test('migration refuses an ordinary net column before replacing the guard',()=>{
  const migration=readFileSync('supabase/migrations/20261015140000_payment_update_generated_net_guard.sql','utf8');
  assert.throws(()=>sql(`begin; drop view invoices_view; alter table payments drop column net_amount; alter table payments add column net_amount numeric; ${migration}`),/requires stored generated net_amount/);
  fixture(); update(60); assert.deepEqual(state()[1],[100,60,40]);
});



