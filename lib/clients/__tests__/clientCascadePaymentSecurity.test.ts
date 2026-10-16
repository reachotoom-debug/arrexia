import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { it } from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { readAllPages } from '../../db/readAllPages';

type MockResult = { data: { id: string }[] | null; error: { message: string } | null };
interface MockQuery extends PromiseLike<MockResult> {
  select(): MockQuery;
  eq(): MockQuery;
  or(): MockQuery;
  in(): MockQuery;
  not(column: string, operator: string, value: unknown): MockQuery;
  order(key: string): MockQuery;
  update(): MockQuery;
  single(): Promise<{ data: { id: string }; error: null }>;
  range(from: number, to: number): Promise<MockResult>;
}
type MockActions = {
  unarchiveClient?: (workspaceId: string, clientId: string, cascade: boolean) => Promise<
    { ok: true } | { ok: false; error: string }
  >;
};

function fixture(options: { count?: number; pageError?: boolean; rejectId?: string; invoiceError?: boolean } = {}) {
  const events: string[] = [];
  const rows = Array.from({ length: options.count ?? 2 }, (_, i) => ({ id: String(i).padStart(4, '0') }));
  const refresh: string[] = [];
  const db = {
    from(table: string) {
      let write = false;
      const query: MockQuery = {
        select() { return query; }, eq() { return query; }, or() { return query; }, in() { return query; },
        not(column: string, operator: string, value: unknown) {
          assert.equal(table, 'payments');
          assert.deepEqual([column, operator, value], ['archived_at', 'is', null]);
          events.push('archived-only');
          return query;
        }, order(key: string) { assert.equal(key, 'id'); return query; },
        update() { write = true; events.push(`update:${table}`); return query; },
        single() { return Promise.resolve({ data: { id: 'client' }, error: null }); },
        range(from: number, to: number) {
          events.push(`page:${table}:${from}`);
          if (table === 'invoices') return Promise.resolve({ data: [{ id: 'invoice' }], error: null });
          return Promise.resolve(options.pageError && from > 0
            ? { data: null, error: { message: 'later page failed' } }
            : { data: rows.slice(from, to + 1), error: null });
        },
        then(resolve, reject) {
          return Promise.resolve({ data: table === 'invoices' ? [{ id: 'invoice' }] : rows,
            error: write && table === 'invoices' && options.invoiceError ? { message: 'invoice restore failed' } : null }).then(resolve, reject);
        },
      };
      return query;
    },
    async rpc(name: string, args: { p_workspace_id: string; p_payment_id: string }) {
      assert.equal(name, 'rpc_unarchive_payment_manual');
      assert.equal(args.p_workspace_id, 'workspace');
      events.push(`rpc:${args.p_payment_id}`);
      return args.p_payment_id === options.rejectId
        ? { data: null, error: { message: 'Restoring would exceed outstanding' } }
        : { data: { ok: true }, error: null };
    },
  };
  const exports: MockActions = {};
  const source = ts.transpileModule(readFileSync('app/[workspaceId]/clients/_actions/clientActions.ts', 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  runInNewContext(source, { exports, console: { log() {}, error() {} }, require(name: string) {
    if (name === 'next/cache') return { revalidatePath: (path: string) => refresh.push(path) };
    if (name.endsWith('/auth/server')) return { requireWorkspace: async () => {} };
    if (name.endsWith('/supabase/server')) return { supabaseServer: async () => db };
    if (name.endsWith('/entitlementGuard')) return { assertWorkspaceMutationAllowed: async () => {} };
    if (name.endsWith('/entitlementErrors')) return { EntitlementError: class extends Error {} };
    if (name.endsWith('/db/readAllPages')) return { readAllPages };
    throw new Error(`Unexpected import ${name}`);
  } });
  return { run: () => {
    assert.ok(exports.unarchiveClient);
    return exports.unarchiveClient('workspace', 'client', true);
  }, events, refresh };
}

it('restores invoices before every archived payment through the guarded RPC across all pages', async () => {
  const f = fixture({ count: 501 });
  assert.equal((await f.run()).ok, true);
  assert.equal(f.events.filter(e => e.startsWith('rpc:')).length, 501);
  assert.ok(f.events.indexOf('update:invoices') < f.events.indexOf('rpc:0000'));
  assert.ok(f.events.indexOf('page:payments:500') < f.events.indexOf('rpc:0000'));
  assert.ok(f.events.includes('archived-only'));
  assert.ok(!f.events.includes('update:payments'));
});
it('does not restore any payments after an incomplete read and refreshes partial client changes', async () => {
  const f = fixture({ count: 501, pageError: true });
  assert.equal((await f.run()).ok, false);
  assert.equal(f.events.filter(e => e.startsWith('rpc:')).length, 0);
  assert.equal(f.refresh.length, 4);
});
it('reports rejected restores truthfully without retrying or directly clearing archived_at', async () => {
  const f = fixture({ rejectId: '0000' });
  const result = await f.run();
  assert.equal(result.ok, false);
  assert.ok(!result.ok);
  assert.match(result.error, /restor|outstanding/i);
  assert.deepEqual(f.events.filter(e => e.startsWith('rpc:')), ['rpc:0000', 'rpc:0001']);
  assert.equal(f.refresh.length, 4);
});
it('does not restore payments when invoice restoration fails', async () => {
  const f = fixture({ invoiceError: true });
  assert.equal((await f.run()).ok, false);
  assert.equal(f.events.filter(e => e.startsWith('rpc:')).length, 0);
  assert.equal(f.refresh.length, 4);
});
