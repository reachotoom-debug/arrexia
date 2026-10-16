// Disposable loopback PostgreSQL only. Replays supplied catalogs, never app URLs.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync, execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { mkdtempSync, readFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const root = mkdtempSync(join(tmpdir(), 'arrexia-security-'));
const data = join(root, 'data');
const { exe, env } = require('./local-postgres-config.cjs');
const pendingMigrations=require('./financial-security-migration-set.cjs');
let setupQueries=null;
const sql = input => {
  if(setupQueries) { setupQueries.push(input); return ''; }
  return execFileSync(exe('psql'), ['-X','-q','-h','127.0.0.1','-p','55453','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-At'], { input, encoding:'utf8', env, windowsHide:true, stdio:'pipe' }).trim();
};
const q = s => "'" + String(s).replaceAll("'", "''") + "'";
const ident = s => '"' + s.replaceAll('"','""') + '"';
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
const a=id(1), b=id(2), org=id(3), ua=id(4), ub=id(5), orgOnly=id(6), both=id(7);
const ca=id(11), cb=id(12), ia=id(21), ib=id(22), pa=id(31), pb=id(32);
const evidenceDir = 'docs/financial-integrity-evidence/production-sql-2026-10-15/';
const exported = JSON.parse(readFileSync('docs/production-evidence/remaining-catalog-security-result.json','utf8'));
const catalog = exported[0].arrexia_remaining_catalog_security.unresolved_checks;
const identityCatalog=JSON.parse(readFileSync('docs/production-evidence/organization-policy-dependencies-result.json','utf8'))[0].organization_policy_dependencies;
const relations = catalog.U03_relation_ownership_rls_and_effective_privileges.relations;
const base = relations.filter(r => r.kind==='r').map(r=>r.relation);
let started=false;
const appliedMigrations=[];
const actor = (role='authenticated', uid=ua) => `set local role ${role}; set local request.jwt.claim.sub=${q(role==='anon'?'':uid)}; set local request.jwt.claim.role=${q(role)};`;
const as = (body, role='authenticated', uid=ua) => sql(`begin; ${actor(role,uid)} ${body}; rollback;`);
const count = (table, uid=ua, role='authenticated') => Number(as(`select count(*) from ${table}`,role,uid));
const denied = (body, role='authenticated', uid=ua) => assert.throws(()=>as(body,role,uid), /permission denied|row-level security/);
function replayGrants(table,roles,acl) {
  // Broad creation defaults must not overwrite the captured later revocations
  // (notably invoices/anon and workspace_members/API mutation restrictions).
  sql(`revoke all on ${ident(table)} from public,anon,authenticated,service_role;`);
  for(const role of roles) {
    const rights=(acl.find(entry=>entry.startsWith(role.role+'='))||'').split('=')[1]?.split('/')[0]||'';
    const perms=['select','insert','update','delete','truncate','trigger'].filter(key=>role[key]);
    if(rights.includes('x')) perms.push('references');
    if(perms.length) sql(`grant ${perms.join(',')} on ${ident(table)} to ${ident(role.role)};`);
    if(rights.includes('m')) sql(`do $fixture$ begin if current_setting('server_version_num')::integer>=170000 then
      execute ${q(`grant maintain on ${ident(table)} to ${ident(role.role)}`)}; end if; end $fixture$;`);
  }
}
before(()=>{
  console.log(`Disposable security fixture retained at ${root}`);
  execFileSync(exe('initdb'),['-D',data,'-U','postgres','-A','trust','--no-locale','-E','UTF8'],{env,windowsHide:true,stdio:'pipe'});
  execFileSync(exe('pg_ctl'),['-D',data,'-l',join(root,'postgres.log'),'-o','-p 55453 -h 127.0.0.1','-w','start'],{env,windowsHide:true,stdio:'ignore'}); started=true;
  setupQueries=[];
  sql(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; grant usage on schema auth,public to anon,authenticated,service_role;
    create table auth.users(id uuid primary key);
    create table message_templates(id uuid primary key);
    alter default privileges for role postgres in schema public grant all on tables to anon,authenticated,service_role;`);
  for(const name of ['uid','role']) {
    const f=catalog.U02_function_security_and_definition_identity.find(f=>f.schema==='auth'&&f.name===name);
    sql(f.remaining_helper_definition);
  }
  // Supplemental columns and policies are captured. Defaults are NOT exported:
  // the following explicit fixture defaults model observed name-only bootstrap,
  // and must not be represented as production-default verification.
  const fixtureDefaults={id:'gen_random_uuid()',default_currency:"'USD'",timezone:"'UTC'",settings:"'{}'::jsonb",
    created_at:'now()',updated_at:'now()',role:"'member'",is_active:'true'};
  for(const r of identityCatalog.authorization_relations) {
    sql(`create table ${ident(r.relation)} (${r.columns.map(c=>`${ident(c.name)} ${c.type}${fixtureDefaults[c.name]?` default ${fixtureDefaults[c.name]}`:''}${c.not_null?' not null':''}`).join(',')});
      alter table ${ident(r.relation)} add primary key(id); alter table ${ident(r.relation)} enable row level security;`);
    replayGrants(r.relation,r.roles,r.acl);
  }
  // Operator-reported constraints and timestamp-only trigger behavior, not raw catalog output.
  sql('alter table users add unique(auth_user_id); alter table users add foreign key(organization_id) references organizations(id) on delete cascade; alter table organizations add unique(slug);');
  for(const p of identityCatalog.authorization_policies) sql(`create policy ${ident(p.policyname)} on ${ident(p.tablename)} as ${p.permissive} for ${p.cmd} to ${p.roles.map(ident).join(',')}${p.qual?` using (${p.qual})`:''}${p.with_check?` with check (${p.with_check})`:''};`);
  // Actual deployed column types/defaults/generated expressions and nullability.
  for(const table of base) {
    const cols=catalog.U04_column_types_defaults_nullability_and_write_bypasses.filter(c=>c.relation===table);
    sql(`create table ${ident(table)} (${cols.map(c=>`${ident(c.column)} ${c.type}${c.generated ? ` generated always as (${c.default_or_expression}) stored` : c.default_or_expression ? ` default ${c.default_or_expression}` : ''}${c.not_null?' not null':''}`).join(',')});`);
  }
  const known = new Set([...base,'users','organizations','auth.users','message_templates']);
  for(const c of catalog.U05_constraints_indexes_and_delete_dependencies.constraints) {
    if(base.includes(c.table)&&(!c.referenced_table||known.has(c.referenced_table))) sql(`alter table ${ident(c.table)} add constraint ${ident(c.name)} ${c.definition};`);
  }
  const constraintNames = new Set(catalog.U05_constraints_indexes_and_delete_dependencies.constraints.map(c=>c.name));
  for(const i of catalog.U05_constraints_indexes_and_delete_dependencies.indexes) if(!constraintNames.has(i.name)) sql(i.definition+';');
  // All actual policies, including legacy organization paths and unsafe true paths.
  for(const r of relations.filter(r=>r.kind==='r')) {
    if(r.rls) sql(`alter table ${ident(r.relation)} enable row level security;`);
    replayGrants(r.relation,r.privileges,r.acl);
  }
  for(const p of catalog.U03_relation_ownership_rls_and_effective_privileges.policies) sql(`create policy ${ident(p.policyname)} on ${ident(p.tablename)} as ${p.permissive} for ${p.cmd} to ${p.roles.map(ident).join(',')}${p.qual?` using (${p.qual})`:''}${p.with_check?` with check (${p.with_check})`:''};`);
  const businessDate=catalog.U02_function_security_and_definition_identity.find(f=>f.name==='workspace_business_date'); sql(businessDate.remaining_helper_definition);
  for(const view of ['invoices_view','payments_view']) {
    sql(`create view ${view} with (security_invoker=true) as ${readFileSync(evidenceDir+view+'.captured.sql','utf8')}`);
    const r=relations.find(r=>r.relation===view);
    replayGrants(view,r.privileges,r.acl);
  }
  // Captured noninternal payment triggers have no accounting-capacity guard.
  for(const t of catalog.U06_unreviewed_payment_triggers_internal_triggers_and_rules.triggers.filter(t=>!t.internal)) {
    sql(t.function_definition); sql(t.definition+';');
  }
  for(const f of ['rpc_create_payment_manual','rpc_update_payment_manual','rpc_unarchive_payment_manual']) {
    // Captured Markdown table escapes are decoded for execution only; source is unchanged.
    sql(readFileSync(evidenceDir+f+'.captured.sql','utf8').replaceAll('\\|','|'));
    const meta=catalog.U02_function_security_and_definition_identity.find(x=>x.name===f);
    const signature=meta.signature.split(', ').map(x=>x.replace(/^\w+ /,'')).join(', ');
    sql(`revoke all on function ${f}(${signature}) from public; grant execute on function ${f}(${signature}) to authenticated;`);
  }
  sql(readFileSync('supabase/migrations/20260728000000_rpc_create_invoice_with_items.sql','utf8'));
  sql(readFileSync('supabase/migrations/20260825130000_rpc_update_invoice_paid_floor_guard.sql','utf8'));
  sql(`insert into organizations(id,name) values ('${org}','Synthetic org'),('${id(8)}','Other org'); insert into auth.users values ('${ua}'),('${ub}'),('${orgOnly}'),('${both}');
    insert into users(id,organization_id,auth_user_id,email) values ('${ua}','${org}','${ua}','a@example.invalid'),('${ub}','${org}','${ub}','b@example.invalid'),('${orgOnly}','${org}','${orgOnly}','org@example.invalid'),('${both}','${org}','${both}','both@example.invalid');
    insert into workspaces(id,name,organization_id) values ('${a}','A','${org}'),('${b}','B','${org}');
    insert into workspace_members(workspace_id,user_id,role) values ('${a}','${ua}','member'),('${b}','${ub}','member'),('${a}','${both}','member'),('${b}','${both}','member');
    insert into settings(workspace_id) values ('${a}'),('${b}');
    insert into clients(id,workspace_id,organization_id,name,currency,email) values ('${ca}','${a}','${org}','A','USD','a@example.invalid'),('${cb}','${b}','${org}','B','USD','b@example.invalid');
    insert into invoices(id,workspace_id,organization_id,client_id,invoice_number,amount,currency,issue_date,status) values
    ('${ia}','${a}','${org}','${ca}','A',100,'USD','2026-10-01','sent'),('${ib}','${b}','${org}','${cb}','B',100,'USD','2026-10-01','sent');
    insert into invoice_items(organization_id,invoice_id,name,unit_price) values ('${org}','${ia}','A',100),('${org}','${ib}','B',100);
    insert into payments(id,workspace_id,organization_id,invoice_id,client_id,amount,currency,payment_date) values
    ('${pa}','${a}','${org}','${ia}','${ca}',50,'USD','2026-10-15'),('${pb}','${b}','${org}','${ib}','${cb}',50,'USD','2026-10-15');
    insert into reminder_templates(id,workspace_id,code,name,subject,body) values ('${id(41)}','${a}','a','A','A','A'),('${id(42)}','${b}','b','B','B','B');
    insert into reminder_rules(workspace_id,template_id,trigger_type) values ('${a}','${id(41)}','after_due'),('${b}','${id(42)}','after_due');
    insert into reminders(workspace_id,organization_id,invoice_id,client_id,type,channel,status) values ('${a}','${org}','${ia}','${ca}','manual','email','sent'),('${b}','${org}','${ib}','${cb}','manual','email','sent');`);
  // Adversarial preexisting column grants must not survive table-only REVOKE.
  sql('grant update(amount),insert(amount) on payments to authenticated; grant update(amount),insert(amount) on payments_view to authenticated; grant update(amount),insert(amount) on payments to public;');
  sql('grant update(organization_id),insert(auth_user_id) on users to public,authenticated; grant update(subscription_tier) on organizations to authenticated;');
  sql('grant update(amount),insert(amount) on invoices to public,authenticated; grant update(unit_price),insert(name) on invoice_items to public,authenticated;');
  for(const migration of pendingMigrations) {
    if(process.env.WORKSPACE_SECURITY_BASELINE==='1' && migration>='20261015150000') continue;
    if(process.env.IDENTITY_WRITE_BASELINE==='1' && migration.startsWith('20261015153000')) continue;
    if(process.env.INVOICE_WRITE_BASELINE==='1' && migration.startsWith('20261015154000')) continue;
    sql(readFileSync('supabase/migrations/'+migration,'utf8'));
    appliedMigrations.push(migration);
  }
  const statements=setupQueries; setupQueries=null; sql(statements.join('\n;\n')+'\n;');
  console.log('Fixture server: '+sql('select version()'));
  console.log('Applied fixture migration order: '+appliedMigrations.join(' -> '));
  assert.equal(sql("select has_table_privilege('authenticated','workspace_members','INSERT') or has_table_privilege('authenticated','workspace_members','UPDATE') or has_table_privilege('authenticated','workspace_members','DELETE')"),'f');
  console.log('Captured preexisting membership write revocations retained; broad defaults apply only before explicit ACL replay.');
});
after(()=>{if(started)execFileSync(exe('pg_ctl'),['-D',data,'-m','fast','-w','stop'],{env,windowsHide:true,stdio:'ignore'});});
const editInvoice=(amount,workspace=a,invoice=ia,items=[{name:'Replacement',quantity:1,unit_price:amount}])=>
  `select rpc_update_invoice_with_items('${workspace}','${invoice}','2026-10-01','2026-10-31',null,null,'sent','Net 30',30,${amount},0,0,0,0,${amount},${q(JSON.stringify(items))}::jsonb)`;
test('invoice header and item direct financial bypasses are denied, including column grants',()=>{
  for(const assignment of ['amount=1','subtotal=1',"currency='EUR'",`client_id='${cb}'`]) denied(`update invoices set ${assignment} where id='${ia}'`);
  denied(`delete from invoices where id='${ia}'`);
  denied(`insert into invoices(workspace_id,organization_id,client_id,invoice_number,amount,currency,issue_date,status) values ('${a}','${org}','${ca}','bypass',1,'USD','2026-10-01','sent')`);
});
test('direct invoice item mutation bypasses are denied independently of header rights',()=>{
  denied(`update invoice_items set unit_price=1 where invoice_id='${ia}'`);
  denied(`delete from invoice_items where invoice_id='${ia}'`);
  denied(`insert into invoice_items(organization_id,invoice_id,name,unit_price) values ('${org}','${ia}','bypass',1)`);
});
test('invoice archive, restore and collection notes survive with tenant isolation',()=>{
  as(`update invoices set archived_at=now() where id='${ia}'; update invoices set archived_at=null,notes='collection note' where id='${ia}'`);
  assert.equal(as(`with changed as (update invoices set archived_at=now() where id='${ib}' returning id) select count(*) from changed`),'0');
  as(`update invoices set notes='service' where id='${ib}'`,'service_role');
});
test('direct status writes permit only draft promotion; other status changes use atomic edit',()=>{
  denied(`update invoices set status='void' where id='${ia}'`);
  sql(`update invoices set status='draft' where id='${ia}'`);
  as(`update invoices set status='sent' where id='${ia}'`);
  sql(`update invoices set status='sent' where id='${ia}'`);
});
test('atomic edit checks payment floor and authorization and rolls header/items back on failure',()=>{
  const before=sql(`select json_build_array((select row_to_json(i) from invoices i where id='${ia}'),(select json_agg(t) from invoice_items t where invoice_id='${ia}'))`);
  assert.throws(()=>as(editInvoice(49)),/less than.*already paid/);
  assert.throws(()=>as(editInvoice(80,b,ib)),/Not a workspace member/);
  assert.throws(()=>as(editInvoice(80,a,ib)),/Invoice not found/);
  assert.throws(()=>as(editInvoice(80,a,ia,[{name:'bad',quantity:1,unit_price:80,position:'invalid'}])),/invalid input syntax/);
  assert.equal(sql(`select json_build_array((select row_to_json(i) from invoices i where id='${ia}'),(select json_agg(t) from invoice_items t where invoice_id='${ia}'))`),before);
  as(editInvoice(80));
});
test('effective invoice financial column privileges are removed without changing service operations',()=>{
  for(const role of ['anon','authenticated']) for(const table of ['invoices','invoice_items']) {
    for(const privilege of ['INSERT','UPDATE','DELETE']) assert.equal(sql(`select has_table_privilege('${role}','${table}','${privilege}')`),'f');
    assert.equal(sql(`select has_any_column_privilege('${role}','${table}','INSERT')`),'f');
  }
  for(const column of ['amount','subtotal','discount_amount','tax_amount','workspace_id','client_id']) assert.equal(sql(`select has_column_privilege('authenticated','invoices','${column}','UPDATE')`),'f');
  assert.equal(sql("select has_any_column_privilege('authenticated','invoice_items','UPDATE')"),'f');
  for(const table of ['invoices','invoice_items']) for(const privilege of ['INSERT','UPDATE','DELETE']) assert.equal(sql(`select has_table_privilege('service_role','${table}','${privilege}')`),'t');
});
test('atomic invoice create preserves legitimate form flow and rejects foreign-workspace clients',()=>{
  const create=(client=ca,items=[{name:'Form item',quantity:1,unit_price:25}])=>`select rpc_create_invoice_with_items('${a}','${client}','form-fixture','2026-10-01','2026-10-31',null,null,'sent','Net 30',30,'USD',25,0,0,0,0,25,${q(JSON.stringify(items))}::jsonb)`;
  const before=sql('select count(*) from invoices');
  assert.equal(JSON.parse(as(create())).ok,true);
  assert.throws(()=>as(create(cb)),/Client not found/);
  assert.throws(()=>as(create(ca,[{name:'bad insert',quantity:1,unit_price:25,position:'invalid'}])),/invalid input syntax/);
  assert.equal(sql('select count(*) from invoices'),before);
});
test('invoice boundary aborts on inherited financial rights and guard creation failure', {skip:process.env.INVOICE_WRITE_BASELINE==='1'},()=>{
  const migration=readFileSync('supabase/migrations/20261015154000_invoice_write_boundary.sql','utf8');
  assert.throws(()=>sql(`begin; create role hostile_invoice; grant hostile_invoice to authenticated; grant update(amount) on invoices to hostile_invoice; ${migration}`),/Unexpected inherited\/PUBLIC invoice column UPDATE/);
  assert.equal(sql("select has_column_privilege('authenticated','invoices','amount','UPDATE')"),'f');
  // Existing guard makes repeat CREATE fail. Entire DO must roll back, including
  // its revocations, rather than leaving a partially installed boundary.
  sql('grant update(amount) on invoices to authenticated');
  try {
    assert.throws(()=>sql(migration),/already exists/);
    // No outer transaction: the failed DO must itself restore the exact prior
    // grant. A split autocommit migration would have committed its REVOKE.
    assert.equal(sql("select has_column_privilege('authenticated','invoices','amount','UPDATE')"),'t');
  } finally { sql('revoke update(amount) on invoices from authenticated'); }
});
function holdMutation(body,label) {
  return promisify(execFile)(exe('psql'),['-X','-q','-h','127.0.0.1','-p','55453','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-At','-c',
    `begin; ${actor()} ${body}; select pg_sleep(3); commit;`],{env:{...env,PGAPPNAME:label},windowsHide:true});
}
test('concurrent invoice reduction serializes before payment and rejects excess payment',async()=>{
  const label='invoice_lock_first';
  const ready=holdMutation(editInvoice(80),label);
  await waitForHeldMutation(label);
  assert.throws(()=>as(`select rpc_create_payment_manual('${a}','${ca}','${ia}',40,'2026-10-15','manual','completed',null,null,null)`),/exceed|overpayment/i);
  await ready;
  assert.equal(sql(`select amount from invoices where id='${ia}'`),'80.00');
  sql(`update invoices set amount=100 where id='${ia}'; update invoice_items set unit_price=100 where invoice_id='${ia}'`);
});
async function waitForHeldMutation(label) {
  // The mutation has completed and is holding its invoice lock before the
  // opposing transaction starts. No timing-only assumption about lock ordering.
  for(let n=0;n<40;n++) {
    if(sql(`select count(*) from pg_stat_activity where application_name='${label}' and wait_event='PgSleep'`)==='1') return;
    await new Promise(resolve=>setTimeout(resolve,25));
  }
  throw new Error('Financial mutation lock was not observed');
}
test('concurrent payment serializes before invoice reduction and preserves payment floor',async()=>{
  const label='payment_lock_first';
  const ready=holdMutation(`select rpc_create_payment_manual('${a}','${ca}','${ia}',20,'2026-10-15','manual','completed',null,null,null)`,label);
  await waitForHeldMutation(label);
  assert.throws(()=>as(editInvoice(60)),/less than.*already paid/);
  await ready;
  assert.equal(sql(`select amount from invoices where id='${ia}'`),'100.00');
  sql(`delete from payments where invoice_id='${ia}' and id<>'${pa}'`);
});
test('member rule/template reads are workspace scoped despite old permissive alternatives',()=>{
  assert.equal(count('reminder_rules'),1); assert.equal(count('reminder_templates'),1);
  assert.equal(count('reminder_rules',both),2); assert.equal(count('reminder_templates',orgOnly),0);
});
test('organization alternatives remain but cannot authorize another workspace',()=>{
  for(const table of ['clients','invoices','invoice_items','payments','reminders']) {
    assert.equal(count(table),1,table); assert.equal(count(table,orgOnly),0,table);
    assert.equal(count(table,both),2,table);
  }
  assert.equal(Number(sql(`select count(*) from pg_policies where policyname like 'Org members manage%'`)),5);
});
const reminderInsert=(workspace,invoice,status='sent')=>`insert into reminders(workspace_id,organization_id,invoice_id,type,channel,status) values ('${workspace}','${org}','${invoice}','manual','email','${status}')`;
test('cross-workspace and spoofed reminder inserts are rejected; legitimate attempt logs survive',()=>{
  denied(reminderInsert(b,ib)); denied(reminderInsert(a,ib));
  denied(reminderInsert(a,ia),'authenticated',orgOnly);
  denied(reminderInsert(a,ia),'anon');
  for(const status of ['sent','failed','skipped']) as(reminderInsert(a,ia,status));
  denied(`insert into reminders(workspace_id,organization_id,invoice_id,type,channel,status) values(null,'${org}','${ia}','manual','email','failed')`);
});
test('old-row and new-row workspace checks reject moving clients, items and reminder logs',()=>{
  as(`update clients set name='allowed' where id='${ca}'`);
  denied(`update clients set workspace_id='${b}' where id='${ca}'`);
  denied(`update invoice_items set invoice_id='${ib}' where invoice_id='${ia}'`);
  denied(`update reminders set workspace_id='${b}',invoice_id='${ib}' where workspace_id='${a}'`);
  assert.equal(as(`with changed as (update clients set name='forbidden' where id='${cb}' returning id) select count(*) from changed`),'0');
});
test('same-workspace direct financial writes and column-grant bypasses are denied atomically',()=>{
  for(const assignment of ['amount=150','transaction_fee=20',"status='paid'",`invoice_id='${ib}'`,`workspace_id='${b}'`,"currency='EUR'"]) denied(`update payments set ${assignment} where id='${pa}'`);
  denied(`insert into payments(workspace_id,organization_id,invoice_id,client_id,amount,currency,payment_date) values ('${a}','${org}','${ia}','${ca}',1000,'USD','2026-10-15')`);
  denied(`delete from payments where id='${pa}'`);
  assert.equal(Number(sql(`select amount from payments where id='${pa}'`)),50);
});
test('archive remains supported, direct restore is blocked and guarded RPC restore preserves capacity',()=>{
  as(`update payments set archived_at=now() where id='${pa}'`);
  denied(`update payments set archived_at=null where id='${pa}'`);
  // Actual archived row: guard accepts a fitting restore and rejects an excess restore.
  sql(`update payments set archived_at=now() where id='${pa}'`);
  as(`select rpc_unarchive_payment_manual('${a}','${pa}')`);
  sql(`update payments set amount=150 where id='${pa}'`);
  assert.throws(()=>as(`select rpc_unarchive_payment_manual('${a}','${pa}')`),/exceed.*outstanding/);
  sql(`update payments set amount=50,archived_at=null where id='${pa}'`);
});
test('real member create/update RPCs remain usable while accounting limits and workspace authorization survive',()=>{
  as(`select rpc_create_payment_manual('${a}','${ca}','${ia}',20,'2026-10-15','manual','completed',null,null,null)`);
  as(`select rpc_update_payment_manual('${a}','${pa}','${ca}','${ia}',80,'2026-10-15','manual','completed',null,null,null)`);
  assert.throws(()=>as(`select rpc_update_payment_manual('${a}','${pa}','${ca}','${ia}',150,'2026-10-15','manual','completed',null,null,null)`),/overpayment/);
  assert.throws(()=>as(`select rpc_unarchive_payment_manual('${b}','${pb}')`),/Not a workspace member/);
});
test('effective API privileges remove all table/column/view write bypasses, retaining archive only',()=>{
  for(const role of ['anon','authenticated']) {
    assert.equal(sql(`select has_table_privilege('${role}','payments','INSERT') or has_table_privilege('${role}','payments','UPDATE') or has_table_privilege('${role}','payments','DELETE')`),'f');
    for(const col of ['amount','transaction_fee','status','invoice_id','workspace_id']) assert.equal(sql(`select has_column_privilege('${role}','payments','${col}','UPDATE')`),'f');
    for(const view of ['payments_view','invoices_view']) assert.equal(sql(`select has_table_privilege('${role}','${view}','INSERT') or has_table_privilege('${role}','${view}','UPDATE') or has_table_privilege('${role}','${view}','DELETE')`),'f');
  }
  assert.equal(sql("select has_column_privilege('authenticated','payments','archived_at','UPDATE')"),'t');
  assert.equal(sql("select has_column_privilege('anon','payments','archived_at','UPDATE')"),'f');
  assert.equal(sql("select has_column_privilege('authenticated','payments_view','amount','UPDATE')"),'f');
});
test('TRUNCATE and TRIGGER are denied to API roles on every captured base table; service role is unchanged',()=>{
  for(const table of base) for(const role of ['anon','authenticated']) for(const privilege of ['TRUNCATE','TRIGGER']) assert.equal(sql(`select has_table_privilege('${role}','${table}','${privilege}')`),'f',`${role} ${table} ${privilege}`);
  denied('truncate reminder_rules','anon'); denied('truncate reminder_rules');
  for(const table of base) assert.equal(sql(`select has_table_privilege('service_role','${table}','TRUNCATE')`),'t');
});
test('anonymous reads fail closed while service-role/public-invoice and admin payment operations survive',()=>{
  for(const table of ['clients','invoice_items','payments','reminder_rules','reminder_templates','reminders']) {
    // The captured anon role lacks invoices SELECT, so dependent RLS may deny
    // the query rather than return an empty set. Both must disclose no rows.
    let rows;
    try { rows=count(table,ua,'anon'); } catch(error) { assert.match(String(error),/permission denied/); continue; }
    assert.equal(rows,0);
  }
  assert.equal(count('invoices_view',ua,'service_role'),2);
  assert.equal(count('reminder_rules',ua,'service_role'),2);
  as(`update payments set amount=51 where id='${pa}'; delete from payments where id='${pa}'`,'service_role');
  as(reminderInsert(b,ib),'service_role');
});
test('a new permissive true policy cannot override the installed restrictive boundary',()=>{
  sql('create policy adversarial_true on reminder_templates for select to authenticated using(true)');
  assert.equal(count('reminder_templates'),1);
  sql('drop policy adversarial_true on reminder_templates');
});
test('unexpected inherited writes/destructive privileges abort atomically rather than silently pass', {skip:process.env.WORKSPACE_SECURITY_BASELINE==='1'},()=>{
  const boundary=readFileSync('supabase/migrations/20261015151000_payment_write_boundary.sql','utf8');
  assert.throws(()=>sql(`begin; create role hostile_parent; grant hostile_parent to authenticated;
    grant update(amount) on payments to hostile_parent; drop policy payments_direct_archive_only on payments;
    ${boundary}`),/Unexpected inherited\/PUBLIC payment column UPDATE/);
  assert.equal(sql("select has_column_privilege('authenticated','payments','amount','UPDATE')"),'f');
  const destructive=readFileSync('supabase/migrations/20261015152000_remove_api_destructive_privileges.sql','utf8');
  assert.throws(()=>sql(`begin; create role hostile_parent; grant hostile_parent to authenticated;
    grant truncate on clients to hostile_parent; ${destructive}`),/Unexpected inherited destructive privilege/);
  assert.equal(sql("select has_table_privilege('authenticated','clients','TRUNCATE')"),'f');
});
test('supplemental organization review returns aggregate evidence without mutating fixture data',()=>{
  const before=sql('select count(*) from payments');
  const report=JSON.parse(sql(readFileSync('scripts/db/organization-policy-dependencies.readonly.sql','utf8')));
  assert.equal(report.label,'ARREXIA_ORGANIZATION_POLICY_DEPENDENCIES_V1');
  assert.equal(report.context.read_only,'on');
  assert.equal(report.authorization_relations.length,2);
  assert.equal(report.organization_vs_workspace_subject_census.length,2);
  assert.ok(report.organization_vs_workspace_subject_census.every(c=>c.organization_only_subjects===2));
  assert.deepEqual(report.membership_helpers,[]);
  assert.equal(sql('select count(*) from payments'),before);
});
test('identity self-insert and organization/role reassignment cannot be used to gain authorization',()=>{
  for(const assignment of [`organization_id='${id(8)}'`,"role='owner'",`id='${id(55)}'`,`auth_user_id='${id(56)}'`,'is_active=false']) denied(`update users set ${assignment} where auth_user_id='${ua}'`);
  denied(`insert into users(organization_id,auth_user_id,email,role) values ('${org}','${id(57)}','new@example.invalid','owner')`,'authenticated',id(57));
  assert.equal(as(`select count(*) from users`),'1');
});
test('organization subscription, trial and limit writes are not profile updates',()=>{
  for(const assignment of ["subscription_tier='enterprise'","subscription_status='active'","trial_ends_at='2099-01-01'",'monthly_invoice_limit=999999','user_limit=999999',"settings='{}'::jsonb"]) denied(`update organizations set ${assignment} where id='${org}'`);
  assert.equal(as('select count(*) from organizations'),'1');
});
test('effective identity table and column writes are absent, including public grants; service grants survive',()=>{
  for(const table of ['users','organizations']) {
    for(const role of ['anon','authenticated']) {
      for(const privilege of ['INSERT','UPDATE','DELETE','TRUNCATE','TRIGGER']) assert.equal(sql(`select has_table_privilege('${role}','${table}','${privilege}')`),'f');
      for(const privilege of ['INSERT','UPDATE']) assert.equal(sql(`select has_any_column_privilege('${role}','${table}','${privilege}')`),'f');
      assert.equal(sql(`select has_table_privilege('${role}','${table}','SELECT')`),'t');
    }
    for(const privilege of ['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','TRIGGER']) assert.equal(sql(`select has_table_privilege('service_role','${table}','${privilege}')`),'t');
  }
  denied('truncate users cascade','anon');
});
test('service-role name-only organization bootstrap and authorization-record maintenance remain possible',()=>{
  // Defaults here are explicitly synthetic, not evidence of deployed defaults.
  const result=JSON.parse(as(`with organization as (insert into organizations(name) values ('Bootstrap fixture') returning id),
    subject as (insert into users(organization_id,auth_user_id,email) select id,'${id(70)}','bootstrap@example.invalid' from organization returning id)
    select json_build_object('organizations',(select count(*) from organization),'users',(select count(*) from subject))`,'service_role'));
  assert.deepEqual(result,{organizations:1,users:1});
  as(`update users set role='admin' where id='${ua}'; update organizations set subscription_tier='service-change' where id='${org}'`,'service_role');
});
test('identity migration aborts atomically on inherited column privileges', {skip:process.env.IDENTITY_WRITE_BASELINE==='1'},()=>{
  const migration=readFileSync('supabase/migrations/20261015153000_users_organizations_write_boundary.sql','utf8');
  assert.throws(()=>sql(`begin; create role hostile_identity; grant hostile_identity to authenticated;
    grant update(role) on users to hostile_identity; ${migration}`),/Unexpected inherited\/PUBLIC identity column write/);
  assert.equal(sql("select has_any_column_privilege('authenticated','users','UPDATE')"),'f');
});
test('the pending migrations install in order without a helper or historical repair and retain guarded flows', {skip:process.env.IDENTITY_WRITE_BASELINE==='1'||process.env.WORKSPACE_SECURITY_BASELINE==='1'||process.env.INVOICE_WRITE_BASELINE==='1'},()=>{
  assert.equal(pendingMigrations.length,8);
  assert.deepEqual([...pendingMigrations].sort(),pendingMigrations);
  assert.deepEqual(appliedMigrations,pendingMigrations);
  assert.ok(pendingMigrations.every(m=>!m.includes('historical')&&!m.includes('repair')));
  assert.equal(sql("select to_regprocedure('public.is_workspace_member(uuid)') is null"),'t');
  assert.equal(sql("select has_table_privilege('authenticated','reminder_delivery_claims','TRUNCATE')"),'f');
  assert.equal(as(`select claim_reminder_delivery('${a}','${ia}',null,null,workspace_business_date('Asia/Amman'),'manual')`),'t');
  const payload=[{row_type:'invoice',invoice_number:'A',client_email:'a@example.invalid',issue_date:'2026-10-01',due_date:'2026-10-31',currency:'USD',status:'sent'},
    {row_type:'item',invoice_number:'A',item_description:'Synthetic',quantity:1,unit_price:100}];
  assert.equal(JSON.parse(as(`select internal_import_invoices_grouped('${a}',${q(JSON.stringify(payload))}::jsonb,false)`,'service_role')).ok,true);
});
