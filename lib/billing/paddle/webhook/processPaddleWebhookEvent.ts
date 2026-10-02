import "server-only";
import { EventName, type EventEntity } from "@paddle/paddle-node-sdk";
import { getPaddleEnvironment } from "../env.server";
import { resolvePlanFromPaddlePriceId } from "../priceCatalog";
import { getPlanStorageLimits } from "../../plans";
import { provisionDefaultReminderSetupSafe } from "@/lib/reminders/provisionDefaultSetup";
import { applyClaimedPaddleSubscriptionFulfillment } from "./applyPaddleSubscriptionFulfillment";
import { mapPaddleSubscriptionToArrexiaState } from "./mapPaddleSubscriptionStatus";
import { extractBillingPeriod, extractPrimaryPaddlePriceId, parsePaddleCheckoutCustomData } from "./parsePaddleWebhookPayload";
import { beginPaddleWebhookProcessing, finalizePaddleWebhookProcessing } from "./paddleWebhookIdempotency";

export type ProcessPaddleWebhookResult =
  | { ok: true; action: "fulfilled" | "ignored"; reason: string; workspaceId?: string; duplicate?: boolean; notificationId?: string }
  | { ok: false; action: "failed"; reason: string; retryable: boolean };
export const HANDLED_SUBSCRIPTION_EVENTS = new Set<string>([
  EventName.SubscriptionCreated, EventName.SubscriptionActivated, EventName.SubscriptionUpdated,
  EventName.SubscriptionCanceled, EventName.SubscriptionPastDue, EventName.SubscriptionPaused, EventName.SubscriptionResumed,
]);
function readString(data: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = data[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

/** Only call with a signature-verified event. Every entry path claims and fences its writes. */
export async function processPaddleWebhookEvent(event: EventEntity): Promise<ProcessPaddleWebhookResult> {
  // Production-first: Sandbox checkout may be exercised, but never mutates the
  // shared production projection, ledger, trial history or notification state.
  if (getPaddleEnvironment() !== "production") {
    return { ok: false, action: "failed", reason: "production_billing_only", retryable: false };
  }
  let claimToken: string | undefined;
  try {
    const claim = await beginPaddleWebhookProcessing(event);
    if (!claim.ok) return { ok: false, action: "failed", reason: claim.error, retryable: true };
    if (claim.state === "duplicate") {
      return { ok: true, action: "ignored", reason: claim.result ?? claim.status, duplicate: true };
    }
    claimToken = claim.claimToken;
    const ignore = async (reason: string): Promise<ProcessPaddleWebhookResult> => {
      await finalizePaddleWebhookProcessing({ ...event, claimToken: claim.claimToken, status: "ignored", result: reason });
      return { ok: true, action: "ignored", reason };
    };
    const transaction = event.eventType === EventName.TransactionCompleted;
    if (!transaction && !HANDLED_SUBSCRIPTION_EVENTS.has(event.eventType)) return await ignore("unsupported_event_type");
    const data = event.data as unknown as Record<string, unknown>;
    const rawStatus = readString(data, "status");
    if (transaction && rawStatus !== "completed") return await ignore("transaction_not_completed");
    if (!rawStatus) throw new Error("subscription_missing_status");
    const providerSubscriptionId = transaction ? readString(data, "subscription_id", "subscriptionId") : readString(data, "id");
    const customerId = readString(data, "customer_id", "customerId");
    if (!providerSubscriptionId || !customerId) throw new Error("provider_identity_missing");
    const priceId = extractPrimaryPaddlePriceId(data.items);
    if (!priceId) throw new Error("paddle_price_missing");
    const environment = getPaddleEnvironment();
    if (!environment) throw new Error("paddle_environment_missing");
    const catalog = resolvePlanFromPaddlePriceId(priceId, environment);
    if (!catalog.ok) throw new Error("unknown_paddle_price");
    const custom = parsePaddleCheckoutCustomData(data.custom_data ?? data.customData);
    const scheduled = data.scheduled_change ?? data.scheduledChange;
    const mapped = mapPaddleSubscriptionToArrexiaState({
      paddleStatus: transaction ? "active" : rawStatus,
      scheduledChangeAction: scheduled && typeof scheduled === "object" ? readString(scheduled as Record<string, unknown>, "action") : null,
    });
    const period = extractBillingPeriod(data);
    const details = data.details as Record<string, unknown> | undefined;
    const totals = details?.totals as Record<string, unknown> | undefined;
    const limits = getPlanStorageLimits(catalog.plan);
    const fulfilled = await applyClaimedPaddleSubscriptionFulfillment(event.eventId, claimToken, {
      workspace_id: custom.workspaceId ?? null, provider_subscription_id: providerSubscriptionId, provider_customer_id: customerId,
      paddle_environment: environment,
      provider_created_at: transaction ? null : readString(data, "created_at", "createdAt"),
      plan: catalog.plan, billing_interval: catalog.interval, status: mapped.status, provider_status: rawStatus,
      invoice_limit_monthly: limits.invoice_limit_monthly, client_limit: limits.client_limit,
      period_starts_at: period.startsAt, period_ends_at: period.endsAt, cancel_at_period_end: mapped.cancelAtPeriodEnd,
      scheduled_change_action: scheduled && typeof scheduled === "object" ? readString(scheduled as Record<string, unknown>, "action") : null,
      transaction_id: transaction ? readString(data, "id") : null,
      transaction_origin: transaction ? readString(data, "origin") : null,
      transaction_totals: transaction ? { total: totals ? readString(totals, "total") : null, currency_code: readString(data, "currency_code", "currencyCode") } : null,
    });
    // Optional side effects cannot change a committed terminal ledger row.
    if (fulfilled.action === "fulfilled") {
      await provisionDefaultReminderSetupSafe({ workspaceId: fulfilled.workspaceId, plan: catalog.plan }).catch(() => undefined);
    }
    // Notification intent is committed by the RPC, never created by a detached task.
    return { ok: true, action: fulfilled.action, reason: fulfilled.reason, workspaceId: fulfilled.workspaceId, notificationId: fulfilled.notificationId };
  } catch {
    // A lost RPC response after commit cannot downgrade the terminal row. Redelivery deduplicates.
    if (claimToken) await finalizePaddleWebhookProcessing({ ...event, claimToken, status: "failed", result: "webhook_processing_failed" }).catch(() => undefined);
    return { ok: false, action: "failed", reason: "webhook_processing_failed", retryable: true };
  }
}
