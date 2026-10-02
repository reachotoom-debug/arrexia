import assert from 'node:assert/strict';
import { it } from 'node:test';
import '@/lib/test/nodeTestSetup';
import { renderPaidSubscriptionRenewedEmail, renderAnnualRenewalReminderEmail } from '@/lib/email/templates';
import { hasWorkspacePaidConversion } from '@/lib/billing/trialPaidConversion';
const context = { workspaceName: '<Acme>', workspaceUrl: 'https://fixture.invalid/ws', ownerDisplayName: 'Ada Lovelace', planName: 'Pro', billingIntervalLabel: 'Monthly', periodStartsAt: '2025-01-01', periodEndsAt: '2025-02-01', paidAmountLabel: '$29.50 USD' };
it('renewal confirms actual paid period and total without claiming next renewal', () => {
  const email = renderPaidSubscriptionRenewedEmail(context);
  assert.match(email.text, /renewed successfully/);
  assert.match(email.text, /Jan 1, 2025/);
  assert.match(email.text, /Feb 1, 2025/);
  assert.match(email.text, /\$29.50 USD/);
  assert.match(email.html, /&lt;Acme&gt;/);
  assert.match(email.text, /Hello Ada,/);
  assert.doesNotMatch(email.text, /Next renewal/);
});
it('renewal omits unavailable dates and totals', () => {
  const email = renderPaidSubscriptionRenewedEmail({ ...context, periodStartsAt: null, periodEndsAt: null, paidAmountLabel: null });
  assert.doesNotMatch(email.text, /Amount paid|Period starts|Period ends|undefined|null|—/);
});
it('annual reminder describes approaching date and links billing without fixed charge', () => {
  const email = renderAnnualRenewalReminderEmail({ ...context, renewalDate: '2026-11-01', billingUrl: 'https://fixture.invalid/billing' });
  assert.match(email.text, /approaching/);
  assert.match(email.text, /Nov 1, 2026/);
  assert.match(email.text, /https:\/\/fixture.invalid\/billing/);
  assert.doesNotMatch(email.text, /\$29.50|charged successfully|renewed successfully/);
});
function adminWithHistory(history: unknown[], error: unknown = null) {
  let filter = '';
  const builder = {
    select: () => builder, eq: () => builder,
    in: (_column: string, keys: string[]) => { filter = keys.join(','); return builder; },
    or: (query: string) => { filter = query; return builder; },
    limit: async () => ({ data: history.filter((raw) => {
      const key = (raw as { event_key?: string }).event_key ?? 'paid_subscription_activated';
      return filter.includes(key) || (filter.includes('event_key.like.paid_subscription_renewed:%') && key.startsWith('paid_subscription_renewed:'));
    }), error }),
  };
  return { from: (table: string) => { assert.equal(table, 'workspace_paid_lifecycle_events'); return builder; } } as never;
}
it('former Paddle conversion suppresses even canceled with preserved trial dates', async () => {
  assert.equal(await hasWorkspacePaidConversion('ws', adminWithHistory([]), { payment_provider: 'paddle', provider_subscription_id: null }), true);
  assert.equal(await hasWorkspacePaidConversion('ws', adminWithHistory([]), { payment_provider: 'manual', provider_subscription_id: 'sub_old' }), true);
});
it('manual standalone legacy plan trials remain eligible without paid history', async () => {
  assert.equal(await hasWorkspacePaidConversion('ws', adminWithHistory([]), { payment_provider: 'manual', provider_subscription_id: null }), false);
});
it('prior paid ledger intent suppresses after provider changed', async () => {
  assert.equal(await hasWorkspacePaidConversion('ws', adminWithHistory([{ id: 'prior-paid' }]), { payment_provider: 'manual', provider_subscription_id: null }), true);
});
it('paid history lookup failure fails closed rather than permitting trial email', async () => {
  await assert.rejects(hasWorkspacePaidConversion('ws', adminWithHistory([], { message: 'database unavailable' }), {}), /paid conversion/);
});

it('immediate delivery suppresses canceled former Paddle subscription with preserved trial end', async () => {
  const { deliverTrialLifecycleEmail } = await import('@/lib/billing/trialLifecycleDelivery');
  let sends = 0;
  const admin = { from(table: string) {
    assert.equal(table, 'workspace_subscriptions');
    return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: {
      trial_ends_at: '2026-08-01', payment_provider: 'paddle', provider_subscription_id: 'sub_canceled', status: 'canceled'
    }, error: null }) }) }) };
  } } as never;
  const result = await deliverTrialLifecycleEmail('ws', 'trial_expired', {
    admin,
    loadEntitlementFn: async () => ({ state: 'trial_expired' }) as never,
    sendEmailFn: async () => { sends += 1; return { success: true }; },
  }, new Date('2026-08-01T12:00:00Z'));
  assert.deepEqual(result, { ok: true, sent: false, reason: 'paid_conversion' });
  assert.equal(sends, 0);
});
it('immediate delivery consults durable paid history when provider changed', async () => {
  const { deliverTrialLifecycleEmail } = await import('@/lib/billing/trialLifecycleDelivery');
  const history = adminWithHistory([{ id: 'previous-activation' }]);
  const admin = { from(table: string) {
    if (table === 'workspace_subscriptions') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: {
      trial_ends_at: '2026-08-01', payment_provider: 'manual', provider_subscription_id: null
    }, error: null }) }) }) };
    return (history as { from: (table: string) => unknown }).from(table);
  } } as never;
  const result = await deliverTrialLifecycleEmail('ws', 'trial_expired', {
    admin, loadEntitlementFn: async () => ({ state: 'trial_expired' }) as never,
    sendEmailFn: async () => { throw new Error('must not send'); },
  }, new Date('2026-08-01T12:00:00Z'));
  assert.deepEqual(result, { ok: true, sent: false, reason: 'paid_conversion' });
});

for (const status of ['pending', 'sent', 'failed', 'manual_review']) {
  it(`transaction-qualified renewal history suppresses trial for ${status} delivery`, async () => {
    assert.equal(await hasWorkspacePaidConversion('ws', adminWithHistory([
      { id: 'renewal', event_key: 'paid_subscription_renewed:txn_123', metadata: { status } }
    ]), { payment_provider: 'manual', provider_subscription_id: null }), true);
  });
}
