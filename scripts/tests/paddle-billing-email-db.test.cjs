// Real PostgreSQL tests. Uses a disposable cluster, never application connection strings.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync, execFile } = require('node:child_process');
const { mkdtempSync, readFileSync, existsSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { promisify } = require('node:util');
const bin = process.env.PADDLE_TEST_PG_BIN || 'C:/Program Files/PostgreSQL/15/bin';
const root = mkdtempSync(join(tmpdir(), 'arrexia-paddle-test-'));
const data = join(root, 'data');
const port = '55440';
const exe = name => join(bin, name + (process.platform === 'win32' ? '.exe' : ''));
const args = ['-X', '-h', '127.0.0.1', '-p', port, '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At'];
const env = { ...process.env };
for (const key of Object.keys(env)) if (key.startsWith('PG')) delete env[key];
const sql = text => execFileSync(exe('psql'), args, { input: text, encoding: 'utf8', env, windowsHide: true, stdio: 'pipe' }).trim();
const json = text => JSON.parse(sql(text));
const asyncSql = text => promisify(execFile)(exe('psql'), [...args, '-c', text], { env, windowsHide: true });
const quote = value => "'" + String(value).replaceAll("'", "''") + "'";
const ws = '00000000-0000-0000-0000-000000000001';
let started = false;
let sequence = 0;
function claim(id, type = 'subscription.updated', at = '2026-09-01T00:00:00Z') {
  return json(`select public.rpc_claim_paddle_webhook(${quote(id)},${quote(type)},${quote(at)},'production');`);
}
function payload(overrides = {}) {
  return { workspace_id: ws, provider_subscription_id: 'sub_one', provider_customer_id: 'ctm_one',
    plan: 'starter', billing_interval: 'monthly', status: 'active', provider_status: 'active',
    paddle_environment: 'production', invoice_limit_monthly: 100, client_limit: 50, cancel_at_period_end: false, ...overrides };
}
function applyQuery(id, token, body = payload()) {
  return `select public.rpc_apply_paddle_webhook(${quote(id)},${quote(token)},${quote(JSON.stringify(body))}::jsonb,'production');`;
}
function deliver(type, at, body) {
  const id = `evt_${++sequence}`;
  const c = claim(id, type, at);
  return json(applyQuery(id, c.claim_token, type === 'transaction.completed' ? {...body, provider_status:'completed'} : body));
}
function reset() {
  sql(`truncate public.paddle_webhook_events, public.paddle_subscription_bindings, public.workspace_subscriptions, public.workspace_plans, public.workspaces cascade;
    insert into public.workspaces values ('${ws}', '2026-08-01');
    insert into public.workspace_subscriptions(workspace_id,status,plan,trial_starts_at,trial_ends_at,trial_consumed_at)
    values ('${ws}','trial','free','2026-08-01','2026-08-15','2026-08-01');`);
}
before(() => {
  assert.ok(existsSync(exe('initdb')), 'Install PostgreSQL or set PADDLE_TEST_PG_BIN');
  execFileSync(exe('initdb'), ['-D', data, '-U', 'postgres', '-A', 'trust', '--no-locale', '-E', 'UTF8'], { env, windowsHide: true });
  execFileSync(exe('pg_ctl'), ['-D', data, '-l', join(root, 'postgres.log'), '-o', `-p ${port} -h 127.0.0.1 -c timezone=UTC`, '-w', 'start'], { env, windowsHide: true, stdio: 'ignore' });
  started = true;
  sql(`create role anon; create role authenticated; create role service_role;
    alter default privileges in schema public grant all on tables to anon,authenticated,service_role;
    create table public.workspaces(id uuid primary key, trial_consumed_at timestamptz);
    create table public.workspace_plans(workspace_id uuid primary key references public.workspaces on delete cascade, plan text,
      invoice_limit_monthly integer, client_limit integer, updated_at timestamptz);
    create table public.workspace_subscriptions(workspace_id uuid primary key references public.workspaces on delete cascade,
      status text, plan text, payment_provider text default 'manual', trial_starts_at timestamptz,
      trial_ends_at timestamptz, trial_consumed_at timestamptz, current_period_starts_at timestamptz,
      current_period_ends_at timestamptz, cancel_at_period_end boolean default false,
      provider_customer_id text, provider_subscription_id text, updated_at timestamptz);`);
  for (const file of ['20260822120000_annual_billing_interval.sql', '20260829180000_paddle_webhook_events.sql',
    '20260830120000_paddle_provider_last_event_at.sql', '20260830140000_workspace_paid_lifecycle_events.sql', '20260927120000_paddle_atomic_webhook_recovery.sql']) {
    if (file === '20260927120000_paddle_atomic_webhook_recovery.sql') {
      sql(`insert into public.workspaces values ('${ws}','2026-08-01');
        insert into public.workspace_subscriptions(workspace_id,status,plan,payment_provider,provider_subscription_id)
          values ('${ws}','active','starter','paddle','historical_subscription');
        insert into public.paddle_webhook_events(event_id,event_type,occurred_at,status)
          values ('historical_event','transaction.completed','2026-09-01','processed');`);
    }
    sql(readFileSync(join('supabase/migrations', file), 'utf8'));
  }
  sql(readFileSync(join('supabase/migrations','20261001120000_paddle_billing_email_delivery.sql'),'utf8'));
});

after(() => { if (started) execFileSync(exe('pg_ctl'), ['-D',data,'-m','fast','-w','stop'],{env,windowsHide:true,stdio:'ignore'}); });
test('completed Live activation queues once and fences delivery',()=>{
 reset(); const body=payload({transaction_id:'txn_first',transaction_origin:'web',transaction_totals:{total:'1000',currency_code:'USD'}});
 const result=deliver('transaction.completed','2026-09-01',body); assert.ok(result.notification_id); assert.equal(result.notify_activation,false);
 const c=json(`select public.rpc_claim_paid_billing_email('${result.notification_id}')`); assert.equal(c.state,'claimed');
 const request={to:'local@example.test',subject:'Activation'};
 assert.deepEqual(json(`select public.rpc_prepare_paid_billing_email('${result.notification_id}','${c.notification.claim_token}','${JSON.stringify(request)}')`),request);
 assert.equal(sql(`select public.rpc_finish_paid_billing_email('${result.notification_id}','${c.notification.claim_token}','sent','message')`),'t');
 assert.equal(json(`select public.rpc_claim_paid_billing_email('${result.notification_id}')`).state,'unavailable');
});


test('renewals preserve original transaction period after cancellation; unknown origins stay quiet',()=>{
 reset(); deliver('subscription.updated','2026-09-02',payload({scheduled_change_action:null,period_ends_at:'2027-01-01'}));
 deliver('subscription.canceled','2026-09-03',payload({provider_status:'canceled',status:'cancelled',scheduled_change_action:null}));
 const r=deliver('transaction.completed','2026-09-01',payload({transaction_id:'txn_renew',transaction_origin:'subscription_recurring',period_starts_at:'2026-08-01',period_ends_at:'2026-09-01'}));
 assert.ok(r.notification_id); assert.equal(sql(`select period_ends_at::date from public.workspace_paid_lifecycle_events where id='${r.notification_id}'`),'2026-09-01');
 assert.equal(sql('select status from public.workspace_subscriptions'),'cancelled');
 assert.equal(deliver('transaction.completed','2026-09-04',payload({transaction_id:'unknown',transaction_origin:'unknown'})).notification_id,undefined);
});
function queued() {reset(); return deliver('transaction.completed','2026-09-01',payload({transaction_id:'txn',transaction_origin:'web'})).notification_id;}
function emailClaim(id) {return json(`select public.rpc_claim_paid_billing_email('${id}')`);}
function prep(id,c,request={subject:'first'}) {return json(`select public.rpc_prepare_paid_billing_email('${id}','${c.notification.claim_token}','${JSON.stringify(request)}')`);}
test('immutable provider request, expired tokens, safe pre-request retry and ambiguous cutoff',()=>{
 const id=queued();let a=emailClaim(id); assert.equal(emailClaim(id).state,'unavailable');
 sql(`update public.workspace_paid_lifecycle_events set lease_expires_at=now()-interval '1 second' where id='${id}'`);
 let b=emailClaim(id); assert.notEqual(a.notification.claim_token,b.notification.claim_token);assert.equal(b.notification.uncertainty,false);
 assert.throws(()=>prep(id,a),/claim/i);assert.equal(sql(`select public.rpc_finish_paid_billing_email('${id}','${a.notification.claim_token}','failed')`),'f');
 assert.deepEqual(prep(id,b),{subject:'first'});assert.deepEqual(prep(id,b,{subject:'changed'}),{subject:'first'});
 sql(`update public.workspace_paid_lifecycle_events set lease_expires_at=now()-interval '1 second' where id='${id}'`);
 let c=emailClaim(id); assert.equal(c.notification.uncertainty,true);
 sql(`update public.workspace_paid_lifecycle_events set lease_expires_at=now()-interval '1 second',first_attempt_at=now()-interval '24 hours' where id='${id}'`);
 assert.equal(emailClaim(id).state,'unavailable');assert.equal(sql(`select delivery_status||':'||(available_at is null)::text from public.workspace_paid_lifecycle_events where id='${id}'`),'uncertain:true');
});
test('explicit failures remain retryable past provider window',()=>{
 const id=queued(),c=emailClaim(id);prep(id,c);
 assert.equal(sql(`select public.rpc_finish_paid_billing_email('${id}','${c.notification.claim_token}','failed',null,'known rejection')`),'t');
 sql(`update public.workspace_paid_lifecycle_events set available_at=now()-interval '1 minute',first_attempt_at=now()-interval '2 days' where id='${id}'`);
 assert.equal(emailClaim(id).state,'claimed');
});
test('concurrent claims have one owner',async()=>{
 const id=queued(); const results=await Promise.all(Array.from({length:4},()=>asyncSql(`select public.rpc_claim_paid_billing_email('${id}')`)));
 assert.equal(results.filter(x=>JSON.parse(x.stdout).state==='claimed').length,1);
});
test('intent failure rolls back payment ledger and entitlement projection',()=>{
 reset();sql(`create function fail_email_intent() returns trigger language plpgsql as $$begin if NEW.notification_kind is not null then raise exception 'injected intent failure';end if;return NEW;end$$;create trigger fail_intent before insert on workspace_paid_lifecycle_events for each row execute function fail_email_intent();`);
 const c=claim('atomic_email','transaction.completed');assert.throws(()=>json(applyQuery('atomic_email',c.claim_token,payload({provider_status:'completed',transaction_id:'atomic',transaction_origin:'web'}))),/injected intent/);
 assert.equal(sql('select status from workspace_subscriptions'),'trial');assert.equal(sql("select status from paddle_webhook_events where event_id='atomic_email'"),'processing');
 sql('drop trigger fail_intent on workspace_paid_lifecycle_events;drop function fail_email_intent();');
});
test('annual reminders require known lifecycle state and revalidate same date',()=>{
 reset();const end=json("select to_jsonb(clock_timestamp()+interval '15 days')");
 deliver('subscription.updated','2026-09-01',payload({billing_interval:'annual',period_ends_at:end}));assert.equal(sql('select rpc_enqueue_annual_billing_reminders()'),'0');
 deliver('subscription.updated','2026-09-02',payload({billing_interval:'annual',period_ends_at:end,scheduled_change_action:null}));assert.equal(sql('select rpc_enqueue_annual_billing_reminders()'),'1');assert.equal(sql('select rpc_enqueue_annual_billing_reminders()'),'0');
 const id=sql("select id from workspace_paid_lifecycle_events where notification_kind='annual_reminder'");const c=emailClaim(id);assert.equal(c.state,'claimed');
 deliver('subscription.updated','2026-09-03',payload({billing_interval:'annual',period_ends_at:end,scheduled_change_action:'pause'}));assert.throws(()=>prep(id,c),/eligible/);
});
test('RPC access and immutable request column safeguards',()=>{
 for(const role of ['anon','authenticated']) {assert.equal(sql(`select has_table_privilege('${role}','workspace_paid_lifecycle_events','TRUNCATE')`),'f');assert.equal(sql(`select has_function_privilege('${role}','rpc_claim_paid_billing_email(uuid)','execute')`),'f');}
 assert.equal(sql("select has_function_privilege('service_role','internal_apply_paddle_webhook_core(text,uuid,jsonb,text)','execute')"),'f');
});
test('activation revalidation skips canceled state and legacy rows never enter recovery',()=>{
 const id=queued(); deliver('subscription.canceled','2026-09-02',payload({provider_status:'canceled',status:'cancelled'}));assert.equal(emailClaim(id).state,'unavailable');assert.equal(sql(`select delivery_status from workspace_paid_lifecycle_events where id='${id}'`),'skipped');
 sql(`insert into workspace_paid_lifecycle_events(workspace_id,provider_subscription_id,event_key) values('${ws}','legacy','paid_subscription_activated')`);
 const legacy=sql("select id from workspace_paid_lifecycle_events where provider_subscription_id='legacy'");assert.equal(emailClaim(legacy).state,'unavailable');assert.equal(sql(`select coalesce(notification_kind,'unknown')||':'||coalesce(paddle_environment,'unknown') from workspace_paid_lifecycle_events where id='${legacy}'`),'unknown:unknown');
});
test('direct snapshot changes fail and finish requires a prepared accepted message',()=>{
 const id=queued(),c=emailClaim(id);assert.throws(()=>sql(`select rpc_finish_paid_billing_email('${id}','${c.notification.claim_token}','sent',null)`),/message id/);
 assert.equal(sql(`select rpc_finish_paid_billing_email('${id}','${c.notification.claim_token}','sent','msg')`),'f');prep(id,c);
 assert.throws(()=>sql(`update workspace_paid_lifecycle_events set request_payload='{}' where id='${id}'`),/immutable/);
 assert.throws(()=>sql(`update workspace_paid_lifecycle_events set resend_idempotency_key='rotated-key' where id='${id}'`),/immutable/);
});
test('reminder batches skip queued and unknown cohorts before their bound',()=>{
 reset(); const end=json("select to_jsonb(clock_timestamp()+interval '15 days')");
 sql(`alter table workspace_subscriptions disable trigger paddle_live_projection_guard;
 insert into workspaces select ('00000000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid,null from generate_series(2,61) i;
 insert into workspace_subscriptions(workspace_id,status,plan,payment_provider,paddle_environment,provider_subscription_id,provider_customer_id,billing_interval,current_period_ends_at,cancel_at_period_end)
 select id,'active','starter','paddle','production','annual_'||id,'ctm_'||id,'annual','${end}'::timestamptz,false from workspaces where id<>'${ws}';
 alter table workspace_subscriptions enable trigger paddle_live_projection_guard;
 insert into workspace_paid_lifecycle_events(workspace_id,provider_subscription_id,event_key,paddle_environment,metadata)
 select workspace_id,provider_subscription_id,'billing_lifecycle_state','production','{"raw_status":"active","scheduled_change_action":null}' from workspace_subscriptions where right(workspace_id::text,12)::bigint>=27;`);
 assert.equal(sql('select rpc_enqueue_annual_billing_reminders(25)'),'25');assert.equal(sql('select rpc_enqueue_annual_billing_reminders(25)'),'10');assert.equal(sql('select rpc_enqueue_annual_billing_reminders(25)'),'0');
});
