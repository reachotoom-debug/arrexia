import "server-only";

import { isPostgrestMissingTableError } from "@/lib/admin/postgrestErrors";
import { supabaseAdmin } from "@/lib/supabase/admin";

import {
  loadWorkspaceSubscription,
  type WorkspaceSubscriptionSnapshot,
} from "../../workspaceSubscription";

type BillingAdmin = Pick<ReturnType<typeof supabaseAdmin>, "from">;

export async function workspaceExists(
  workspaceId: string,
  admin: BillingAdmin = supabaseAdmin()
): Promise<boolean> {
  const { data, error } = await admin
    .from("workspaces")
    .select("id")
    .eq("id", workspaceId)
    .maybeSingle();

  if (error) {
    if (isPostgrestMissingTableError(error)) {
      return false;
    }
    throw new Error(`Failed to verify workspace: ${error.message}`);
  }

  return Boolean(data?.id);
}

export async function findWorkspaceIdByProviderSubscriptionId(
  providerSubscriptionId: string,
  admin: BillingAdmin = supabaseAdmin()
): Promise<string | null> {
  const { data, error } = await admin
    .from("workspace_subscriptions")
    .select("workspace_id")
    .eq("provider_subscription_id", providerSubscriptionId)
    .maybeSingle();

  if (error) {
    if (isPostgrestMissingTableError(error)) {
      return null;
    }
    if (error.message?.includes("provider_subscription_id")) {
      return null;
    }
    throw new Error(`Failed to resolve workspace by provider subscription: ${error.message}`);
  }

  return typeof data?.workspace_id === "string" ? data.workspace_id : null;
}

export async function loadWorkspaceSubscriptionWithProviders(
  workspaceId: string,
  admin: BillingAdmin = supabaseAdmin()
): Promise<
  | (WorkspaceSubscriptionSnapshot & {
      providerCustomerId: string | null;
      providerSubscriptionId: string | null;
      paymentProvider: string | null;
      providerLastEventAt: string | null;
    })
  | null
> {
  const { data, error } = await admin
    .from("workspace_subscriptions")
    .select(
      "status, plan, billing_interval, trial_starts_at, trial_ends_at, trial_consumed_at, current_period_starts_at, current_period_ends_at, provider_customer_id, provider_subscription_id, payment_provider, provider_last_event_at"
    )
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (error) {
    if (isPostgrestMissingTableError(error)) {
      return null;
    }
    throw new Error(`Failed to load workspace subscription providers: ${error.message}`);
  }

  if (!data) {
    return null;
  }

  const base = await loadWorkspaceSubscription(workspaceId, admin);
  if (!base) {
    return null;
  }

  return {
    ...base,
    providerCustomerId:
      typeof data.provider_customer_id === "string" ? data.provider_customer_id : null,
    providerSubscriptionId:
      typeof data.provider_subscription_id === "string"
        ? data.provider_subscription_id
        : null,
    paymentProvider:
      typeof data.payment_provider === "string" ? data.payment_provider : null,
    providerLastEventAt:
      typeof data.provider_last_event_at === "string" ? data.provider_last_event_at : null,
  };
}

export async function persistPaddleProviderLastEventAt(
  workspaceId: string,
  occurredAt: string,
  admin: BillingAdmin = supabaseAdmin()
): Promise<void> {
  const incomingMs = Date.parse(occurredAt);
  if (!Number.isFinite(incomingMs)) {
    return;
  }

  const { data, error: readError } = await admin
    .from("workspace_subscriptions")
    .select("provider_last_event_at")
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (readError) {
    if (isPostgrestMissingTableError(readError)) {
      return;
    }
    if (readError.message?.includes("provider_last_event_at")) {
      return;
    }
    throw new Error(`Failed to read provider_last_event_at: ${readError.message}`);
  }

  const storedAt =
    typeof data?.provider_last_event_at === "string" ? data.provider_last_event_at : null;
  if (storedAt) {
    const storedMs = Date.parse(storedAt);
    if (Number.isFinite(storedMs) && incomingMs < storedMs) {
      return;
    }
  }

  const { error } = await admin
    .from("workspace_subscriptions")
    .update({ provider_last_event_at: occurredAt })
    .eq("workspace_id", workspaceId);

  if (error) {
    if (isPostgrestMissingTableError(error)) {
      return;
    }
    if (error.message?.includes("provider_last_event_at")) {
      return;
    }
    throw new Error(`Failed to persist provider_last_event_at: ${error.message}`);
  }
}

export async function persistPaddleProviderIdentity(
  workspaceId: string,
  input: {
    providerCustomerId?: string | null;
    providerSubscriptionId?: string | null;
  },
  admin: BillingAdmin = supabaseAdmin()
): Promise<void> {
  const update: Record<string, string> = { payment_provider: "paddle" };

  if (input.providerCustomerId) {
    update.provider_customer_id = input.providerCustomerId;
  }
  if (input.providerSubscriptionId) {
    update.provider_subscription_id = input.providerSubscriptionId;
  }

  const { error } = await admin
    .from("workspace_subscriptions")
    .update(update)
    .eq("workspace_id", workspaceId);

  if (error) {
    throw new Error(`Failed to persist Paddle provider identity: ${error.message}`);
  }
}
