import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dispatchClaimedReminder } from '../deliveryClaim';

function database() {
  const claims = new Set<string>();
  return { rpc: async (_name: string, args: Record<string, string>) => {
    const key = args.p_invoice_id;
    if (claims.has(key)) return { data: false, error: null };
    claims.add(key);
    return { data: true, error: null };
  }};
}
const occurrence = { workspaceId: 'w', invoiceId: 'i', ruleId: 'r', scheduledDate: '2026-10-15', evaluationDate: '2026-10-15', source: 'auto_cron' as const };
test('concurrent manual and cron callers invoke provider once', async () => {
  const db = database(); let sends = 0;
  const send = async () => { sends++; await Promise.resolve(); };
  await Promise.all([
    dispatchClaimedReminder(db as never, occurrence, send),
    dispatchClaimedReminder(db as never, { ...occurrence, source: 'manual', ruleId: null }, send),
  ]);
  assert.equal(sends, 1);
});
test('accepted provider followed by history failure remains claimed', async () => {
  const db = database(); let sends = 0;
  await assert.rejects(dispatchClaimedReminder(db as never, occurrence, async () => { sends++; throw new Error('history unavailable after acceptance'); }));
  assert.equal(await dispatchClaimedReminder(db as never, occurrence, async () => { sends++; }), false);
  assert.equal(sends, 1);
});
test('claim database error fails closed before provider', async () => {
  let sends = 0;
  await assert.rejects(dispatchClaimedReminder({ rpc: async () => ({ error: {message:'unavailable'}, data: null }) } as never, occurrence, async () => { sends++; }));
  assert.equal(sends, 0);
});
test('provider timeout cannot release a claim while provider may still accept', async () => {
  const db = database(); let accepted = 0;
  let finish!: () => void;
  const provider = new Promise<void>((resolve) => { finish = () => { accepted++; resolve(); }; });
  await assert.rejects(dispatchClaimedReminder(db as never, occurrence, async () => {
    await Promise.race([provider, Promise.reject(new Error('timeout'))]);
  }));
  finish(); await provider;
  let retried = 0;
  assert.equal(await dispatchClaimedReminder(db as never, occurrence, async () => { retried++; }), false);
  assert.equal(accepted, 1);
  assert.equal(retried, 0);
});
