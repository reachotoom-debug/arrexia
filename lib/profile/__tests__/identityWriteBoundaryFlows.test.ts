import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { it } from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

type ProfileInput = { full_name?: string; avatar_url?: string | null };
type Write = { table: string; payload: Record<string, unknown>; options: { onConflict: string } };

function fixture(authenticated = true) {
  const writes: Write[] = [];
  let databaseConnections = 0;
  const exported: { upsertProfile?: (input: ProfileInput) => Promise<{ error?: string }> } = {};
  const source = ts.transpileModule(readFileSync('lib/profile/server.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  runInNewContext(source, {
    exports: exported,
    require(name: string) {
      if (name === 'react') return { cache: (fn: unknown) => fn };
      if (name === '@/lib/auth/server') return {
        getAuthenticatedUser: async () => authenticated ? { id: 'verified-auth-uid' } : null,
      };
      if (name === '@/lib/perf/server') return {};
      if (name === '@/lib/supabase/server') return {
        supabaseServer: async () => {
          databaseConnections++;
          return {
            from(table: string) {
              return {
                async upsert(payload: Record<string, unknown>, options: { onConflict: string }) {
                  writes.push({ table, payload: { ...payload }, options: { ...options } });
                  return { error: null };
                },
              };
            },
          };
        },
      };
      throw new Error(`Unexpected dependency: ${name}`);
    },
  });
  assert.ok(exported.upsertProfile);
  return { upsert: exported.upsertProfile, writes, connections: () => databaseConnections };
}

it('keeps authenticated account edits on profiles with the verified UID and explicit profile fields', async () => {
  const f = fixture();
  const started = Date.now();
  assert.equal((await f.upsert({ full_name: 'Example Person', avatar_url: 'https://fixture.invalid/avatar.png' })).error, undefined);
  assert.equal(f.connections(), 1);
  assert.equal(f.writes.length, 1);
  const write = f.writes[0];
  assert.equal(write.table, 'profiles');
  assert.deepEqual(Object.keys(write.payload).sort(), ['avatar_url', 'full_name', 'id', 'updated_at']);
  assert.equal(write.payload.id, 'verified-auth-uid');
  assert.equal(write.payload.full_name, 'Example Person');
  assert.equal(write.payload.avatar_url, 'https://fixture.invalid/avatar.png');
  const timestamp = Date.parse(String(write.payload.updated_at));
  assert.ok(timestamp >= started && timestamp <= Date.now());
  assert.deepEqual(write.options, { onConflict: 'id' });
});

it('does not connect to the database or write when authentication is absent', async () => {
  const f = fixture(false);
  assert.equal((await f.upsert({ full_name: 'Untrusted' })).error, 'User not authenticated');
  assert.equal(f.connections(), 0);
  assert.equal(f.writes.length, 0);
});

it('ignores runtime identity and organization fields instead of copying them into a profile write', async () => {
  const f = fixture();
  const untrustedInput = {
    full_name: 'Allowed name', avatar_url: null,
    id: 'forged-id', organization_id: 'foreign-org', role: 'owner', auth_user_id: 'forged-auth',
  };
  assert.equal((await f.upsert(untrustedInput)).error, undefined);
  assert.equal(f.writes.length, 1);
  assert.equal(f.writes[0].table, 'profiles');
  assert.equal(f.writes[0].payload.id, 'verified-auth-uid');
  assert.equal(f.writes[0].payload.full_name, 'Allowed name');
  assert.equal(f.writes[0].payload.avatar_url, null);
  for (const column of ['organization_id', 'role', 'auth_user_id']) {
    assert.equal(Object.hasOwn(f.writes[0].payload, column), false);
  }
});
