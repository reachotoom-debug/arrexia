// Disposable repository-wide rehearsal; platform shims are not deployed-schema proof.
const { execFileSync } = require('node:child_process');
const { mkdtempSync, readdirSync, readFileSync, writeFileSync, mkdirSync } = require('node:fs');
const { join, resolve } = require('node:path');
const { tmpdir } = require('node:os');
const assert = require('node:assert/strict');
const bin = 'C:/Program Files/PostgreSQL/15/bin';
const root = mkdtempSync(join(tmpdir(), 'arrexia-schema-rehearsal-'));
const data = join(root, 'data');
const port = '55441';
const env = { ...process.env };
for (const key of Object.keys(env)) if (/^(PG|SUPABASE_|PADDLE_|DATABASE_|POSTGRES_)/.test(key)) delete env[key];
const exe = name => join(bin, name + '.exe');
const args = ['-X', '-h', '127.0.0.1', '-p', port, '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At'];
const sql = input => execFileSync(exe('psql'), args, { input, encoding: 'utf8', env, windowsHide: true, stdio: 'pipe' });
let started = false;
const result = { capturedAt: new Date().toISOString(), scope: 'all repository migrations with synthetic Auth/Storage platform shims',
  serverMajor: 15, configuredSupabaseMajor: 17, fullDeployedSchemaVerified: false, applied: [], success: false };
