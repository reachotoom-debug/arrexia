// Real PostgreSQL ACL tests in a disposable loopback-only cluster; no application env.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { mkdtempSync, readFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');

test('security remediation SQL: overloads, ACLs, policies, replay and inherited grants', () => {
  const bin = 'C:/Program Files/PostgreSQL/15/bin';
  const root = mkdtempSync(join(tmpdir(), 'arrexia-security-acl-'));
  const data = join(root, 'data');
  const env = {};
  for (const key of ['PATH', 'Path', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP']) {
    if (process.env[key]) env[key] = process.env[key];
  }
  const run = (name, args, input) => (execFileSync(join(bin, name + '.exe'), args,
    { env, input, encoding: 'utf8', windowsHide: true,
      stdio: name === 'pg_ctl' ? 'ignore' : 'pipe', timeout: 60000 }) || '').replaceAll('\r\n', '\n').trim();
  const sql = text => run('psql', ['-X', '-h', '127.0.0.1', '-p', '55447', '-U', 'postgres',
    '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At', '-1'], text);
  const imports = readFileSync('supabase/migrations/20261009120000_restrict_legacy_payment_import_execute.sql', 'utf8');
  const members = readFileSync('supabase/migrations/20261009121000_restrict_workspace_members_writes.sql', 'utf8');
  let started = false;
  try {
    run('initdb', ['-D', data, '-U', 'postgres', '-A', 'trust', '--no-locale']);
    run('pg_ctl', ['-D', data, '-l', join(root, 'postgres.log'), '-o', '-h 127.0.0.1 -p 55447', '-w', 'start']);
    started = true;
    sql(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
      CREATE SCHEMA auth;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
        SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
      $$;
      CREATE TYPE public.payment_import_row AS (row_id integer);
      CREATE FUNCTION public.rpc_import_payments(uuid,jsonb,boolean) RETURNS jsonb LANGUAGE sql AS $$SELECT '{}'::jsonb$$;
      CREATE TABLE public.workspace_members(workspace_id uuid,user_id uuid,role text);
      INSERT INTO public.workspace_members VALUES ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','owner');
      ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;
      GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspace_members TO PUBLIC, anon, authenticated;
      GRANT INSERT(role), UPDATE(role) ON public.workspace_members TO authenticated;
      CREATE POLICY "workspace_members select own" ON public.workspace_members FOR SELECT TO authenticated USING(true);
      CREATE POLICY workspace_members_select_own ON public.workspace_members FOR SELECT TO authenticated USING(true);
      CREATE POLICY "workspace_members insert own" ON public.workspace_members FOR INSERT TO authenticated WITH CHECK(true);
      CREATE POLICY "workspace_members update own" ON public.workspace_members FOR UPDATE TO authenticated USING(true) WITH CHECK(true);
      CREATE POLICY "workspace_members delete own" ON public.workspace_members FOR DELETE TO authenticated USING(true);
      CREATE POLICY workspace_members_insert_self ON public.workspace_members FOR INSERT TO authenticated WITH CHECK(user_id = auth.uid());
      CREATE POLICY workspace_members_insert_own ON public.workspace_members FOR INSERT TO authenticated WITH CHECK(user_id = auth.uid());`);
    const signatures = [];
    for (const name of ['import_execute_payments', 'import_preview_payments']) {
      for (const args of ['uuid,public.payment_import_row[]', 'public.payment_import_row[],uuid']) {
        const signature = `public.${name}(${args})`;
        signatures.push(signature);
        sql(`CREATE FUNCTION ${signature} RETURNS integer LANGUAGE sql AS $$SELECT 1$$;
          GRANT EXECUTE ON FUNCTION ${signature} TO anon, authenticated, service_role;`);
      }
    }
    sql(imports + members);
    sql(imports + members); // Idempotent replay.
    for (const signature of [...signatures, 'public.rpc_import_payments(uuid,jsonb,boolean)']) {
      assert.equal(sql(`SELECT has_function_privilege('anon','${signature}','EXECUTE'),
        has_function_privilege('authenticated','${signature}','EXECUTE'),
        has_function_privilege('service_role','${signature}','EXECUTE')`), 'f|f|t');
    }
    assert.equal(sql(`SELECT count(*), min(role) FROM public.workspace_members`), '1|owner');
    assert.equal(sql(`SELECT string_agg(policyname,',' ORDER BY policyname) FROM pg_policies
      WHERE schemaname='public' AND tablename='workspace_members'`), 'workspace_members select own,workspace_members_select_own');
    assert.equal(sql(`SELECT count(*) FROM pg_policies WHERE schemaname='public'
      AND tablename='workspace_members' AND cmd IN ('INSERT','UPDATE','DELETE','ALL')`), '0');
    assert.equal(sql(`SET ROLE authenticated; SELECT role FROM public.workspace_members`), 'SET\nowner');
    for (const statement of [
      "INSERT INTO public.workspace_members(role) VALUES ('owner')",
      "UPDATE public.workspace_members SET role='owner'",
      'DELETE FROM public.workspace_members',
    ]) assert.throws(() => sql(`SET ROLE authenticated; ${statement}`), /permission denied/);
    sql(`SET ROLE service_role; INSERT INTO public.workspace_members(role) VALUES ('owner');
      UPDATE public.workspace_members SET role='member' WHERE workspace_id IS NULL;
      DELETE FROM public.workspace_members WHERE workspace_id IS NULL;`);
    sql(`DROP FUNCTION ${signatures[1]}; DROP FUNCTION ${signatures[3]};`);
    sql(imports); // Reversed overloads absent in historical repository migrations.
    for (const command of ['INSERT', 'UPDATE', 'DELETE', 'ALL']) {
      const clause = command === 'INSERT' ? 'WITH CHECK(true)' : 'USING(true)';
      sql(`CREATE POLICY unexpected_write ON public.workspace_members FOR ${command} TO authenticated ${clause};`);
      assert.throws(() => sql(members), /Membership INSERT, UPDATE, DELETE or ALL policies remain/);
      sql('DROP POLICY unexpected_write ON public.workspace_members');
    }
    sql(`CREATE ROLE inherited_writer; GRANT inherited_writer TO authenticated;
      GRANT UPDATE(role) ON public.workspace_members TO inherited_writer;`);
    assert.throws(() => sql(members), /Inherited membership write access remains/);
    sql(`REVOKE UPDATE(role) ON public.workspace_members FROM inherited_writer;
      GRANT EXECUTE ON FUNCTION ${signatures[0]} TO inherited_writer;`);
    assert.throws(() => sql(imports), /Inherited EXECUTE remains/);
  } finally {
    if (started) run('pg_ctl', ['-D', data, '-m', 'immediate', '-w', 'stop']);
  }
});
