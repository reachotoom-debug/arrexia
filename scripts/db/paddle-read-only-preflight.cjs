// GET-only assessment. Never invoke RPCs, emit credentials, or save raw rows.
const { readFileSync, writeFileSync, mkdirSync } = require('node:fs');
const { resolve } = require('node:path');
const { createHash } = require('node:crypto');
const values = {};
for (const line of readFileSync(process.argv[2], 'utf8').split(/\r?\n/)) {
  const match = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (match) values[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
}
const base = values.NEXT_PUBLIC_SUPABASE_URL;
if (new URL(base).hostname !== 'yisuenreaursmsovsfpf.supabase.co') throw new Error('Unexpected project');
const headers = { apikey: values.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${values.SUPABASE_SERVICE_ROLE_KEY}` };
const evidence = { capturedAt: new Date().toISOString(), project: 'yisuenreaursmsovsfpf', access: 'GET-only Data API; not a catalog-level SQL preflight' };
async function get(path, extra = {}) {
  const response = await fetch(`${base}/rest/v1/${path}`, { method: 'GET', headers: { ...headers, ...extra }, signal: AbortSignal.timeout(20000) });
  if (!response.ok) return { httpStatus: response.status };
  return { rows: await response.json() };
}
function group(rows, fields) {
  const result = {};
  for (const row of rows) { const key = fields.map(field => row[field] ?? 'NULL').join('|'); result[key] = (result[key] ?? 0) + 1; }
  return result;
}
const label = value => createHash('sha256').update(value).digest('hex').slice(0, 16);
(async () => {
  const subs = await get('workspace_subscriptions?select=workspace_id,payment_provider,status,plan,billing_interval,provider_subscription_id,provider_customer_id');
  const plans = await get('workspace_plans?select=workspace_id,plan');
  if (subs.rows) {
    evidence.subscriptionCount = subs.rows.length;
    evidence.subscriptionGroups = group(subs.rows, ['payment_provider', 'status', 'plan', 'billing_interval']);
    const paddle = subs.rows.filter(row => row.payment_provider === 'paddle');
    evidence.paddleWorkspaces = [];
    for (const row of paddle) {
      const assessment = { workspaceReference: label(row.workspace_id), status: row.status, plan: row.plan, interval: row.billing_interval,
        missingCustomer: !row.provider_customer_id, missingSubscription: !row.provider_subscription_id };
      if (values.NEXT_PUBLIC_PADDLE_ENV === 'sandbox' && values.PADDLE_API_KEY && row.provider_subscription_id) {
        const r = await fetch(`https://sandbox-api.paddle.com/subscriptions/${encodeURIComponent(row.provider_subscription_id)}`, {
          method: 'GET', headers: { Authorization: `Bearer ${values.PADDLE_API_KEY}` }, signal: AbortSignal.timeout(20000) });
        if (r.ok) {
          const data = (await r.json()).data;
          assessment.sandboxSubscriptionFound = !!data;
          assessment.customerMatches = data?.customer_id === row.provider_customer_id;
        } else assessment.sandboxLookupHttpStatus = r.status;
      }
      evidence.paddleWorkspaces.push(assessment);
    }
    const identities = group(paddle.filter(row => row.provider_subscription_id), ['provider_subscription_id']);
    evidence.duplicatePaddleIdentities = Object.values(identities).filter(count => count > 1).length;
    evidence.projectionMismatches = plans.rows ? subs.rows.filter(row => plans.rows.some(plan => plan.workspace_id === row.workspace_id && plan.plan !== row.plan)).length : 'not_verified';
  } else evidence.subscriptionRead = subs;
  const events = await get('paddle_webhook_events?select=status,event_type');
  evidence.eventGroups = events.rows ? group(events.rows, ['status', 'event_type']) : events;
  evidence.schemaProbes = {};
  for (const table of ['workspace_subscriptions', 'paddle_webhook_events', 'paddle_subscription_bindings']) {
    const result = await get(`${table}?select=paddle_environment&limit=1`);
    evidence.schemaProbes[table] = result.rows ? { readable: true } : result;
  }
  const migrations = await get('schema_migrations?select=version&order=version.desc&limit=5', { 'Accept-Profile': 'supabase_migrations' });
  evidence.migrationHistory = migrations.rows ?? migrations;
  const api = await get('');
  evidence.visibleRecoveryRpcPaths = api.rows?.paths ? Object.keys(api.rows.paths).filter(path => /rpc_(claim|apply|finish)_paddle_webhook/.test(path)) : [];
  evidence.unverified = ['SQL function bodies/signatures and grants', 'database triggers/RLS and complete schema', 'backup/PITR availability and restore point'];
  const dir = resolve('docs/release-evidence'); mkdirSync(dir, { recursive: true });
  writeFileSync(resolve(dir, 'database-preflight.json'), JSON.stringify(evidence, null, 2) + '\n');
  console.log(JSON.stringify(evidence, null, 2));
})().catch(() => { console.error('Read-only preflight failed; no credentials or response bodies emitted'); process.exitCode = 1; });
