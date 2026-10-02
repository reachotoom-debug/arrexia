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
