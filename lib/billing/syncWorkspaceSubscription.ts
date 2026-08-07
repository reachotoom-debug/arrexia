import "server-only";

import { isPostgrestMissingTableError } from "@/lib/admin/postgrestErrors";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { WorkspacePlan } from "./plans";
import type { SubscriptionSyncMode } from "./planMutationPolicy";
import {
  buildSubscriptionUpsertPayload,
  type SyncWorkspaceSubscriptionResult,
} from "./subscriptionSyncPayload";
import type { WorkspaceSubscriptionSnapshot } from "./workspaceSubscription";

export {
  ADMIN_FREE_TRIAL_DAYS,
  buildSubscriptionUpsertPayload,
  MANUAL_BILLING_PERIOD_DAYS,
} from "./subscriptionSyncPayload";
export type { SyncWorkspaceSubscriptionResult };

type SubscriptionAdmin = Pick<ReturnType<typeof supabaseAdmin>, "from">;

export async function syncWorkspaceSubscription(
  workspaceId: string,
  targetPlan: WorkspacePlan,
  mode: SubscriptionSyncMode,
  existing: WorkspaceSubscriptionSnapshot | null,
  admin: SubscriptionAdmin = supabaseAdmin(),
  now: Date = new Date()
): Promise<SyncWorkspaceSubscriptionResult> {
  const payload = buildSubscriptionUpsertPayload(
    workspaceId,
    targetPlan,
    mode,
    existing,
    now
  );

  if (!payload) {
    return { ok: true };
  }

  const { error } = await admin.from("workspace_subscriptions").upsert(payload, {
    onConflict: "workspace_id",
  });

  if (error) {
    if (isPostgrestMissingTableError(error)) {
      return { ok: false, reason: "missing_table", error: error.message };
    }
    return { ok: false, reason: "sync_failed", error: error.message };
  }

  return { ok: true };
}
