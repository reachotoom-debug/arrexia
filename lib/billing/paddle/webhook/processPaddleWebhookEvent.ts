import "server-only";

import type { EventEntity } from "@paddle/paddle-node-sdk";
import { EventName } from "@paddle/paddle-node-sdk";

import { getPaddleEnvironment } from "../env.server";
import { resolvePlanFromPaddlePriceId } from "../priceCatalog";
import { applyPaddleSubscriptionFulfillment } from "./applyPaddleSubscriptionFulfillment";
import { mapPaddleSubscriptionToArrexiaState } from "./mapPaddleSubscriptionStatus";
import {
  extractBillingPeriod,
  extractPrimaryPaddlePriceId,
  parsePaddleCheckoutCustomData,
} from "./parsePaddleWebhookPayload";
import { evaluatePaddleLifecycleEventOrdering } from "./paddleLifecycleOrdering";
import { enqueuePaidSubscriptionActivatedEmail } from "../../paidLifecycleScheduling";
import {
  findWorkspaceIdByProviderSubscriptionId,
  loadWorkspaceSubscriptionWithProviders,
  persistPaddleProviderLastEventAt,
  workspaceExists,
} from "./resolvePaddleWorkspace";

export type ProcessPaddleWebhookResult =
  | { ok: true; action: "fulfilled" | "ignored"; reason: string; workspaceId?: string }
  | { ok: false; action: "failed"; reason: string; retryable: boolean };

const HANDLED_SUBSCRIPTION_EVENTS = new Set<string>([
  EventName.SubscriptionCreated,
  EventName.SubscriptionActivated,
  EventName.SubscriptionUpdated,
  EventName.SubscriptionCanceled,
  EventName.SubscriptionPastDue,
  EventName.SubscriptionPaused,
  EventName.SubscriptionResumed,
]);

function readScheduledChangeAction(data: Record<string, unknown>): string | null {
  const scheduled =
    data.scheduled_change ?? data.scheduledChange ?? null;
  if (!scheduled || typeof scheduled !== "object") {
    return null;
  }
  const action = (scheduled as Record<string, unknown>).action;
  return typeof action === "string" ? action : null;
}

