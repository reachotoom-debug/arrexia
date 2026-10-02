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
const port = '55439';
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
    '20260830120000_paddle_provider_last_event_at.sql', '20260927120000_paddle_atomic_webhook_recovery.sql']) {
    if (file === '20260927120000_paddle_atomic_webhook_recovery.sql') {
      sql(`insert into public.workspaces values ('${ws}','2026-08-01');
        insert into public.workspace_subscriptions(workspace_id,status,plan,payment_provider,provider_subscription_id)
          values ('${ws}','active','starter','paddle','historical_subscription');
        insert into public.paddle_webhook_events(event_id,event_type,occurred_at,status)
          values ('historical_event','transaction.completed','2026-09-01','processed');`);
    }
    sql(readFileSync(join('supabase/migrations', file), 'utf8'));
  }
});
test('migration preserves historical subscriptions and processed events without classifying them', () => {
  assert.equal(sql("select plan||':'||status||':'||coalesce(paddle_environment,'unknown') from public.workspace_subscriptions"),'starter:active:unknown');
  assert.equal(sql("select status||':'||coalesce(paddle_environment,'unknown') from public.paddle_webhook_events"),'processed:unknown');
  assert.equal(sql("select coalesce(paddle_environment,'unknown') from public.paddle_subscription_bindings"),'unknown');
  assert.throws(() => claim('historical_event','transaction.completed'), /classification/i);
});
test('client roles cannot truncate billing history despite Supabase default table grants', () => {
  for (const role of ['anon', 'authenticated']) {
    for (const table of ['workspace_subscriptions', 'workspace_plans', 'paddle_webhook_events', 'paddle_subscription_bindings']) {
      assert.equal(sql(`select has_table_privilege('${role}','public.${table}','TRUNCATE')`), 'f', `${role} can truncate ${table}`);
      assert.throws(() => sql(`set role ${role}; truncate public.${table} cascade;`), /permission denied/i);
      assert.equal(sql(`select has_table_privilege('service_role','public.${table}','TRUNCATE')`), 't');
    }
  }
});
after(() => {
  if (started) execFileSync(exe('pg_ctl'), ['-D', data, '-m', 'fast', '-w', 'stop'], { env, windowsHide: true, stdio: 'ignore' });
  // Keep this isolated fixture and log for diagnosing failures. No application DB is accessed.
});
test('disposable backup restores the billing snapshot, RPC contract and isolation guards', () => {
  reset();
  deliver('subscription.updated', '2026-09-01', payload());
  const expected = sql('select row_to_json(s) from public.workspace_subscriptions s');
  const backup = join(root, 'verified-fixture-backup.dump');
  execFileSync(exe('pg_dump'), ['-h', '127.0.0.1', '-p', port, '-U', 'postgres', '-d', 'postgres', '-Fc', '-f', backup], { env, windowsHide: true, stdio: 'pipe' });
  sql('create database restore_fixture');
  execFileSync(exe('pg_restore'), ['-h', '127.0.0.1', '-p', port, '-U', 'postgres', '-d', 'restore_fixture', '--exit-on-error', backup], { env, windowsHide: true, stdio: 'pipe' });
  const restoreArgs = [...args];
  restoreArgs[restoreArgs.indexOf('-d') + 1] = 'restore_fixture';
  const restored = text => execFileSync(exe('psql'), restoreArgs, { input: text, encoding: 'utf8', env, windowsHide: true, stdio: 'pipe' }).trim();
  assert.equal(restored('select row_to_json(s) from public.workspace_subscriptions s'), expected);
  assert.equal(restored("select count(*) from pg_proc where proname in ('rpc_claim_paddle_webhook','rpc_apply_paddle_webhook','rpc_finish_paddle_webhook')"), '3');
  assert.throws(() => restored("update public.workspace_subscriptions set plan='business'"), /atomic Live/i);
  assert.throws(() => restored("select public.rpc_claim_paddle_webhook('restore-sandbox','subscription.updated','2026-09-01','sandbox')"), /production/i);
});
test('failed claims retry, live claims reject duplicates, stale claims fence old workers', () => {
  reset();
  const first = claim('retry');
  assert.equal(claim('retry').state, 'busy');
  sql(`select public.rpc_finish_paddle_webhook('retry','${first.claim_token}','failed','test','production');`);
  const second = claim('retry');
  assert.notEqual(first.claim_token, second.claim_token);
  sql(`update public.paddle_webhook_events set lease_expires_at=clock_timestamp()-interval '1 second' where event_id='retry';`);
  const third = claim('retry');
  assert.notEqual(second.claim_token, third.claim_token);
  assert.throws(() => sql(applyQuery('retry', second.claim_token)), /claim/i);
  assert.equal(json(applyQuery('retry', third.claim_token)).action, 'fulfilled');
  assert.equal(claim('retry').state, 'duplicate');
  assert.equal(sql("select attempts from public.paddle_webhook_events where event_id='retry'"), '3');
});