try {
  execFileSync(exe('initdb'), ['-D', data, '-U', 'postgres', '-A', 'trust', '--no-locale', '-E', 'UTF8'], { env, windowsHide: true, stdio: 'pipe' });
  execFileSync(exe('pg_ctl'), ['-D', data, '-l', join(root, 'postgres.log'), '-o', `-p ${port} -h 127.0.0.1 -c timezone=UTC`, '-w', 'start'], { env, windowsHide: true, stdio: 'ignore' });
  started = true;
  sql(`create role anon; create role authenticated; create role service_role bypassrls; create role supabase_admin superuser;
    alter default privileges in schema public grant all on tables to anon,authenticated,service_role;
    create schema auth; create schema storage; create schema extensions;
    create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb default '{}', raw_app_meta_data jsonb default '{}',
      created_at timestamptz default now(), updated_at timestamptz default now(), email_confirmed_at timestamptz);
    create table auth.identities(id uuid primary key, user_id uuid references auth.users(id), provider text, identity_data jsonb default '{}', created_at timestamptz default now());
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create function auth.role() returns text language sql stable as $$select current_setting('request.jwt.claim.role',true)$$;
    create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
    create table storage.buckets(id text primary key,name text,public boolean default false,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,owner uuid,owner_id text);
    alter table storage.objects enable row level security;
    create function storage.foldername(text) returns text[] language sql immutable as $$select string_to_array($1,'/')$$;`);
  const files = readdirSync('supabase/migrations').filter(name => name.endsWith('.sql')).sort();
  for (const file of files) {
    result.attempting = file;
    if (file === '20260927120000_paddle_atomic_webhook_recovery.sql') {
      sql(`insert into public.organizations(id,name) values ('00000000-0000-0000-0000-000000000002','Disposable organization');
        insert into public.workspaces(id,organization_id,name) values ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','Disposable historical fixture');
        insert into public.workspace_plans(workspace_id,plan,invoice_limit_monthly,client_limit)
          values ('00000000-0000-0000-0000-000000000001','starter',100,50);
        insert into public.workspace_subscriptions(workspace_id,status,plan,payment_provider,provider_subscription_id,provider_customer_id)
          values ('00000000-0000-0000-0000-000000000001','active','starter','paddle','sub_fixture_history','ctm_fixture_history');
        insert into public.paddle_webhook_events(event_id,event_type,occurred_at,status)
          values ('evt_fixture_history','transaction.completed','2026-09-01','processed');`);
      // Rehearse a deployment failure at the end of the complete pending DDL.
      // psql exits on the injected error; closing that connection rolls back BEGIN.
      assert.throws(() => sql('BEGIN;\n' + readFileSync(join('supabase/migrations', file), 'utf8') +
        "\nDO $$ BEGIN RAISE EXCEPTION 'fixture deployment failure'; END $$;\nCOMMIT;"), /fixture deployment failure/);
      assert.equal(sql("select count(*) from information_schema.columns where table_schema='public' and table_name='workspace_subscriptions' and column_name='paddle_environment'").trim(), '0');
      assert.equal(sql("select to_regclass('public.paddle_subscription_bindings') is null").trim(), 't');
      assert.equal(sql("select has_table_privilege('anon','public.workspace_subscriptions','TRUNCATE')").trim(), 't');
      assert.equal(sql('select count(*) from public.workspace_subscriptions').trim(), '1');
      result.migrationTransactionRollbackVerified = true;
    }
    if (file === '20261001120000_paddle_billing_email_delivery.sql') {
      assert.throws(() => sql('BEGIN;\n' + readFileSync(join('supabase/migrations', file), 'utf8') +
        "\nDO $$ BEGIN RAISE EXCEPTION 'fixture email deployment failure'; END $$;\nCOMMIT;"), /fixture email deployment failure/);
      assert.equal(sql("select count(*) from information_schema.columns where table_schema='public' and table_name='workspace_paid_lifecycle_events' and column_name='notification_kind'").trim(), '0');
      assert.equal(sql("select to_regprocedure('public.internal_apply_paddle_webhook_core(text,uuid,jsonb,text)') is null").trim(), 't');
      assert.equal(sql("select has_function_privilege('service_role','public.rpc_apply_paddle_webhook(text,uuid,jsonb,text)','EXECUTE')").trim(), 't');
      result.emailMigrationTransactionRollbackVerified = true;
    }
    sql('BEGIN;\n' + readFileSync(join('supabase/migrations', file), 'utf8') + '\nCOMMIT;');
    result.applied.push(file);
  }
  assert.equal(sql("select plan||':'||status||':'||coalesce(paddle_environment,'unknown') from public.workspace_subscriptions where workspace_id='00000000-0000-0000-0000-000000000001'").trim(), 'starter:active:unknown');
  assert.equal(sql("select can_mutate from public.internal_import_entitlement_state('00000000-0000-0000-0000-000000000001')").trim(), 'f');
  assert.throws(() => sql("update public.workspace_plans set client_limit=NULL where workspace_id='00000000-0000-0000-0000-000000000001'"), /atomic Live/i);
  assert.throws(() => sql("select public.rpc_claim_paddle_webhook('evt_fixture_sandbox','subscription.updated','2026-09-01','sandbox')"), /production/i);
  assert.equal(sql("select has_function_privilege('authenticated','public.rpc_apply_paddle_webhook(text,uuid,jsonb,text)','EXECUTE')").trim(), 'f');
  for (const role of ['anon', 'authenticated']) {
    for (const table of ['workspace_subscriptions', 'workspace_plans', 'paddle_webhook_events', 'paddle_subscription_bindings']) {
      assert.equal(sql(`select has_table_privilege('${role}','public.${table}','TRUNCATE')`).trim(), 'f');
      assert.throws(() => sql(`set role ${role}; truncate public.${table} cascade;`), /permission denied/i);
    }
  }
  const backup = join(root, 'complete-repository-schema.dump');
  execFileSync(exe('pg_dump'), ['-h','127.0.0.1','-p',port,'-U','postgres','-d','postgres','-Fc','-f',backup], { env, windowsHide: true, stdio: 'pipe' });
  sql('create database restore_fixture');
  execFileSync(exe('pg_restore'), ['-h','127.0.0.1','-p',port,'-U','postgres','-d','restore_fixture','--exit-on-error',backup], { env, windowsHide: true, stdio: 'pipe' });
  const restoreArgs = [...args]; restoreArgs[restoreArgs.indexOf('-d') + 1] = 'restore_fixture';
  const restored = input => execFileSync(exe('psql'), restoreArgs, { input, encoding: 'utf8', env, windowsHide: true, stdio: 'pipe' }).trim();
  assert.equal(restored('select count(*) from public.workspace_subscriptions'), '1');
  assert.equal(restored("select can_mutate from public.internal_import_entitlement_state('00000000-0000-0000-0000-000000000001')"), 'f');
  assert.throws(() => restored("update public.workspace_subscriptions set plan='business'"), /atomic Live/i);
  assert.equal(restored("select has_table_privilege('authenticated','public.workspace_subscriptions','TRUNCATE')"), 'f');
  assert.equal(restored("select to_regprocedure('public.rpc_claim_paid_billing_email(uuid)') is not null"), 't');
  assert.equal(restored("select has_function_privilege('authenticated','public.rpc_claim_paid_billing_email(uuid)','EXECUTE')"), 'f');
  assert.equal(restored("select has_function_privilege('service_role','public.internal_apply_paddle_webhook_core(text,uuid,jsonb,text)','EXECUTE')"), 'f');
  result.emailSchemaBackupRestoreVerified = true;
  result.historicalQuarantineVerified = true;
  result.rpcPrivilegesVerified = true;
  result.clientTruncateRevocationVerified = true;
  result.disposableFullSchemaBackupRestoreVerified = true;
  result.success = true;
} catch (error) {
  result.error = String(error.stderr ?? error.message).slice(-4000);
  process.exitCode = 1;
} finally {
  if (started) execFileSync(exe('pg_ctl'), ['-D', data, '-m', 'fast', '-w', 'stop'], { env, windowsHide: true, stdio: 'ignore' });
  mkdirSync('docs/billing-email-evidence', { recursive: true });
  writeFileSync(resolve('docs/billing-email-evidence/schema-rehearsal.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify({ ...result, applied: result.applied.length }, null, 2));
}
