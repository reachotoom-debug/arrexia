import '@/lib/test/nodeTestSetup';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import Module from 'node:module';

const runtime = Module as typeof Module & { _load: (request: string, parent: unknown, isMain: boolean) => unknown };
const originalLoad = runtime._load;
const requireSender = Module.createRequire(__filename);
let sends = 0;
const mocks: Record<string, unknown> = {
  '@/lib/email/sendEmail': { resolveEmailProvider: () => 'resend', sendEmail: async () => { sends++; return { success: true, messageId: 'accepted' }; } },
  '@/lib/audit/log': { logAuditEvent: async () => undefined },
  '@/lib/billing/entitlementGuard': {
    assertManualReminderQuotaAvailable: async () => undefined,
    reserveManualEmailReminderSlot: async () => null,
  },
  '@/lib/reminders/ruleTemplate': { resolveGenericManualTemplate: async () => ({resolvedTemplateId: null, templateData: null}) },
  '@/lib/workspaces/getWorkspaceOrganizationId': { getWorkspaceOrganizationId: async () => 'org' },
  '@/lib/invoices/ensurePublicAccessToken': { ensurePublicInvoiceUrl: async () => 'https://example.test/i' },
};
runtime._load = function(request, parent, isMain) {
  if (request in mocks) return mocks[request];
  return originalLoad.call(this, request, parent, isMain);
};
const { sendReminderForInvoice } = (() => {
  if (process.env.REMINDER_DELIVERY_BASELINE !== '1') return requireSender('../send');
  const { execFileSync } = requireSender('node:child_process');
  const ts = requireSender('typescript');
  const path = requireSender('node:path');
  const baseline = new Module(path.resolve('lib/reminders/send.baseline-test.cjs'), module);
  baseline.paths = module.paths;
  (baseline as NodeModule & { _compile: (source: string, filename: string) => void })._compile(
    ts.transpileModule(execFileSync('git', ['show', 'HEAD:lib/reminders/send.ts'], {encoding:'utf8'}),
      {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,
    baseline.filename || 'send.baseline-test.cjs'
  );
  return baseline.exports;
})() as typeof import('../send');
runtime._load = originalLoad;

test('actual sender reports accepted delivery when reminder history insert fails and blocks retry', async () => {
  let claimed = false;
  const db = {
    rpc: async () => { if (claimed) return { data: false, error: null }; claimed = true; return { data: true, error: null }; },
    from(table: string) {
      let inserted = false;
      const chain = {
        select() { return chain; }, eq() { return chain; }, is() { return chain; }, gt() { return chain; },
        insert() { inserted = true; return chain; },
        async single() { return { data: null, error: {message:'history database unavailable',code:'TEST'} }; },
        async maybeSingle() {
          if (inserted) return chain.single();
          const data = table === 'invoices_view' ? { id:'i', workspace_id:'w',client_id:'c',invoice_number:'INV-1',base_status:'sent',due_date:'2026-10-10',total:100,paid:0,outstanding:100,currency:'USD' }
            : table === 'clients' ? {id:'c',name:'Client',email:'client@example.test',archived_at:null,is_active:true}
            : table === 'settings' ? {timezone:'UTC',email_provider:'resend'}
            : table === 'workspaces' ? {name:'Workspace'} : null;
          return {data,error:null};
        },
      }; return chain;
    },
  };
  const options = {workspaceId:'w',invoiceId:'i',supabase:db as never};
  const result = await sendReminderForInvoice(options);
  assert.equal(result.status, 'sent');
  assert.equal(result.success, true);
  assert.equal(result.historyPersisted, false);
  assert.match(result.message ?? '', /history database unavailable/);
  const retry = await sendReminderForInvoice(options);
  assert.equal(retry.skipReason, 'delivery_already_claimed');
  assert.equal(sends, 1);
});