test('Sandbox and unclassified Paddle rows cannot grant database entitlements or be overwritten', () => {
  for (const environment of [null, 'sandbox']) {
    reset();
    sql(`alter table public.workspace_subscriptions disable trigger paddle_live_projection_guard;
      update public.workspace_subscriptions set status='active',plan='business',payment_provider='paddle',
      provider_subscription_id='historical',provider_customer_id='old_customer',
      paddle_environment=${environment === null ? 'NULL' : quote(environment)};
      alter table public.workspace_subscriptions enable trigger paddle_live_projection_guard;`);
    const before = sql('select row_to_json(s) from public.workspace_subscriptions s');
    const c = claim('blocked');
    assert.throws(() => sql(applyQuery('blocked', c.claim_token)), /classification|environment/i);
    assert.equal(sql('select row_to_json(s) from public.workspace_subscriptions s'), before);
    const entitlement = json(`select row_to_json(s) from public.internal_import_entitlement_state('${ws}') s`);
    assert.equal(entitlement.can_mutate, false);
    assert.notEqual(entitlement.entitlement_state, 'paid');
  }
});

test('Sandbox claims are rejected before a ledger row is inserted', () => {
  reset();
  assert.throws(() => sql("select public.rpc_claim_paddle_webhook('sandbox','subscription.updated','2026-09-01','sandbox');"), /production/i);
  assert.equal(sql('select count(*) from public.paddle_webhook_events'), '0');
});

test('Live webhooks preserve legitimate active manual entitlements', () => {
  reset();
  sql("update public.workspace_subscriptions set status='active',plan='business',payment_provider='manual'");
  const c = claim('manual');
  assert.throws(() => sql(applyQuery('manual', c.claim_token)), /manual/i);
  assert.equal(sql('select payment_provider from public.workspace_subscriptions'), 'manual');
});

test('legacy or direct writers cannot update a Paddle projection outside atomic fulfillment', () => {
  reset(); deliver('subscription.updated','2026-09-01',payload());
  assert.throws(() => sql("update public.workspace_subscriptions set status='active',plan='business'"), /atomic Live/i);
  assert.equal(sql('select plan from public.workspace_subscriptions'),'starter');
});

test('direct plan writes cannot bypass the Live projection fence', () => {
  reset(); deliver('subscription.updated','2026-09-01',payload());
  assert.throws(() => sql('update public.workspace_plans set client_limit=NULL,invoice_limit_monthly=NULL'), /atomic Live/i);
  assert.equal(sql('select client_limit from public.workspace_plans'),'50');
});

test('deleting a Paddle subscription cannot expose a historical paid-plan fallback', () => {
  reset(); deliver('subscription.updated','2026-09-01',payload());
  assert.throws(() => sql('delete from public.workspace_subscriptions'), /history|atomic Live/i);
  assert.equal(sql('select count(*) from public.workspace_subscriptions'),'1');
  sql('delete from public.workspaces');
  assert.equal(sql('select count(*) from public.workspace_subscriptions'),'0');
});

