// Explicit local-container acceptance only. No URLs, dotenv or provider calls.
// Never resets a database, truncates a table or touches existing invoice rows.
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {execFileSync,execFile}=require('node:child_process');
const {readFileSync}=require('node:fs');
const {randomUUID,createHash}=require('node:crypto');
const container='supabase_db_arrexia-local-test';
const env={};
for(const key of ['SystemRoot','WINDIR','SystemDrive','COMSPEC','PATH','Path','PATHEXT','TEMP','TMP','USERPROFILE','APPDATA','LOCALAPPDATA','ProgramFiles']) if(process.env[key]!==undefined) env[key]=process.env[key];
const args=['exec','-i',container,'env','PGPASSFILE=/dev/null','PGSERVICEFILE=/dev/null','psql','-X','-q','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-At'];
function sql(input){return execFileSync('docker',args,{input,env,encoding:'utf8',windowsHide:true,stdio:'pipe',timeout:30000}).trim();}
function asyncSql(input){return new Promise((resolve,reject)=>{const child=execFile('docker',args,{env,encoding:'utf8',windowsHide:true,timeout:30000},(error,out)=>error?reject(error):resolve(out.trim()));child.stdin.end(input);});}
const q=value=>"'"+String(value).replaceAll("'","''")+"'";
const ids=Object.fromEntries(['org','a','b','user','clientA','clientB','recurring','race','foreign','template','raceTemplate','recurringRule','raceRule'].map(key=>[key,randomUUID()]));
const f='public.claim_reminder_delivery(uuid,uuid,uuid,date,date,text)';
const metadata=()=>sql(`select json_build_object('definition',pg_get_functiondef(${q(f)}::regprocedure),'owner',proowner,'acl',proacl,'settings',proconfig) from pg_proc where oid=${q(f)}::regprocedure`);
const tables=['organizations','workspaces','workspace_members','clients','invoices','settings','reminder_templates','reminder_rules','reminder_delivery_claims'];
const census=()=>sql(`select json_build_object(${tables.map(t=>`${q(t)},(select count(*) from public.${t})`).join(',')},'auth_users',(select count(*) from auth.users))`);
const actor=role=>`set local role ${role}; set local request.jwt.claim.role=${q(role)}; set local request.jwt.claim.sub=${q(ids.user)};`;
const claim=(invoice,rule,workspace=ids.a,source='auto_cron')=>`select public.claim_reminder_delivery('${workspace}','${invoice}',${rule?q(rule):'null'},${rule?'current_date':'null'},current_date,'${source}')`;
const as=(body,role='service_role')=>sql(`begin; set local timezone='UTC'; ${actor(role)} ${body}; commit;`);
let originalDefinition,originalMetadata,beforeCensus,prepared=false;
before(()=>{
  const version=sql('select version()');
  assert.match(version,/PostgreSQL 17\./);
  console.log('Target: '+container+' / '+version);
  assert.equal(sql("select current_database()"),'postgres');
  originalMetadata=metadata(); originalDefinition=JSON.parse(originalMetadata).definition;
  beforeCensus=census();
  const migration=readFileSync('supabase/migrations/20261015010000_claim_reminder_delivery.sql','utf8');
  const start=migration.indexOf('create function public.claim_reminder_delivery(');
  const end=migration.indexOf('revoke all on function public.claim_reminder_delivery',start);
  assert.ok(start>=0&&end>start);
  const candidate=migration.slice(start,end).replace('create function public.claim_reminder_delivery','create or replace function public.claim_reminder_delivery');
  // Change only the function body temporarily. Existing ownership/ACLs remain.
  sql(candidate);
  prepared=true;
  sql(`begin; set local session_replication_role=replica;
    insert into auth.users(id) values ('${ids.user}');
    insert into public.organizations(id,name) values ('${ids.org}','Synthetic claim acceptance');
    insert into public.workspaces(id,name,organization_id) values ('${ids.a}','Synthetic claim A','${ids.org}'),('${ids.b}','Synthetic claim B','${ids.org}');
    insert into public.workspace_members(workspace_id,user_id,role) values ('${ids.a}','${ids.user}','member');
    insert into public.settings(workspace_id,timezone) values ('${ids.a}','UTC'),('${ids.b}','UTC');
    insert into public.clients(id,workspace_id,organization_id,name) values ('${ids.clientA}','${ids.a}','${ids.org}','Synthetic A'),('${ids.clientB}','${ids.b}','${ids.org}','Synthetic B');
    insert into public.invoices(id,workspace_id,organization_id,client_id,invoice_number,currency,issue_date,due_date,amount,subtotal,status) values
      ('${ids.recurring}','${ids.a}','${ids.org}','${ids.clientA}','SYNTHETIC-NULL','USD',current_date-30,current_date-21,100,100,'sent'),
      ('${ids.race}','${ids.a}','${ids.org}','${ids.clientA}','SYNTHETIC-RACE','USD',current_date,current_date,100,100,'sent'),
      ('${ids.foreign}','${ids.b}','${ids.org}','${ids.clientB}','SYNTHETIC-FOREIGN','USD',current_date,current_date,100,100,'sent');
    insert into public.reminder_templates(id,workspace_id,code,name,subject,body,is_enabled) values
      ('${ids.template}','${ids.a}','synthetic_null','Synthetic NULL','Synthetic','Synthetic',null),
      ('${ids.raceTemplate}','${ids.a}','synthetic_race','Synthetic race','Synthetic','Synthetic',true);
    insert into public.reminder_rules(id,workspace_id,template_id,trigger_type,offset_days,is_enabled) values
      ('${ids.recurringRule}','${ids.a}','${ids.template}','after_due',14,true),
      ('${ids.raceRule}','${ids.a}','${ids.raceTemplate}','on_due',0,true);
    commit;`);
});
after(()=>{
  if(!prepared)return;
  try {
    sql(`begin; set local session_replication_role=replica;
      delete from public.reminder_delivery_claims where workspace_id in ('${ids.a}','${ids.b}');
      delete from public.reminder_rules where id in ('${ids.recurringRule}','${ids.raceRule}');
      delete from public.reminder_templates where id in ('${ids.template}','${ids.raceTemplate}');
      delete from public.invoices where id in ('${ids.recurring}','${ids.race}','${ids.foreign}');
      delete from public.clients where id in ('${ids.clientA}','${ids.clientB}');
      delete from public.settings where workspace_id in ('${ids.a}','${ids.b}');
      delete from public.workspace_members where workspace_id in ('${ids.a}','${ids.b}');
      delete from public.workspaces where id in ('${ids.a}','${ids.b}');
      delete from public.organizations where id='${ids.org}';
      delete from auth.users where id='${ids.user}'; commit;`);
  } finally {sql(originalDefinition);}
  assert.equal(metadata(),originalMetadata,'Original function definition/owner/ACL/settings restored');
  assert.equal(census(),beforeCensus,'Synthetic fixture cleanup must restore table counts');
  console.log('Cleanup: fixture counts and original function definition/owner/ACL/settings restored.');
  console.log('Tested migration SHA256: '+createHash('sha256').update(readFileSync('supabase/migrations/20261015010000_claim_reminder_delivery.sql')).digest('hex'));
});
test('PG17 cross-workspace claims reject foreign invoice and unauthorized member',()=>{
  for(const role of ['authenticated','service_role']) assert.throws(()=>as(claim(ids.foreign,null,ids.a,'manual'),role),/Invoice does not belong to workspace/);
  assert.throws(()=>as(claim(ids.foreign,null,ids.b,'manual'),'authenticated'),/Workspace access denied/);
  assert.equal(sql(`select count(*) from public.reminder_delivery_claims where workspace_id in ('${ids.a}','${ids.b}')`),'0');
});
test('PG17 concurrent same-occurrence claims yield exactly one successful claim',async()=>{
  const body=claim(ids.race,ids.raceRule);
  const results=await Promise.all([asyncSql(`begin; ${actor('service_role')} ${body}; select pg_sleep(1); commit;`),asyncSql(`begin; ${actor('service_role')} ${body}; commit;`)]);
  assert.deepEqual(results.map(s=>s.split('\n').find(x=>x==='t'||x==='f')).sort(),['f','t']);
  assert.equal(sql(`select count(*) from public.reminder_delivery_claims where invoice_id='${ids.race}'`),'1');
});
test('PG17 NULL-enabled template accepts recurring occurrence seven days after base',()=>{
  assert.equal(sql(`select current_date-(due_date+14) from public.invoices where id='${ids.recurring}'`),'7');
  assert.equal(as(claim(ids.recurring,ids.recurringRule)),'t');
  assert.equal(as(claim(ids.recurring,ids.recurringRule)),'f');
});
