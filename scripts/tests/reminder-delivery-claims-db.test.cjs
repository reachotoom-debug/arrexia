// Isolated disposable PostgreSQL fixture. Never reads application credentials or URLs.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync, execFile } = require('node:child_process');
const { mkdtempSync, readFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { exe, env } = require('./local-postgres-config.cjs');
const root = mkdtempSync(join(tmpdir(), 'arrexia-reminder-claims-'));
const data = join(root, 'data');
const port = '55450';
const args = ['-X','-q','-h','127.0.0.1','-p',port,'-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-At'];
const sql = text => execFileSync(exe('psql'), args, {input:text,encoding:'utf8',env,windowsHide:true,stdio:'pipe'}).trim();
const sqlAsync = text => new Promise((resolve,reject) => {
  const child = execFile(exe('psql'), args, {encoding:'utf8',env,windowsHide:true}, (error,stdout) => error ? reject(error) : resolve(stdout.trim()));
  child.stdin.end(text);
});
const ws='00000000-0000-0000-0000-000000000001';
const inv='00000000-0000-0000-0000-000000000002';
const rule='00000000-0000-0000-0000-000000000003';
const user='00000000-0000-0000-0000-000000000004';
const call = (source='auto_cron',r=rule,date="current_date",scheduled="current_date") => `select public.claim_reminder_delivery('${ws}','${inv}',${r ? `'${r}'` : 'null'},${r ? scheduled : 'null'},${date},'${source}');`;
const context = (role='service_role',uid=user) => `set role ${role}; set request.jwt.claim.role='${role}'; set request.jwt.claim.sub='${uid}';`;
let started=false;
before(() => {
  execFileSync(exe('initdb'),['-D',data,'-U','postgres','-A','trust','--no-locale','-E','UTF8'],{env,windowsHide:true,stdio:'pipe'});
  execFileSync(exe('pg_ctl'),['-D',data,'-l',join(root,'postgres.log'),'-o',`-p ${port} -h 127.0.0.1 -c timezone=UTC`,'-w','start'],{env,windowsHide:true,stdio:'ignore'});
  started=true;
  sql(`set timezone='UTC'; create role anon; create role authenticated; create role service_role;
    create schema auth; grant usage on schema auth to authenticated,service_role;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create function auth.role() returns text language sql stable as $$ select current_setting('request.jwt.claim.role',true) $$;
    create table public.workspaces(id uuid primary key);
    create table public.workspace_members(workspace_id uuid,user_id uuid);
    create table public.invoices(id uuid primary key,workspace_id uuid,due_date date);
    create table public.settings(workspace_id uuid,timezone text);
    create table public.reminder_templates(id uuid,workspace_id uuid,is_enabled boolean);
    create table public.reminder_rules(id uuid,workspace_id uuid,trigger_type text,offset_days integer,is_enabled boolean default true,sort_order integer default 0,created_at timestamptz default now(),template_id uuid);
    insert into public.workspaces values('${ws}');
    insert into public.workspace_members values('${ws}','${user}');
    insert into public.settings values('${ws}','UTC');
    insert into public.invoices values('${inv}','${ws}',current_date);
    insert into public.reminder_rules(id,workspace_id,trigger_type,offset_days) values('${rule}','${ws}','on_due',0);`);
  sql(readFileSync('supabase/migrations/20260725000000_invoices_view_workspace_business_date.sql','utf8').split('CREATE OR REPLACE VIEW')[0]);
  sql(readFileSync('supabase/migrations/20261015010000_claim_reminder_delivery.sql','utf8'));
  console.log('Fixture server: '+sql('select version()'));
});
after(() => { if(started) execFileSync(exe('pg_ctl'),['-D',data,'-m','fast','-w','stop'],{env,windowsHide:true,stdio:'ignore'}); });
async function race(first,second) {
  sql('truncate public.reminder_delivery_claims');
  const pending=sqlAsync(`begin; ${context()} ${first} select pg_sleep(0.5); commit;`);
  // The second connection races the first; whichever claims first must exclude the other.
  const other=sqlAsync(`${context()} ${second}`);
  const results=await Promise.all([pending,other]);
  assert.equal(results.filter(result=>result.split('\n').includes('t')).length,1,JSON.stringify(results));
  assert.equal(sql('select count(*) from public.reminder_delivery_claims'),'1');
}
test('claim migration works without a test-only membership helper and retains the source execution contract',()=>{
  assert.equal(sql("select to_regprocedure('public.is_workspace_member(uuid)') is null"),'t');
  sql('truncate public.reminder_delivery_claims');
  assert.equal(sql(context('authenticated')+call('manual',null)),'t');
  sql('truncate public.reminder_delivery_claims');
  assert.equal(sql(context()+call()),'t');
  assert.equal(sql("select has_function_privilege('anon','public.claim_reminder_delivery(uuid,uuid,uuid,date,date,text)','EXECUTE')"),'f');
});
test('manual and service-role claims cannot cross tenant invoice or rule boundaries',()=>{
  const foreign='00000000-0000-0000-0000-000000000099';
  sql(`truncate public.reminder_delivery_claims; insert into workspaces values('${foreign}');
    insert into invoices values('${foreign}','${foreign}',current_date);
    insert into reminder_rules(id,workspace_id,trigger_type,offset_days) values('${foreign}','${foreign}','on_due',0);`);
  for(const role of ['authenticated','service_role']) {
    assert.throws(()=>sql(context(role)+`select claim_reminder_delivery('${ws}','${foreign}',null,null,current_date,'manual')`),/Invoice does not belong to workspace/);
  }
  assert.throws(()=>sql(context()+call('auto_cron',foreign)),/Scheduled date/);
  assert.throws(()=>sql(context('authenticated')+`select claim_reminder_delivery('${foreign}','${foreign}',null,null,current_date,'manual')`),/Workspace access denied/);
  assert.equal(sql('select count(*) from reminder_delivery_claims'),'0');
});
test('actual SQL serializes concurrent same occurrence claims',async()=>{await race(call(),call());});
test('actual SQL serializes manual versus cron in either arrival order',async()=>{
  await race(call('manual',null),call());
  await race(call(),call('manual',null));
});
test('retained claim blocks later retry without history and distinct auto rules remain valid',()=>{
  sql('truncate public.reminder_delivery_claims');
  assert.equal(sql(context()+call()),'t');
  assert.equal(sql(context()+call()),'f');
  const other='00000000-0000-0000-0000-000000000005';
  sql(`insert into public.reminder_rules(id,workspace_id,trigger_type,offset_days) values('${other}','${ws}','on_due',0)`);
  assert.equal(sql(context()+call('auto_cron',other)),'t');
});
test('RPC rejects forged date, occurrence, automatic source, missing membership, and direct table mutation',()=>{
  assert.throws(()=>sql(context()+call('auto_cron',rule,'current_date+1')),/Evaluation date/);
  assert.throws(()=>sql(context()+call('auto_cron',rule,'current_date','current_date+1')),/Scheduled date/);
  assert.throws(()=>sql(context('authenticated')+call()),/Automatic claims require service role/);
  assert.throws(()=>sql(context('authenticated','00000000-0000-0000-0000-000000000099')+call('manual',null)),/Workspace access denied/);
  assert.throws(()=>sql(context('authenticated')+'delete from public.reminder_delivery_claims'),/permission denied/);
  sql('truncate public.reminder_delivery_claims');
  assert.equal(sql(context('authenticated')+call('manual',null)),'t');
});

test('final enabled after_due rule accepts +7/+14 recurrence and rejects future or non-final recurrence',()=>{
  sql('truncate public.reminder_delivery_claims');
  sql(`update public.invoices set due_date=current_date-21;
    insert into public.reminder_templates values('${rule}','${ws}',true);
    update public.reminder_rules set trigger_type='after_due',offset_days=7,template_id='${rule}' where id='${rule}';`);
  assert.equal(sql(context()+call('auto_cron',rule,'current_date','current_date-7')),'t');
  assert.equal(sql(context()+call('auto_cron',rule,'current_date','current_date')),'t');
  assert.equal(sql(context()+call('auto_cron',rule,'current_date','current_date')),'f');
  assert.throws(()=>sql(context()+call('auto_cron',rule,'current_date','current_date+7')),/Scheduled date/);
  assert.throws(()=>sql(context()+call('auto_cron',rule,'current_date','current_date-1')),/Scheduled date/);
  sql(`update public.reminder_rules set offset_days=14,trigger_type='after_due',template_id='${rule}' where id<>'${rule}'`);
  assert.throws(()=>sql(context()+call('auto_cron',rule,'current_date','current_date')),/Scheduled date/);
});
test('invalid workspace timezone falls back to UTC',()=>{
  sql("truncate public.reminder_delivery_claims; update public.settings set timezone='invalid/zone'");
  assert.equal(sql(context('authenticated')+call('manual',null)),'t');
});

test('future base occurrence cannot be preclaimed even with matching due date',()=>{
  sql("truncate public.reminder_delivery_claims; update public.settings set timezone='UTC'");
  sql(`update public.invoices set due_date=current_date+1;
    update public.reminder_rules set trigger_type='on_due',offset_days=0 where id='${rule}'`);
  assert.throws(()=>sql(context()+call('auto_cron',rule,'current_date','current_date+1')),/Scheduled date/);
  assert.equal(sql('select count(*) from public.reminder_delivery_claims'),'0');
});