test('all three Live plans renew monthly and annually without transaction rollback', () => {
  for (const plan of ['starter','pro','business']) for (const billing_interval of ['monthly','annual']) {
    reset();
    const first = billing_interval === 'monthly' ? '2026-10-01' : '2027-09-01';
    const second = billing_interval === 'monthly' ? '2026-11-01' : '2028-09-01';
    deliver('subscription.updated','2026-09-01',payload({plan,billing_interval,period_starts_at:'2026-09-01',period_ends_at:first}));
    deliver('subscription.updated',first,payload({plan,billing_interval,period_starts_at:first,period_ends_at:second}));
    const before=sql('select row_to_json(s) from public.workspace_subscriptions s');
    deliver('transaction.completed',first,payload({plan,billing_interval,period_starts_at:'2026-09-01',period_ends_at:first}));
    assert.equal(sql('select row_to_json(s) from public.workspace_subscriptions s'),before);
    assert.equal(sql('select current_period_ends_at::date from public.workspace_subscriptions'),second);
    assert.equal(sql('select trial_consumed_at::date from public.workspace_subscriptions'),'2026-08-01');
  }
});
test('billing and completion roll back together, then successful redelivery preserves trial history', () => {
  reset();
  sql(`create function public.fail_paddle_completion() returns trigger language plpgsql as $$begin
    if NEW.status='processed' then raise exception 'injected completion failure'; end if; return NEW; end$$;
    create trigger fail_completion before update on public.paddle_webhook_events for each row execute function public.fail_paddle_completion();`);
  const c = claim('rollback');
  assert.throws(() => sql(applyQuery('rollback', c.claim_token)), /injected completion failure/);
  assert.equal(sql(`select status from public.workspace_subscriptions where workspace_id='${ws}'`), 'trial');
  assert.equal(sql('select count(*) from public.paddle_subscription_bindings'), '0');
  sql(`drop trigger fail_completion on public.paddle_webhook_events; drop function public.fail_paddle_completion();
    select public.rpc_finish_paddle_webhook('rollback','${c.claim_token}','failed','retry','production');`);
  const retry = claim('rollback');
  assert.equal(json(applyQuery('rollback', retry.claim_token)).action, 'fulfilled');
  assert.equal(sql(`select trial_consumed_at::date from public.workspace_subscriptions where workspace_id='${ws}'`), '2026-08-01');
});
test('transactions cannot undo cancellation, pause, scheduled cancellation, or a replaced subscription', () => {
  for (const [raw, status] of [['canceled','cancelled'], ['paused','past_due']]) {
    reset();
    deliver('subscription.updated', '2026-09-02', payload({provider_status: raw, status}));
    for (const at of ['2026-09-01','2026-09-03']) {
      assert.equal(deliver('transaction.completed', at, payload()).action, 'ignored');
      assert.equal(sql('select status from public.workspace_subscriptions'), status);
    }
  }
  reset();
  deliver('subscription.updated', '2026-09-02', payload({cancel_at_period_end: true}));
  deliver('transaction.completed', '2026-09-03', payload());
  assert.equal(sql('select cancel_at_period_end from public.workspace_subscriptions'), 't');
  sql("alter table public.workspace_subscriptions disable trigger paddle_live_projection_guard; update public.workspace_subscriptions set provider_subscription_id='sub_replacement'; alter table public.workspace_subscriptions enable trigger paddle_live_projection_guard;");
  for (const type of ['transaction.completed','subscription.updated','subscription.canceled']) {
    assert.equal(deliver(type, '2026-09-04', payload()).reason, 'subscription_identity_conflict');
  }
  assert.equal(sql('select provider_subscription_id from public.workspace_subscriptions'), 'sub_replacement');
});
test('lifecycle order and equal-time restrictive ties converge in either delivery order', () => {
  for (const reverse of [false,true]) {
    reset();
    const events = [['subscription.activated','2026-09-01',payload()],
      ['subscription.canceled','2026-09-02',payload({provider_status:'canceled',status:'cancelled'})]];
    for (const event of reverse ? events.reverse() : events) deliver(...event);
    assert.equal(sql('select status from public.workspace_subscriptions'), 'cancelled');
    reset();
    const tied = [['subscription.activated','2026-09-02',payload()],
      ['subscription.paused','2026-09-02',payload({provider_status:'paused',status:'past_due'})]];
    for (const event of reverse ? tied.reverse() : tied) deliver(...event);
    assert.equal(sql('select status from public.workspace_subscriptions'), 'past_due');
  }
});
test('concurrent claims and concurrent lifecycle events serialize in PostgreSQL', async () => {
  reset();
  const claims = await Promise.all(Array.from({length: 4}, () => asyncSql("select public.rpc_claim_paddle_webhook('race','subscription.updated','2026-09-01','production');")));
  assert.equal(claims.filter(r => JSON.parse(r.stdout).state === 'new').length, 1);
  const a = claim('older','subscription.activated','2026-09-01');
  const b = claim('newer','subscription.canceled','2026-09-02');
  await Promise.all([asyncSql(applyQuery('older',a.claim_token)),
    asyncSql(applyQuery('newer',b.claim_token,payload({provider_status:'canceled',status:'cancelled'})))]);
  assert.equal(sql('select status from public.workspace_subscriptions'), 'cancelled');
});
test('provider bindings reject cross-tenant hints and customer changes', () => {
  reset();
  deliver('subscription.created','2026-09-01',payload());
  assert.throws(() => deliver('subscription.updated','2026-09-02',payload({workspace_id:'00000000-0000-0000-0000-000000000002'})), /workspace.*conflict/i);
  assert.throws(() => deliver('subscription.updated','2026-09-02',payload({provider_customer_id:'ctm_other'})), /customer.*conflict/i);
  assert.equal(sql('select provider_customer_id from public.workspace_subscriptions'), 'ctm_one');
});

