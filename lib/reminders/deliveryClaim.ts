import type { SupabaseClient } from '@supabase/supabase-js';

export interface ReminderDeliveryClaim {
  workspaceId: string;
  invoiceId: string;
  ruleId: string | null;
  scheduledDate: string | null;
  evaluationDate: string;
  source: 'manual' | 'auto_cron';
}

/** Durable rule-occurrence and manual invoice/day barriers. Claims never expire.
 * Manual sends on a later workspace day are new attempts and remain allowed.
 * Reconcile delivery before removing a claim; timeouts are not proof of non-delivery. */
export async function dispatchClaimedReminder(
  supabase: SupabaseClient,
  claim: ReminderDeliveryClaim,
  send: () => Promise<void>
): Promise<boolean> {
  const { data, error } = await supabase.rpc('claim_reminder_delivery', {
    p_workspace_id: claim.workspaceId,
    p_invoice_id: claim.invoiceId,
    p_rule_id: claim.ruleId,
    p_scheduled_date: claim.scheduledDate,
    p_evaluation_date: claim.evaluationDate,
    p_source: claim.source,
  });
  if (error) throw new Error(`Reminder delivery claim unavailable: ${error.message}`);
  if (data !== true) return false;
  await send();
  return true;
}
