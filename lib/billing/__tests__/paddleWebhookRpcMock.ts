// RPC adapter for application tests. Locking/rollback correctness is exercised against
// real PostgreSQL in scripts/tests/paddle-webhook-db.test.cjs, not inferred from this mock.
import { randomUUID } from "node:crypto";
import type { BillingMockState } from "./billingMutationMock";

export function paddleWebhookRpcMock(
  state: BillingMockState, fn: string, p: Record<string, unknown>,
  atomic: (params: Record<string, unknown>) => { data: unknown; error: unknown }
): { data: unknown; error: unknown } | null {
  const eventId = String(p.p_event_id);
  let event = state.paddleWebhookEvents.find(row => row.event_id === eventId);
  const fail = () => ({ data: null, error: { message: "mock webhook failure" } });
  if (fn.startsWith("rpc_") && fn.includes("paddle_webhook") && p.p_environment !== "production") return fail();
  if (fn === "rpc_claim_paddle_webhook") {
    if (event && (event.event_type !== p.p_event_type || event.occurred_at !== p.p_occurred_at)) return fail();
    if (event && ["processed", "ignored"].includes(String(event.status))) {
      return { data: { state: "duplicate", status: event.status, result: event.result }, error: null };
    }
    if (event?.status === "processing" && Number(event.lease_expires_at) > Date.now()) {
      return { data: { state: "busy" }, error: null };
    }
    if (!event) {
      event = { event_id: eventId, event_type: p.p_event_type, occurred_at: p.p_occurred_at, paddle_environment: "production" };
      state.paddleWebhookEvents.push(event);
    }
    Object.assign(event, { status: "processing", claim_token: randomUUID(), lease_expires_at: Date.now() + 300000,
      attempts: Number(event.attempts ?? 0) + 1 });
    return { data: { state: "new", claim_token: event.claim_token }, error: null };
  }
  if (fn !== "rpc_apply_paddle_webhook" && fn !== "rpc_finish_paddle_webhook") return null;
  if (!event || event.status !== "processing" || event.claim_token !== p.p_claim_token || Number(event.lease_expires_at) <= Date.now()) {
    return fn === "rpc_finish_paddle_webhook" ? { data: false, error: null } : fail();
  }
  if (fn === "rpc_finish_paddle_webhook") {
    Object.assign(event, { status: p.p_status, result: p.p_result, lease_expires_at: null });
    return { data: true, error: null };
  }
  const body = p.p_payload as Record<string, unknown>;
  if (body.paddle_environment !== "production") return fail();
  const providerId = String(body.provider_subscription_id);
  const bound = state.paddleBindings.find(row => row.provider_subscription_id === providerId);
  const current = state.subscriptions.find(row => row.payment_provider === "paddle" && row.provider_subscription_id === providerId);
  const workspaceId = String(bound?.workspace_id ?? current?.workspace_id ?? body.workspace_id);
  if ((body.workspace_id && body.workspace_id !== workspaceId) ||
      (bound?.provider_customer_id && bound.provider_customer_id !== body.provider_customer_id) ||
      !state.workspaces.some(row => row.id === workspaceId)) return fail();
  const existing = state.subscriptions.find(row => row.workspace_id === workspaceId);
  if (existing?.payment_provider === "paddle" && existing.paddle_environment !== "production") return fail();
  if (existing?.payment_provider !== "paddle" && ["active","past_due"].includes(existing?.status ?? "") &&
      ["starter","pro","business"].includes(existing?.plan ?? "")) return fail();
  const transaction = event.event_type === "transaction.completed";
  let reason: string | undefined;
  let replacement = false;
  if (!bound && existing?.payment_provider === "paddle" && existing.provider_subscription_id && existing.provider_subscription_id !== providerId) {
    if (transaction) return fail();
    const created = Date.parse(String(body.provider_created_at));
    if (existing.provider_customer_id !== body.provider_customer_id || !Number.isFinite(created) || !existing.provider_last_event_at ||
        created <= Date.parse(existing.provider_last_event_at) || Date.parse(String(event.occurred_at)) < created ||
        !["cancelled", "expired"].includes(existing.status)) return fail();
    replacement = true;
  }
  if ((!replacement && existing?.provider_subscription_id && (existing.payment_provider !== "paddle" || existing.provider_subscription_id !== providerId)) ||
      (bound && existing?.provider_subscription_id !== providerId)) reason = "subscription_identity_conflict";
  else if (existing?.payment_provider === "paddle" && existing.provider_customer_id && existing.provider_customer_id !== body.provider_customer_id) return fail();
  else if (transaction && (existing?.provider_subscription_id || existing?.payment_provider === "paddle")) reason = "transaction_subscription_already_bound";
  const rank: Record<string, number> = { canceled: 60, paused: 50, past_due: 40, active: 20, trialing: 10 };
  const priority = rank[String(body.provider_status)] ?? 70;
  const storedRank = existing?.provider_last_event_priority || ({ cancelled: 60, past_due: 50, active: 20, trial: 10 }[existing?.status ?? ""] ?? 70);
  const incoming = Date.parse(String(event.occurred_at));
  const stored = existing?.provider_last_event_at ? Date.parse(existing.provider_last_event_at) : null;
  if (!reason && !transaction && stored !== null && (incoming < stored ||
      (incoming === stored && (priority < storedRank || (priority === storedRank && eventId <= (existing?.provider_last_event_id ?? "")))))) {
    reason = "stale_event_ignored";
  }
  if (!reason) {
    const snapshot = structuredClone({ plans: state.plans, subscriptions: state.subscriptions });
    const result = atomic({ p_workspace_id: workspaceId, p_target_plan: body.plan, p_subscription_plan: body.plan,
      p_subscription_status: body.status, p_payment_provider: "paddle", p_billing_interval: body.billing_interval,
      p_invoice_limit_monthly: body.invoice_limit_monthly, p_client_limit: body.client_limit,
      p_trial_starts_at: existing?.trial_starts_at ?? null, p_trial_ends_at: existing?.trial_ends_at ?? null,
      p_current_period_starts_at: body.period_starts_at ?? (replacement ? null : existing?.current_period_starts_at) ?? null,
      p_current_period_ends_at: body.period_ends_at ?? (replacement ? null : existing?.current_period_ends_at) ?? null,
      p_cancel_at_period_end: body.cancel_at_period_end });
    if (result.error || state.atomicRpcInvalidSnapshot || state.paddleCompletionShouldFail) {
      state.plans = snapshot.plans; state.subscriptions = snapshot.subscriptions;
      return fail();
    }
    const subscription = state.subscriptions.find(row => row.workspace_id === workspaceId)!;
    Object.assign(subscription, { paddle_environment: "production", provider_subscription_id: providerId, provider_customer_id: body.provider_customer_id });
    if (!transaction) Object.assign(subscription, { provider_last_event_at: event.occurred_at,
      provider_last_event_priority: priority, provider_last_event_id: eventId });
    if (!bound) state.paddleBindings.push({ provider_subscription_id: providerId, workspace_id: workspaceId,
      provider_customer_id: String(body.provider_customer_id) });
  }
  const action = reason ? "ignored" : "fulfilled";
  reason ??= transaction ? "transaction_completed_synced" : "subscription_synced";
  Object.assign(event, { status: action === "ignored" ? "ignored" : "processed", result: reason,
    workspace_id: workspaceId, provider_subscription_id: providerId, lease_expires_at: null });
  return { data: { action, reason, workspace_id: workspaceId,
    notify_activation: transaction && (action === "fulfilled" || (reason === "transaction_subscription_already_bound" &&
      existing?.status === "active" && existing.plan === body.plan && existing.billing_interval === body.billing_interval)),
    period_ends_at: state.subscriptions.find(row => row.workspace_id === workspaceId)?.current_period_ends_at }, error: null };
}