test('transactions bootstrap in either order without blocking earlier lifecycle state', () => {
  for (const transactionFirst of [true,false]) {
    reset();
    const tx = () => deliver('transaction.completed','2026-09-02',payload());
    const subscription = () => deliver('subscription.created','2026-09-01',payload());
    if (transactionFirst) { tx(); subscription(); } else { subscription(); tx(); }
    assert.equal(sql('select status from public.workspace_subscriptions'), 'active');
    assert.equal(sql('select provider_last_event_at::date from public.workspace_subscriptions'), '2026-09-01');
  }
});

test('activation notification survives subscription-created-first without billing writes', () => {
  reset();
  deliver('subscription.created','2026-09-01',payload());
  const before = sql('select row_to_json(s) from public.workspace_subscriptions s');
  const completed = deliver('transaction.completed','2026-09-02',payload());
  assert.equal(completed.action, 'ignored');
  assert.equal(completed.notify_activation, true);
  assert.equal(sql('select row_to_json(s) from public.workspace_subscriptions s'), before);
});

test('RPCs are unavailable to anonymous and authenticated clients', () => {
  for (const role of ['anon','authenticated']) {
    assert.equal(sql(`select has_function_privilege('${role}','public.rpc_apply_paddle_webhook(text,uuid,jsonb,text)','execute')`),'f');
    assert.equal(sql(`select has_function_privilege('${role}','public.rpc_claim_paddle_webhook(text,text,timestamptz,text)','execute')`),'f');
    assert.equal(sql(`select has_function_privilege('${role}','public.rpc_finish_paddle_webhook(text,uuid,text,text,text)','execute')`),'f');
  }
});

test('a fresh lifecycle subscription replaces a canceled one and old events stay fenced', () => {
  reset();
  deliver('subscription.canceled','2026-09-02',payload({provider_status:'canceled',status:'cancelled'}));
  assert.equal(deliver('subscription.created','2026-09-04',payload({provider_subscription_id:'sub_two',
    provider_created_at:'2026-09-03T00:00:00Z'})).action,'fulfilled');
  assert.equal(sql('select provider_subscription_id from public.workspace_subscriptions'),'sub_two');
  assert.equal(sql('select count(*) from public.paddle_subscription_bindings'),'2');
  for (const type of ['subscription.created','subscription.activated','subscription.updated','transaction.completed']) {
    assert.equal(deliver(type,'2026-09-05',payload()).reason,'subscription_identity_conflict');
  }
  assert.equal(sql('select provider_subscription_id from public.workspace_subscriptions'),'sub_two');
});

test('replacement lifecycle events arriving before creation retain their newer status', () => {
  reset();
  deliver('subscription.canceled','2026-09-02',payload({provider_status:'canceled',status:'cancelled'}));
  const replacement = {provider_subscription_id:'sub_two', provider_created_at:'2026-09-03T00:00:00Z'};
  assert.equal(deliver('subscription.paused','2026-09-05',payload({...replacement,provider_status:'paused',status:'past_due'})).action,'fulfilled');
  assert.equal(deliver('subscription.created','2026-09-04',payload(replacement)).reason,'stale_event_ignored');
  assert.equal(sql('select provider_subscription_id from public.workspace_subscriptions'),'sub_two');
  assert.equal(sql('select status from public.workspace_subscriptions'),'past_due');
});

test('replacement transaction waits for lifecycle binding then notifies without overwriting state', () => {
  reset();
  deliver('subscription.canceled','2026-09-02',payload({provider_status:'canceled',status:'cancelled'}));
  const replacement = payload({provider_subscription_id:'sub_two', provider_created_at:'2026-09-03T00:00:00Z'});
  const tx = claim('replacement_tx','transaction.completed','2026-09-04');
  assert.throws(() => sql(applyQuery('replacement_tx',tx.claim_token,{...replacement,provider_status:'completed'})), /awaiting subscription binding/);
  sql(`select public.rpc_finish_paddle_webhook('replacement_tx','${tx.claim_token}','failed','retry','production');`);
  deliver('subscription.created','2026-09-03',replacement);
  const retry = claim('replacement_tx','transaction.completed','2026-09-04');
  const before = sql('select row_to_json(s) from public.workspace_subscriptions s');
  const result = json(applyQuery('replacement_tx',retry.claim_token,{...replacement,provider_status:'completed'}));
  assert.equal(result.action,'ignored');
  assert.equal(result.notify_activation,true);
  assert.equal(sql('select row_to_json(s) from public.workspace_subscriptions s'),before);
});
