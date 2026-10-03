# Paddle webhook recovery and ordering

Scope: local repair of webhook retry recovery, identity checks, and atomic billing
transitions. Checkout, prices, trial policy, and paid/past-due entitlement policy
are unchanged. No production migration or deployment was performed.

## Design

- `rpc_claim_paddle_webhook` serializes claims by event ID. Failed events retry
  immediately; processing claims expire after five minutes. A fresh UUID token
  fences each attempt. Only processed/ignored events are permanent duplicates.
- `rpc_apply_paddle_webhook` locks the event, provider subscription identity, and
  workspace. Identity checks, ordering, the existing atomic plan-change RPC,
  provider fields, and ledger completion share one database transaction.
- `rpc_finish_paddle_webhook` can only fail/ignore the current unexpired claim.
  It cannot change a committed event, including after a lost network response.
- Subscription lifecycle snapshots own ongoing billing state. Their order is
  `(occurred_at, status priority, event_id using C collation)`. At equal times,
  canceled > paused > past_due > active > trialing; unrecognized statuses keep
  the existing expired mapping and are ranked conservatively. Event ID is only
  a deterministic final tie-break, not an assertion about provider chronology.
- `transaction.completed` can bootstrap an unbound subscription. Once bound,
  transactions never change billing state, period, plan, or cancellation. They
  can still request the existing deduplicated activation email for an active
  matching plan/interval.
- Historical subscription bindings prevent old subscriptions from taking back a
  workspace. Conflicting customer/workspace hints fail without billing writes.
- A new unbound subscription can replace a canceled/expired Paddle subscription
  only with the same customer and provider creation time strictly later than the
  stored lifecycle timestamp. Any supported lifecycle snapshot can establish it
  so pause/cancel arriving before creation remains authoritative. Existing active
  subscriptions are not automatically replaced. Missing chronology or a pending
  cancellation remains retryable and may require reconciliation.
- A replacement transaction waits for a lifecycle event to establish the new
  binding. It never replaces an existing subscription itself.

## Migration and release prerequisites

New migration: `20260927120000_paddle_atomic_webhook_recovery.sql`. Historical
migrations are unchanged. It adds claim tokens/leases/attempt counts, ordering
metadata, an RLS-protected historical binding table, a unique Paddle subscription
index, and three service-role-only RPCs. Conflicting existing subscription IDs
intentionally make migration fail; reconcile them before release, never merge
tenant records automatically.

For a future approved release, drain/stop old webhook workers before applying the
migration and switching to the new handler. The old handler has unfenced writes
and must not overlap the new one. New code requires this migration and fails
closed if the RPCs are absent. Do not roll back to the old handler with in-flight
claims. Replay failed/stuck notifications after rollout. Historical processed or
ignored events are not automatically reclassified; inspect partial pre-fix writes
and reconcile them explicitly.

Recovery happens on redelivery; this change adds no background replay scheduler.
Provider retries eventually expire, so operational monitoring/manual replay is
still required. Activation email and reminder provisioning remain best effort
after commit; they are not an atomic outbox. Initial unbound checkout metadata
still comes from the existing checkout flow, not a new server-issued checkout
authorization. Existing paused/past-due/trialing entitlement policy is unchanged.

## Local validation

PowerShell, from the application repository:

```powershell
$env:TS_NODE_PROJECT='scripts/tsconfig.json'
node -r ts-node/register/transpile-only -r tsconfig-paths/register --test lib/billing/__tests__/*.test.ts
node --test scripts/tests/paddle-webhook-db.test.cjs
node node_modules/typescript/bin/tsc --noEmit --incremental false
npm run build
```

The PostgreSQL test creates its own temporary cluster on loopback port 55439 and
stops it in teardown. It never loads application connection strings or `.env`
files; inherited PostgreSQL connection options are removed. Set
`PADDLE_TEST_PG_BIN` to an installed PostgreSQL bin directory when necessary.
It tests the actual migration and existing billing RPC against a minimal fixture
schema, not a complete Supabase installation. Temporary data/logs are retained
for debugging. A port conflict fails startup before tests access any database.

Coverage includes failed retries, stale claims and fencing, duplicate/concurrent
delivery, rollback at ledger completion, older/equal-time lifecycle events,
transactions after cancellation/pause, replacement and old-subscription events,
replacement pause before creation, customer/tenant conflicts, role privileges,
trial history preservation, and activation notification ordering. Application
tests additionally cover a lost response after commit.