function readStringField(data: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = data[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

async function resolveWorkspaceForSubscriptionEvent(
  data: Record<string, unknown>
): Promise<string | null> {
  const providerSubscriptionId = readStringField(data, "id");
  if (providerSubscriptionId) {
    const byProvider = await findWorkspaceIdByProviderSubscriptionId(providerSubscriptionId);
    if (byProvider) {
      return byProvider;
    }
  }

  const customData = parsePaddleCheckoutCustomData(data.custom_data ?? data.customData);
  if (customData.workspaceId && (await workspaceExists(customData.workspaceId))) {
    return customData.workspaceId;
  }

  return null;
}

async function syncSubscriptionLifecycleEvent(
  event: EventEntity
): Promise<ProcessPaddleWebhookResult> {
  const data = event.data as unknown as Record<string, unknown>;
  const workspaceId = await resolveWorkspaceForSubscriptionEvent(data);
  if (!workspaceId) {
    return {
      ok: true,
      action: "ignored",
      reason: "subscription_event_workspace_unresolved",
    };
  }

  const priceId = extractPrimaryPaddlePriceId(data.items);
  if (!priceId) {
    return { ok: true, action: "ignored", reason: "subscription_event_missing_price" };
  }

  const environment = getPaddleEnvironment() ?? "sandbox";
  const catalogResolution = resolvePlanFromPaddlePriceId(priceId, environment);
  if (!catalogResolution.ok) {
    return { ok: true, action: "ignored", reason: "unknown_paddle_price" };
  }

  const paddleStatus = readStringField(data, "status") ?? "active";
  const mapped = mapPaddleSubscriptionToArrexiaState({
    paddleStatus,
    scheduledChangeAction: readScheduledChangeAction(data),
  });
  const period = extractBillingPeriod(data);
  const existing = await loadWorkspaceSubscriptionWithProviders(workspaceId);

  const ordering = evaluatePaddleLifecycleEventOrdering({
    incomingOccurredAt: event.occurredAt,
    storedProviderLastEventAt: existing?.providerLastEventAt ?? null,
    currentStatus: existing?.status ?? "trial",
    incomingStatus: mapped.status,
  });

  if (ordering.action === "ignore") {
    return {
      ok: true,
      action: "ignored",
      reason: ordering.reason,
      workspaceId,
    };
  }

  const fulfillment = await applyPaddleSubscriptionFulfillment({
    workspaceId,
    targetPlan: catalogResolution.plan,
    billingInterval: catalogResolution.interval,
    status: mapped.status,
    periodStartsAt: period.startsAt ?? existing?.currentPeriodStartsAt ?? null,
    periodEndsAt: period.endsAt ?? existing?.currentPeriodEndsAt ?? null,
    cancelAtPeriodEnd: mapped.cancelAtPeriodEnd,
    providerCustomerId: readStringField(data, "customer_id", "customerId"),
    providerSubscriptionId: readStringField(data, "id"),
    existingSubscription: existing,
  });

  if (!fulfillment.ok) {
    return {
      ok: false,
      action: "failed",
      reason: fulfillment.code,
      retryable: true,
    };
  }

  await persistPaddleProviderLastEventAt(workspaceId, event.occurredAt);

  return {
    ok: true,
    action: "fulfilled",
    reason: "subscription_synced",
    workspaceId,
  };
}

async function handleTransactionCompleted(
  event: EventEntity
): Promise<ProcessPaddleWebhookResult> {
  const data = event.data as unknown as Record<string, unknown>;
  const transactionStatus = readStringField(data, "status");
  if (transactionStatus && transactionStatus !== "completed" && transactionStatus !== "paid") {
    return { ok: true, action: "ignored", reason: "transaction_not_completed" };
  }

  const customData = parsePaddleCheckoutCustomData(data.custom_data ?? data.customData);
  if (!customData.workspaceId || !(await workspaceExists(customData.workspaceId))) {
    return { ok: true, action: "ignored", reason: "transaction_workspace_unresolved" };
  }

  const priceId = extractPrimaryPaddlePriceId(data.items);
  if (!priceId) {
    return { ok: true, action: "ignored", reason: "transaction_missing_price" };
  }

  const environment = getPaddleEnvironment() ?? "sandbox";
  const catalogResolution = resolvePlanFromPaddlePriceId(priceId, environment);
  if (!catalogResolution.ok) {
    return { ok: true, action: "ignored", reason: "unknown_paddle_price" };
  }

  const period = extractBillingPeriod(data);
  const existing = await loadWorkspaceSubscriptionWithProviders(customData.workspaceId);

  const fulfillment = await applyPaddleSubscriptionFulfillment({
    workspaceId: customData.workspaceId,
    targetPlan: catalogResolution.plan,
    billingInterval: catalogResolution.interval,
    status: "active",
    periodStartsAt: period.startsAt ?? existing?.currentPeriodStartsAt ?? null,
    periodEndsAt: period.endsAt ?? existing?.currentPeriodEndsAt ?? null,
    cancelAtPeriodEnd: false,
    providerCustomerId: readStringField(data, "customer_id", "customerId"),
    providerSubscriptionId: readStringField(data, "subscription_id", "subscriptionId"),
    existingSubscription: existing,
  });

  if (!fulfillment.ok) {
    return {
      ok: false,
      action: "failed",
      reason: fulfillment.code,
      retryable: true,
    };
  }

  const providerSubscriptionId = readStringField(data, "subscription_id", "subscriptionId");
  if (providerSubscriptionId) {
    enqueuePaidSubscriptionActivatedEmail({
      workspaceId: customData.workspaceId,
      providerSubscriptionId,
      plan: catalogResolution.plan,
      billingInterval: catalogResolution.interval,
      periodEndsAt: period.endsAt ?? existing?.currentPeriodEndsAt ?? null,
    });
  }

  return {
    ok: true,
    action: "fulfilled",
    reason: "transaction_completed_synced",
    workspaceId: customData.workspaceId,
  };
}

export async function processPaddleWebhookEvent(
  event: EventEntity
): Promise<ProcessPaddleWebhookResult> {
  if (event.eventType === EventName.TransactionCompleted) {
    return handleTransactionCompleted(event);
  }

  if (HANDLED_SUBSCRIPTION_EVENTS.has(event.eventType)) {
    return syncSubscriptionLifecycleEvent(event);
  }

  return { ok: true, action: "ignored", reason: "unsupported_event_type" };
}

export { HANDLED_SUBSCRIPTION_EVENTS };
export { evaluatePaddleLifecycleEventOrdering } from "./paddleLifecycleOrdering";
