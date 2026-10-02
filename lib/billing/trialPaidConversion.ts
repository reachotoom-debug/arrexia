import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
export type PaidConversionIdentity = { payment_provider?: string | null; provider_subscription_id?: string | null };
/** Paid intent is durable evidence even when canceled or delivery has not succeeded. */
export async function hasWorkspacePaidConversion(
  workspaceId: string,
  admin: Pick<ReturnType<typeof supabaseAdmin>, "from">,
  identity: PaidConversionIdentity
): Promise<boolean> {
  if (identity.payment_provider === "paddle" || identity.provider_subscription_id?.trim()) return true;
  const { data, error } = await admin.from("workspace_paid_lifecycle_events")
    .select("id").eq("workspace_id", workspaceId)
    .or("event_key.eq.paid_subscription_activated,event_key.eq.paid_subscription_renewed,event_key.like.paid_subscription_renewed:%")
    .limit(1);
  if (error) throw new Error(`Failed to check paid conversion: ${error.message}`);
  return Boolean(data?.length);
}

